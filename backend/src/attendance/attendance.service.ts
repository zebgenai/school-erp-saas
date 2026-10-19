import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus, Prisma, UserRole } from '@prisma/client';
import { resolvePagination } from '../common/dto/pagination-query.dto';
import { paginatedResult } from '../common/utils/paginated-result';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEngineService } from '../notifications/notification-engine.service';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { TodayRosterQueryDto } from './dto/today-roster-query.dto';
import { BulkAttendanceDto } from './dto/bulk-attendance.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { QrScanDto } from './dto/qr-scan.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { resolveQrAttendanceStatus } from './qr-status';
import { normalizeScannedQr } from '../id-cards/qr-token';
import {
  DEFAULT_SCHOOL_TIMEZONE,
  localDateString,
  resolveSchoolTimeZone,
} from '../common/utils/school-time';

const attendanceInclude = {
  student: true,
  class: true,
  section: true,
  markedBy: { select: { id: true, name: true, email: true, role: true } },
} satisfies Prisma.StudentAttendanceInclude;

export const QR_SCAN_REMARKS = 'QR_SCAN';
/**
 * Student QR is school-wide for these roles. Manual teacher marking is
 * timetable-scoped; scanning is not. Changing that is a product decision.
 */
const STUDENT_QR_ROLES = new Set<UserRole>([
  UserRole.SCHOOL_ADMIN,
  UserRole.TEACHER,
  UserRole.ATTENDANCE_SCANNER,
]);
/** Active students returned by the class register in one response. Above this, mark by section. */
export const ATTENDANCE_REGISTER_LIMIT = 5000;
const QR_SCAN_DEBOUNCE_MS = 3000;

type AttendanceWrite = {
  createdCount: number;
  updatedCount: number;
  absentNotifications: Array<{ studentId: string; attendanceId: string }>;
};

@Injectable()
export class AttendanceService {
  private readonly recentQrScans = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private readonly notificationEngine: NotificationEngineService,
  ) {}

  async mark(dto: MarkAttendanceDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);
    const student = await this.assertStudentBelongsToSchool(dto.studentId, schoolId);
    this.assertStudentActive(student);
    if (!student.classId) {
      throw new BadRequestException('Student is not assigned to a class');
    }
    await this.assertTeacherMayMarkClass(currentUser, schoolId, student.classId);
    const date = this.normalizeDate(dto.date);
    const data = {
      status: dto.status,
      ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
      classId: student.classId,
      sectionId: student.sectionId,
      markedById: currentUser.id,
    };

    const saved = await this.commitAttendanceWrite(async (tx) => {
      const locked = await this.lockAttendanceByStudent(tx, schoolId, date, [dto.studentId]);
      const existing = locked.get(dto.studentId);
      const previousStatus = existing?.status ?? null;
      const row = existing
        ? await tx.studentAttendance.update({
            where: { id: existing.id },
            data,
            include: attendanceInclude,
          })
        : await tx.studentAttendance.create({
            data: {
              schoolId,
              studentId: dto.studentId,
              date,
              ...data,
            },
            include: attendanceInclude,
          });
      return { row, previousStatus };
    });

    this.dispatchAbsentTransition(
      schoolId,
      dto.studentId,
      date,
      saved.row.id,
      dto.status,
      saved.previousStatus,
    );

    return saved.row;
  }

  async markBulk(dto: BulkAttendanceDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);
    await this.assertClassBelongsToSchool(dto.classId, schoolId);

    if (dto.sectionId) {
      await this.assertSectionBelongsToSchool(dto.sectionId, schoolId, dto.classId);
    }
    await this.assertTeacherMayMarkClass(currentUser, schoolId, dto.classId);

    const date = this.normalizeDate(dto.date);
    const prepared = await this.prepareBulkRecords(dto, schoolId);
    const written = await this.writeBulkAttendance(prepared, schoolId, date, currentUser.id);

    for (const notice of written.absentNotifications) {
      this.notificationEngine.dispatch(() =>
        this.notificationEngine.emitAttendanceAbsent(
          schoolId,
          notice.studentId,
          date.toISOString(),
          notice.attendanceId,
        ),
      );
    }

    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitAttendanceSubmitted(
        schoolId,
        dto.classId,
        dto.sectionId,
        date.toISOString(),
        dto.records.length,
        currentUser.id,
      ),
    );

    return { createdCount: written.createdCount, updatedCount: written.updatedCount };
  }

  async markFromQrScan(dto: QrScanDto, currentUser: CurrentUser, now: Date = new Date()) {
    // School-wide for SCHOOL_ADMIN, TEACHER, and ATTENDANCE_SCANNER. Not timetable-scoped.
    // SUPER_ADMIN has no scanner school context. Other roles match the controller deny list.
    // Scans create PRESENT or LATE only and do not send absence notifications.
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'QR attendance scanning is limited to school staff with school context',
      );
    }
    if (!STUDENT_QR_ROLES.has(currentUser.role)) {
      throw new ForbiddenException('Student QR scanning is not available for your role.');
    }
    const schoolId = this.resolveSchoolId(currentUser);
    const token = normalizeScannedQr(dto.token);
    if (!token) {
      return this.qrResult('INVALID', 'Invalid or inactive QR code.');
    }

    const card = await this.prisma.studentIdCard.findUnique({
      where: { qrToken: token },
      include: { student: true },
    });

    if (!card || card.schoolId !== schoolId) {
      return this.qrResult('INVALID', 'Invalid or inactive QR code.');
    }
    if (!card.isActive || card.revokedAt) {
      return this.qrResult('REVOKED', 'This ID card has been revoked.');
    }
    if (card.student.schoolId !== schoolId) {
      return this.qrResult('INVALID', 'Invalid or inactive QR code.');
    }
    if (card.student.status !== 'ACTIVE') {
      return this.qrResult('INACTIVE_STUDENT', 'Invalid or inactive QR code.');
    }

    const student = card.student;
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
    const timeZone = resolveSchoolTimeZone(school?.timezone ?? DEFAULT_SCHOOL_TIMEZONE);
    const date = this.normalizeDate(localDateString(now, timeZone));
    const debounceKey = `${schoolId}:${student.id}`;
    if (this.isQrDebounced(debounceKey)) {
      const existing = await this.prisma.studentAttendance.findUnique({
        where: { schoolId_studentId_date: { schoolId, studentId: student.id, date } },
      });
      return this.qrAlreadyMarked(student.fullName, existing?.status ?? AttendanceStatus.PRESENT, true);
    }

    const existing = await this.prisma.studentAttendance.findUnique({
      where: { schoolId_studentId_date: { schoolId, studentId: student.id, date } },
    });

    if (existing) {
      return this.qrAlreadyMarked(student.fullName, existing.status, false);
    }

    const status = resolveQrAttendanceStatus({
      now,
      timeZone,
      presentUntil: school?.attendancePresentUntil,
      lateUntil: school?.attendanceLateUntil,
    });

    try {
      const record = await this.prisma.studentAttendance.create({
        data: {
          schoolId,
          studentId: student.id,
          date,
          status,
          remarks: QR_SCAN_REMARKS,
          classId: student.classId,
          sectionId: student.sectionId,
          markedById: currentUser.id,
        },
        include: attendanceInclude,
      });
      this.touchQrDebounce(debounceKey);
      const verb = status === AttendanceStatus.LATE ? 'marked Late' : 'marked Present';
      return {
        result: 'SUCCESS' as const,
        message: `${student.fullName} ${verb}`,
        status: record.status,
        duplicate: false,
        student: { id: student.id, fullName: student.fullName, admissionNo: student.admissionNo },
        attendanceId: record.id,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.studentAttendance.findUnique({
          where: { schoolId_studentId_date: { schoolId, studentId: student.id, date } },
        });
        return this.qrAlreadyMarked(student.fullName, raced?.status ?? AttendanceStatus.PRESENT, false);
      }
      throw error;
    }
  }

  async findAll(currentUser: CurrentUser, query: AttendanceQueryDto) {
    const schoolId = await this.schoolIdForAttendanceRead(currentUser, query);
    if (schoolId) {
      await this.assertAttendanceReadScope(currentUser, schoolId, query);
    }
    let where = this.buildAttendanceWhere(currentUser, query);
    if (currentUser.role === UserRole.TEACHER && schoolId && !query.classId && !query.sectionId) {
      where = {
        ...where,
        classId: { in: await this.teacherAssignedClassIds(currentUser, schoolId) },
      };
    }
    const { take, skip } = resolvePagination(query);

    const [data, total] = await Promise.all([
      this.prisma.studentAttendance.findMany({
        where,
        include: attendanceInclude,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take,
        skip,
      }),
      this.prisma.studentAttendance.count({ where }),
    ]);

    return paginatedResult(data, total, take, skip);
  }

  async getSchoolToday(currentUser: CurrentUser, schoolId?: string, now: Date = new Date()) {
    const resolved = this.resolveSchoolId(currentUser, schoolId);
    const timeZone = await this.timeZoneForSchool(resolved);
    return { date: localDateString(now, timeZone), timeZone };
  }

  async getRegister(currentUser: CurrentUser, query: AttendanceQueryDto, now: Date = new Date()) {
    if (!query.classId) {
      throw new BadRequestException('classId is required');
    }
    const schoolId = this.resolveSchoolId(currentUser, query.schoolId);
    await this.assertClassBelongsToSchool(query.classId, schoolId);
    if (query.sectionId) {
      await this.assertSectionBelongsToSchool(query.sectionId, schoolId, query.classId);
    }
    await this.assertTeacherMayMarkClass(currentUser, schoolId, query.classId);

    const timeZone = await this.timeZoneForSchool(schoolId);
    const dateStr = query.date ?? localDateString(now, timeZone);
    const date = this.normalizeDate(dateStr);

    const studentWhere: Prisma.StudentWhereInput = {
      schoolId,
      status: 'ACTIVE',
      classId: query.classId,
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
    };

    const totalStudents = await this.prisma.student.count({ where: studentWhere });
    if (totalStudents > ATTENDANCE_REGISTER_LIMIT) {
      throw new BadRequestException(
        `This class has ${totalStudents} active students, which is above the register limit of ${ATTENDANCE_REGISTER_LIMIT}. Mark one section at a time.`,
      );
    }

    const students = await this.prisma.student.findMany({
      where: studentWhere,
      select: { id: true, fullName: true, admissionNo: true },
      orderBy: [{ fullName: 'asc' }, { admissionNo: 'asc' }],
    });

    const records = students.length
      ? await this.prisma.studentAttendance.findMany({
          where: {
            schoolId,
            date,
            studentId: { in: students.map((student) => student.id) },
          },
          select: { id: true, studentId: true, status: true },
        })
      : [];

    const byStudent = new Map(records.map((record) => [record.studentId, record]));
    const rows = students.map((student) => {
      const record = byStudent.get(student.id);
      return {
        id: student.id,
        fullName: student.fullName,
        admissionNo: student.admissionNo,
        status: record?.status ?? null,
        attendanceId: record?.id ?? null,
      };
    });

    return {
      date: dateStr,
      timeZone,
      classId: query.classId,
      sectionId: query.sectionId ?? null,
      students: rows,
      summary: this.summarizeRegister(rows, dateStr),
    };
  }

  async getSummary(currentUser: CurrentUser, query: AttendanceQueryDto, now: Date = new Date()) {
    const schoolId = await this.schoolIdForAttendanceRead(currentUser, query);
    if (schoolId && (query.classId || query.sectionId)) {
      await this.assertAttendanceReadScope(currentUser, schoolId, query);
    }
    const timeZone = schoolId ? await this.timeZoneForSchool(schoolId) : DEFAULT_SCHOOL_TIMEZONE;
    const dateStr = query.date ?? localDateString(now, timeZone);
    const date = this.normalizeDate(dateStr);
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);
    const assignedClassIds =
      currentUser.role === UserRole.TEACHER && schoolId && !query.classId && !query.sectionId
        ? await this.teacherAssignedClassIds(currentUser, schoolId)
        : null;

    const studentWhere: Prisma.StudentWhereInput = {
      ...schoolFilter,
      status: 'ACTIVE',
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(assignedClassIds ? { classId: { in: assignedClassIds } } : {}),
    };

    const totalStudents = await this.prisma.student.count({ where: studentWhere });

    const attendanceWhere: Prisma.StudentAttendanceWhereInput = {
      ...schoolFilter,
      date,
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(assignedClassIds ? { classId: { in: assignedClassIds } } : {}),
    };

    // Same rows as the previous in-memory count, including inactive students.
    // No in-repo caller depends on this endpoint. Excluding inactive rows would
    // change absent/notMarked for any external client, so the contract stays.
    const groups = await this.prisma.studentAttendance.groupBy({
      by: ['status'],
      where: attendanceWhere,
      _count: { id: true },
    });
    const countOf = (status: AttendanceStatus) =>
      groups.find((group) => group.status === status)?._count.id ?? 0;
    const present = countOf(AttendanceStatus.PRESENT);
    const absent = countOf(AttendanceStatus.ABSENT);
    const leave = countOf(AttendanceStatus.LEAVE);
    const late = countOf(AttendanceStatus.LATE);
    const marked = present + absent + leave + late;
    const notMarked = Math.max(totalStudents - marked, 0);

    return {
      date: dateStr,
      totalStudents,
      present,
      absent,
      leave,
      late,
      notMarked,
    };
  }

  /**
   * School-admin counts for the school-local calendar day.
   * Active students only. Late is marked, so it is not included in notMarked.
   */
  async getTodayOverview(
    currentUser: CurrentUser,
    query: { schoolId?: string } = {},
    now: Date = new Date(),
  ) {
    const schoolId = this.resolveSchoolAdminSchool(currentUser, query.schoolId);
    const timeZone = await this.timeZoneForSchool(schoolId);
    const dateStr = localDateString(now, timeZone);
    const date = this.normalizeDate(dateStr);
    // Each call uses school-local today. A client date is not accepted: this is
    // not a historical report. Two requests that straddle local midnight can
    // therefore disagree; the roster does not reuse an earlier overview date.
    const activeStudent = { schoolId, status: 'ACTIVE' as const };

    const [totalActive, groups] = await Promise.all([
      this.prisma.student.count({ where: activeStudent }),
      this.prisma.studentAttendance.groupBy({
        by: ['status'],
        where: { schoolId, date, student: activeStudent },
        _count: { id: true },
      }),
    ]);

    const countOf = (status: AttendanceStatus) =>
      groups.find((group) => group.status === status)?._count.id ?? 0;
    const present = countOf(AttendanceStatus.PRESENT);
    const absent = countOf(AttendanceStatus.ABSENT);
    const leave = countOf(AttendanceStatus.LEAVE);
    const late = countOf(AttendanceStatus.LATE);
    const marked = present + absent + leave + late;

    return {
      date: dateStr,
      timeZone,
      totalActive,
      present,
      absent,
      leave,
      late,
      notMarked: Math.max(totalActive - marked, 0),
    };
  }

  async getTodayRoster(currentUser: CurrentUser, query: TodayRosterQueryDto, now: Date = new Date()) {
    const schoolId = this.resolveSchoolAdminSchool(currentUser, query.schoolId);
    if (query.classId) {
      await this.assertClassBelongsToSchool(query.classId, schoolId);
    }
    if (query.sectionId) {
      await this.assertSectionBelongsToSchool(query.sectionId, schoolId, query.classId);
    }

    const timeZone = await this.timeZoneForSchool(schoolId);
    const dateStr = localDateString(now, timeZone);
    const date = this.normalizeDate(dateStr);
    const { take, skip } = resolvePagination(query);
    const studentWhere = this.todayRosterStudentWhere(schoolId, query);

    if (query.category === 'NOT_MARKED') {
      const where: Prisma.StudentWhereInput = {
        ...studentWhere,
        attendances: { none: { schoolId, date } },
      };
      const [total, students] = await Promise.all([
        this.prisma.student.count({ where }),
        this.prisma.student.findMany({
          where,
          select: todayRosterStudentSelect,
          orderBy: [{ fullName: 'asc' }, { admissionNo: 'asc' }],
          take,
          skip,
        }),
      ]);
      return {
        date: dateStr,
        timeZone,
        category: query.category,
        ...paginatedResult(students.map(toTodayRosterStudent), total, take, skip),
      };
    }

    const where: Prisma.StudentAttendanceWhereInput = {
      schoolId,
      date,
      status: query.category,
      student: studentWhere,
    };
    const [total, rows] = await Promise.all([
      this.prisma.studentAttendance.count({ where }),
      this.prisma.studentAttendance.findMany({
        where,
        select: { student: { select: todayRosterStudentSelect } },
        orderBy: [{ student: { fullName: 'asc' } }, { student: { admissionNo: 'asc' } }],
        take,
        skip,
      }),
    ]);
    return {
      date: dateStr,
      timeZone,
      category: query.category,
      ...paginatedResult(rows.map((row) => toTodayRosterStudent(row.student)), total, take, skip),
    };
  }

  async update(id: string, dto: UpdateAttendanceDto, currentUser: CurrentUser) {
    const attendance = await this.findAttendanceOrThrow(id);
    this.assertSchoolAccess(currentUser, attendance.schoolId);
    if (attendance.classId) {
      await this.assertTeacherMayMarkClass(currentUser, attendance.schoolId, attendance.classId);
    } else if (currentUser.role === UserRole.TEACHER) {
      throw new ForbiddenException('You can only mark attendance for classes assigned to you');
    }

    const saved = await this.commitAttendanceWrite(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string; status: AttendanceStatus }>>(
        Prisma.sql`SELECT id, status FROM "StudentAttendance" WHERE id = ${id} FOR UPDATE`,
      );
      const current = locked[0];
      if (!current) {
        throw new NotFoundException('Attendance record not found');
      }
      const previousStatus = current.status;
      const row = await tx.studentAttendance.update({
        where: { id },
        data: {
          status: dto.status,
          ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
          markedById: currentUser.id,
        },
        include: attendanceInclude,
      });
      return { row, previousStatus };
    });

    this.dispatchAbsentTransition(
      attendance.schoolId,
      attendance.studentId,
      attendance.date,
      saved.row.id,
      dto.status,
      saved.previousStatus,
    );

    return saved.row;
  }

  async getClassReport(currentUser: CurrentUser, query: AttendanceQueryDto) {
    if (!query.classId) {
      throw new BadRequestException('classId is required');
    }
    if (!query.startDate || !query.endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }

    const startDate = this.normalizeDate(query.startDate);
    const endDate = this.normalizeDate(query.endDate);

    if (startDate > endDate) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }

    const classRecord = await this.prisma.class.findUnique({ where: { id: query.classId } });
    if (!classRecord) {
      throw new NotFoundException('Class not found');
    }

    const schoolId = this.resolveSchoolIdForReport(currentUser, query.schoolId, classRecord.schoolId);
    if (classRecord.schoolId !== schoolId) {
      throw new BadRequestException('Class does not belong to the specified school');
    }

    if (query.sectionId) {
      await this.assertSectionBelongsToSchool(query.sectionId, schoolId, query.classId);
    }
    await this.assertTeacherMayMarkClass(currentUser, schoolId, query.classId);

    const schoolFilter = { schoolId };

    const students = await this.prisma.student.findMany({
      where: {
        ...schoolFilter,
        status: 'ACTIVE',
        classId: query.classId,
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      },
      include: { class: true, section: true },
      orderBy: { fullName: 'asc' },
    });

    const records = await this.prisma.studentAttendance.findMany({
      where: {
        ...schoolFilter,
        classId: query.classId,
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
        date: { gte: startDate, lte: endDate },
      },
    });

    const recordsByStudent = records.reduce<Record<string, typeof records>>((acc, record) => {
      if (!acc[record.studentId]) acc[record.studentId] = [];
      acc[record.studentId].push(record);
      return acc;
    }, {});

    const report = students.map((student) => {
      const studentRecords = recordsByStudent[student.id] ?? [];
      return {
        student,
        totalPresent: studentRecords.filter((r) => r.status === AttendanceStatus.PRESENT).length,
        totalAbsent: studentRecords.filter((r) => r.status === AttendanceStatus.ABSENT).length,
        totalLeave: studentRecords.filter((r) => r.status === AttendanceStatus.LEAVE).length,
        totalLate: studentRecords.filter((r) => r.status === AttendanceStatus.LATE).length,
        records: studentRecords,
      };
    });

    return {
      classId: query.classId,
      sectionId: query.sectionId ?? null,
      startDate: query.startDate,
      endDate: query.endDate,
      students: report,
    };
  }

  private buildAttendanceWhere(
    currentUser: CurrentUser,
    query: AttendanceQueryDto,
  ): Prisma.StudentAttendanceWhereInput {
    return {
      ...this.buildSchoolFilter(currentUser, query.schoolId),
      ...(query.date ? { date: this.normalizeDate(query.date) } : {}),
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
  }

  private normalizeDate(dateStr: string): Date {
    const trimmed = dateStr.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new BadRequestException('date must be a calendar date in YYYY-MM-DD format');
    }
    return new Date(`${trimmed}T00:00:00.000Z`);
  }

  private resolveSchoolIdForReport(
    currentUser: CurrentUser,
    querySchoolId: string | undefined,
    classSchoolId: string,
  ): string {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      if (querySchoolId && querySchoolId !== classSchoolId) {
        throw new BadRequestException('Class does not belong to the specified school');
      }
      return querySchoolId ?? classSchoolId;
    }

    const schoolId = this.resolveSchoolId(currentUser, querySchoolId);
    if (schoolId !== classSchoolId) {
      throw new ForbiddenException('Cannot access another school\'s data');
    }
    return schoolId;
  }

  private async findAttendanceOrThrow(id: string) {
    const attendance = await this.prisma.studentAttendance.findUnique({
      where: { id },
      include: attendanceInclude,
    });
    if (!attendance) {
      throw new NotFoundException('Attendance record not found');
    }
    return attendance;
  }

  private async assertClassBelongsToSchool(classId: string, schoolId: string) {
    const classRecord = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!classRecord) {
      throw new NotFoundException('Class not found');
    }
    if (classRecord.schoolId !== schoolId) {
      throw new ForbiddenException('Class does not belong to the specified school');
    }
    return classRecord;
  }

  private async assertSectionBelongsToSchool(
    sectionId: string,
    schoolId: string,
    classId?: string,
  ) {
    const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
    if (!section) {
      throw new NotFoundException('Section not found');
    }
    if (section.schoolId !== schoolId) {
      throw new ForbiddenException('Section does not belong to the specified school');
    }
    if (classId && section.classId !== classId) {
      throw new BadRequestException('Section does not belong to the specified class');
    }
    return section;
  }

  private async assertStudentBelongsToSchool(studentId: string, schoolId: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    if (student.schoolId !== schoolId) {
      throw new ForbiddenException('Student does not belong to the specified school');
    }
    return student;
  }

  private resolveSchoolAdminSchool(currentUser: CurrentUser, schoolId?: string): string {
    if (currentUser.role !== UserRole.SCHOOL_ADMIN) {
      throw new ForbiddenException("Today's attendance overview is available to school admins");
    }
    return this.resolveSchoolId(currentUser, schoolId);
  }

  private todayRosterStudentWhere(
    schoolId: string,
    query: { classId?: string; sectionId?: string; search?: string },
  ): Prisma.StudentWhereInput {
    const search = query.search?.trim();
    return {
      schoolId,
      status: 'ACTIVE',
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' as const } },
              { admissionNo: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
  }

  private resolveSchoolId(currentUser: CurrentUser, schoolId?: string): string {
    const requested = schoolId?.trim();
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      if (!requested) {
        throw new BadRequestException('schoolId is required');
      }
      return requested;
    }

    if (!currentUser.schoolId) {
      throw new ForbiddenException('School context missing');
    }

    if (requested && requested !== currentUser.schoolId) {
      throw new ForbiddenException('Cannot access another school\'s data');
    }

    return currentUser.schoolId;
  }

  private buildSchoolFilter(currentUser: CurrentUser, schoolId?: string) {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      return schoolId ? { schoolId } : {};
    }

    if (!currentUser.schoolId) {
      throw new ForbiddenException('School context missing');
    }

    if (schoolId && schoolId !== currentUser.schoolId) {
      throw new ForbiddenException('Cannot access another school\'s data');
    }

    return { schoolId: currentUser.schoolId };
  }

  private assertSchoolAccess(currentUser: CurrentUser, resourceSchoolId: string) {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      return;
    }

    if (!currentUser.schoolId) {
      throw new ForbiddenException('School context missing');
    }

    if (currentUser.schoolId !== resourceSchoolId) {
      throw new ForbiddenException('Cannot access another school\'s data');
    }
  }

  private summarizeRegister(
    rows: Array<{ status: AttendanceStatus | null }>,
    date: string,
  ) {
    const present = rows.filter((row) => row.status === AttendanceStatus.PRESENT).length;
    const absent = rows.filter((row) => row.status === AttendanceStatus.ABSENT).length;
    const leave = rows.filter((row) => row.status === AttendanceStatus.LEAVE).length;
    const late = rows.filter((row) => row.status === AttendanceStatus.LATE).length;
    const marked = present + absent + leave + late;
    return {
      date,
      totalStudents: rows.length,
      present,
      absent,
      leave,
      late,
      notMarked: rows.length - marked,
    };
  }

  private async prepareBulkRecords(dto: BulkAttendanceDto, schoolId: string) {
    const studentIds = dto.records.map((record) => record.studentId);
    if (new Set(studentIds).size !== studentIds.length) {
      throw new BadRequestException('Each student can only appear once in a submission');
    }

    const students = await this.prisma.student.findMany({
      where: { id: { in: studentIds } },
    });
    const byId = new Map(students.map((student) => [student.id, student]));

    return dto.records.map((record) => {
      const student = byId.get(record.studentId);
      if (!student) {
        throw new NotFoundException('Student not found');
      }
      if (student.schoolId !== schoolId) {
        throw new ForbiddenException('Student does not belong to the specified school');
      }
      this.assertStudentActive(student);
      if (student.classId !== dto.classId) {
        throw new BadRequestException('A student in this submission is not in the selected class');
      }
      if (dto.sectionId && student.sectionId !== dto.sectionId) {
        throw new BadRequestException('A student in this submission is not in the selected section');
      }
      return { record, student };
    });
  }

  /**
   * All row writes run in one Prisma interactive transaction. The default
   * timeout stays 5 seconds; do not raise it without a PostgreSQL measurement.
   * Existing rows are locked with SELECT ... FOR UPDATE before the previous
   * status is used for absence notifications. A concurrent insert of a missing
   * row hits the unique (schoolId, studentId, date) constraint, aborts that
   * transaction, and retries once outside it. Notifications are returned to
   * the caller and sent only after commit. A timeout rolls every row back
   * and sends nothing.
   *
   * Updates that share one status, class, section, remarks, and marker are one
   * updateMany. New rows are one createManyAndReturn. A class whose students
   * have different remarks still updates in smaller groups. That is not one
   * statement, and it has not been timed on PostgreSQL. If a disposable-database
   * run of 500, 2000, and 5000 students exceeds 5 seconds, replace the grouped
   * writes with one locked UPDATE ... FROM (VALUES ...) instead of raising
   * the timeout.
   */
  private async writeBulkAttendance(
    prepared: Array<{ record: BulkAttendanceDto['records'][number]; student: { classId: string | null; sectionId: string | null; id: string } }>,
    schoolId: string,
    date: Date,
    markedById: string,
  ): Promise<AttendanceWrite> {
    return this.commitAttendanceWrite(async (tx) => {
      const absentNotifications: AttendanceWrite['absentNotifications'] = [];
      const locked = await this.lockAttendanceByStudent(
        tx,
        schoolId,
        date,
        prepared.map((item) => item.student.id),
      );
      const updates: Array<{
        id: string;
        studentId: string;
        status: AttendanceStatus;
        previousStatus: AttendanceStatus;
        data: Prisma.StudentAttendanceUncheckedUpdateManyInput;
      }> = [];
      const creates: Prisma.StudentAttendanceCreateManyInput[] = [];

      for (const { record, student } of prepared) {
        const existing = locked.get(student.id);
        const data = {
          status: record.status,
          ...(record.remarks !== undefined ? { remarks: record.remarks } : {}),
          classId: student.classId,
          sectionId: student.sectionId,
          markedById,
        };
        if (existing) {
          updates.push({
            id: existing.id,
            studentId: student.id,
            status: record.status,
            previousStatus: existing.status,
            data,
          });
        } else {
          creates.push({ schoolId, studentId: student.id, date, ...data });
        }
      }

      await this.applyBulkUpdates(tx, updates);
      const createdRows = creates.length
        ? await tx.studentAttendance.createManyAndReturn({
            data: creates,
            select: { id: true, studentId: true },
          })
        : [];
      const createdIds = new Map(createdRows.map((row) => [row.studentId, row.id]));

      for (const item of updates) {
        if (item.status === AttendanceStatus.ABSENT && item.previousStatus !== AttendanceStatus.ABSENT) {
          absentNotifications.push({ studentId: item.studentId, attendanceId: item.id });
        }
      }
      for (const row of creates) {
        if (row.status !== AttendanceStatus.ABSENT) continue;
        const attendanceId = createdIds.get(row.studentId);
        if (!attendanceId) {
          throw new InternalServerErrorException(
            'Attendance could not be saved. Refresh the register and try again.',
          );
        }
        absentNotifications.push({ studentId: row.studentId, attendanceId });
      }

      return {
        createdCount: createdRows.length,
        updatedCount: updates.length,
        absentNotifications,
      };
    });
  }

  /** One updateMany per identical payload. Remarks are left unchanged when omitted. */
  private async applyBulkUpdates(
    tx: Prisma.TransactionClient,
    updates: Array<{ id: string; data: Prisma.StudentAttendanceUncheckedUpdateManyInput }>,
  ) {
    const groups = new Map<string, { ids: string[]; data: Prisma.StudentAttendanceUncheckedUpdateManyInput }>();
    for (const item of updates) {
      const remarksKey = Object.prototype.hasOwnProperty.call(item.data, 'remarks')
        ? { set: item.data.remarks ?? null }
        : { omit: true };
      const key = JSON.stringify([
        item.data.status ?? null,
        item.data.classId ?? null,
        item.data.sectionId ?? null,
        item.data.markedById ?? null,
        remarksKey,
      ]);
      const group = groups.get(key);
      if (group) group.ids.push(item.id);
      else groups.set(key, { ids: [item.id], data: item.data });
    }
    for (const group of groups.values()) {
      await tx.studentAttendance.updateMany({
        where: { id: { in: group.ids } },
        data: group.data,
      });
    }
  }

  private async commitAttendanceWrite<T>(
    run: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(run);
    } catch (error) {
      if (!isUniqueViolation(error)) throw this.attendanceWriteError(error);
      try {
        return await this.prisma.$transaction(run);
      } catch (retryError) {
        throw this.attendanceWriteError(retryError);
      }
    }
  }

  /**
   * Locks the current rows for these students and dates. The second
   * transaction waits, then reads the committed status, so two ABSENT
   * transitions cannot both observe a non-ABSENT previous status.
   * The date column is timestamp without time zone. Compare it in UTC so a
   * session TimeZone other than UTC still finds the row Prisma stored.
   */
  private async lockAttendanceByStudent(
    tx: Prisma.TransactionClient,
    schoolId: string,
    date: Date,
    studentIds: string[],
  ): Promise<Map<string, { id: string; status: AttendanceStatus }>> {
    if (studentIds.length === 0) return new Map();
    const rows = await tx.$queryRaw<Array<{ id: string; studentId: string; status: AttendanceStatus }>>(
      Prisma.sql`
        SELECT id, "studentId", status
        FROM "StudentAttendance"
        WHERE "schoolId" = ${schoolId}
          AND "date" = (${date} AT TIME ZONE 'UTC')
          AND "studentId" IN (${Prisma.join(studentIds)})
        FOR UPDATE
      `,
    );
    return new Map(rows.map((row) => [row.studentId, { id: row.id, status: row.status }]));
  }

  private dispatchAbsentTransition(
    schoolId: string,
    studentId: string,
    date: Date,
    attendanceId: string,
    status: AttendanceStatus,
    previousStatus: AttendanceStatus | null,
  ) {
    if (status !== AttendanceStatus.ABSENT || previousStatus === AttendanceStatus.ABSENT) return;
    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitAttendanceAbsent(
        schoolId,
        studentId,
        date.toISOString(),
        attendanceId,
      ),
    );
  }

  private assertStudentActive(student: { status: string }) {
    if (student.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Inactive students cannot be marked. Only active students are included in the register.',
      );
    }
  }

  /**
   * Teachers may mark a class only when it appears on their timetable,
   * matching the teacher portal's assigned-class list.
   */
  private async assertTeacherMayMarkClass(
    currentUser: CurrentUser,
    schoolId: string,
    classId: string,
  ) {
    if (currentUser.role !== UserRole.TEACHER) return;

    const teacher = await this.prisma.teacher.findFirst({
      where: { userId: currentUser.id, schoolId },
      select: { id: true },
    });
    const assigned = teacher
      ? await this.prisma.timetableEntry.findFirst({
          where: { schoolId, teacherId: teacher.id, classId },
          select: { id: true },
        })
      : null;
    if (!assigned) {
      throw new ForbiddenException('You can only mark attendance for classes assigned to you');
    }
  }

  private async schoolIdForAttendanceRead(
    currentUser: CurrentUser,
    query: { schoolId?: string; classId?: string; sectionId?: string },
  ): Promise<string | undefined> {
    if (currentUser.role !== UserRole.SUPER_ADMIN) {
      return this.resolveSchoolId(currentUser, query.schoolId);
    }
    if (query.schoolId) return query.schoolId;
    if (query.classId) {
      const classRecord = await this.prisma.class.findUnique({ where: { id: query.classId } });
      if (!classRecord) throw new NotFoundException('Class not found');
      return classRecord.schoolId;
    }
    if (query.sectionId) {
      const section = await this.prisma.section.findUnique({ where: { id: query.sectionId } });
      if (!section) throw new NotFoundException('Section not found');
      return section.schoolId;
    }
    return undefined;
  }

  /**
   * A requested class or section must belong to the school. A section must
   * also belong to the requested class. Teachers may only read timetable classes.
   */
  private async assertAttendanceReadScope(
    currentUser: CurrentUser,
    schoolId: string,
    query: { classId?: string; sectionId?: string },
  ) {
    if (query.sectionId) {
      const section = await this.assertSectionBelongsToSchool(
        query.sectionId,
        schoolId,
        query.classId,
      );
      await this.assertTeacherMayMarkClass(currentUser, schoolId, query.classId ?? section.classId);
      return;
    }
    if (query.classId) {
      await this.assertClassBelongsToSchool(query.classId, schoolId);
      await this.assertTeacherMayMarkClass(currentUser, schoolId, query.classId);
    }
  }

  private async teacherAssignedClassIds(currentUser: CurrentUser, schoolId: string): Promise<string[]> {
    const teacher = await this.prisma.teacher.findFirst({
      where: { userId: currentUser.id, schoolId },
      select: { id: true },
    });
    if (!teacher) return [];
    const rows = await this.prisma.timetableEntry.findMany({
      where: { schoolId, teacherId: teacher.id },
      select: { classId: true },
      distinct: ['classId'],
    });
    return [...new Set(rows.map((row) => row.classId))];
  }

  private async timeZoneForSchool(schoolId: string): Promise<string> {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { timezone: true },
    });
    if (!school) {
      throw new NotFoundException('School not found');
    }
    return resolveSchoolTimeZone(school.timezone);
  }

  private attendanceWriteError(error: unknown): Error {
    if (error instanceof BadRequestException || error instanceof ForbiddenException || error instanceof NotFoundException || error instanceof ConflictException) {
      return error;
    }
    if (isUniqueViolation(error)) {
      return new ConflictException(
        'Attendance was saved at the same time. Refresh the register and try again.',
      );
    }
    return new InternalServerErrorException(
      'Attendance could not be saved. Refresh the register and try again.',
    );
  }

  private qrResult(result: 'INVALID' | 'REVOKED' | 'INACTIVE_STUDENT', message: string) {
    return { result, message, duplicate: false };
  }

  private qrAlreadyMarked(fullName: string, status: AttendanceStatus, debounced: boolean) {
    const label =
      status === AttendanceStatus.PRESENT
        ? 'Present'
        : status === AttendanceStatus.LATE
          ? 'Late'
          : status === AttendanceStatus.ABSENT
            ? 'Absent'
            : 'Leave';
    return {
      result: 'DUPLICATE' as const,
      message: `${fullName} is already marked ${label} today.`,
      status,
      duplicate: true,
      debounced,
      student: { fullName },
    };
  }

  /**
   * Debounce is an in-process UX optimization only (~3s).
   * Correctness for duplicate attendance is the DB unique (schoolId, studentId, date).
   * Multiple app instances remain safe via that constraint; this map is not shared.
   * Legitimate first scans are never suppressed; only rapid same-key repeats within the window.
   */
  private isQrDebounced(key: string): boolean {
    const prev = this.recentQrScans.get(key);
    if (prev && Date.now() - prev < QR_SCAN_DEBOUNCE_MS) return true;
    return false;
  }

  private touchQrDebounce(key: string) {
    const now = Date.now();
    this.recentQrScans.set(key, now);
    if (this.recentQrScans.size > 2000) {
      for (const [entryKey, at] of this.recentQrScans) {
        if (now - at > QR_SCAN_DEBOUNCE_MS) this.recentQrScans.delete(entryKey);
      }
    }
  }
}

const todayRosterStudentSelect = {
  id: true,
  fullName: true,
  admissionNo: true,
  class: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
} satisfies Prisma.StudentSelect;

function toTodayRosterStudent(student: {
  id: string;
  fullName: string;
  admissionNo: string;
  class: { id: string; name: string } | null;
  section: { id: string; name: string } | null;
}) {
  return {
    id: student.id,
    fullName: student.fullName,
    admissionNo: student.admissionNo,
    class: student.class,
    section: student.section,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002',
  );
}
