import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus, Prisma, UserRole } from '@prisma/client';
import { resolvePagination } from '../common/dto/pagination-query.dto';
import { paginatedResult } from '../common/utils/paginated-result';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEngineService } from '../notifications/notification-engine.service';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { BulkAttendanceDto } from './dto/bulk-attendance.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

const attendanceInclude = {
  student: true,
  class: true,
  section: true,
  markedBy: { select: { id: true, name: true, email: true, role: true } },
} satisfies Prisma.StudentAttendanceInclude;

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private readonly notificationEngine: NotificationEngineService,
  ) {}

  async mark(dto: MarkAttendanceDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);
    const student = await this.assertStudentBelongsToSchool(dto.studentId, schoolId);
    const date = this.normalizeDate(dto.date);

    const existing = await this.prisma.studentAttendance.findUnique({
      where: {
        schoolId_studentId_date: { schoolId, studentId: dto.studentId, date },
      },
    });

    const data = {
      status: dto.status,
      remarks: dto.remarks,
      classId: student.classId,
      sectionId: student.sectionId,
      markedById: currentUser.id,
    };

    if (existing) {
      return this.prisma.studentAttendance.update({
        where: { id: existing.id },
        data,
        include: attendanceInclude,
      });
    }

    return this.prisma.studentAttendance.create({
      data: {
        schoolId,
        studentId: dto.studentId,
        date,
        ...data,
      },
      include: attendanceInclude,
    });
  }

  async markBulk(dto: BulkAttendanceDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);
    await this.assertClassBelongsToSchool(dto.classId, schoolId);

    if (dto.sectionId) {
      await this.assertSectionBelongsToSchool(dto.sectionId, schoolId, dto.classId);
    }

    const date = this.normalizeDate(dto.date);
    let createdCount = 0;
    let updatedCount = 0;

    for (const record of dto.records) {
      const student = await this.assertStudentBelongsToSchool(record.studentId, schoolId);

      if (student.classId !== dto.classId) {
        throw new BadRequestException(
          `Student ${record.studentId} does not belong to the specified class`,
        );
      }

      if (dto.sectionId && student.sectionId !== dto.sectionId) {
        throw new BadRequestException(
          `Student ${record.studentId} does not belong to the specified section`,
        );
      }

      const existing = await this.prisma.studentAttendance.findUnique({
        where: {
          schoolId_studentId_date: { schoolId, studentId: record.studentId, date },
        },
      });

      const data = {
        status: record.status,
        remarks: record.remarks,
        classId: student.classId,
        sectionId: student.sectionId,
        markedById: currentUser.id,
      };

      if (existing) {
        await this.prisma.studentAttendance.update({
          where: { id: existing.id },
          data,
        });
        updatedCount++;
      } else {
        await this.prisma.studentAttendance.create({
          data: {
            schoolId,
            studentId: record.studentId,
            date,
            ...data,
          },
        });
        createdCount++;
      }

      if (record.status === AttendanceStatus.ABSENT) {
        this.notificationEngine.dispatch(() =>
          this.notificationEngine.emitAttendanceAbsent(
            schoolId,
            record.studentId,
            date.toISOString(),
          ),
        );
      }
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

    return { createdCount, updatedCount };
  }

  async findAll(currentUser: CurrentUser, query: AttendanceQueryDto) {
    const where = this.buildAttendanceWhere(currentUser, query);
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

  async getSummary(currentUser: CurrentUser, query: AttendanceQueryDto) {
    const dateStr = query.date ?? new Date().toISOString().split('T')[0];
    const date = this.normalizeDate(dateStr);
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);

    const studentWhere: Prisma.StudentWhereInput = {
      ...schoolFilter,
      status: 'ACTIVE',
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
    };

    const totalStudents = await this.prisma.student.count({ where: studentWhere });

    const attendanceWhere: Prisma.StudentAttendanceWhereInput = {
      ...schoolFilter,
      date,
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
    };

    const records = await this.prisma.studentAttendance.findMany({ where: attendanceWhere });

    const present = records.filter((r) => r.status === AttendanceStatus.PRESENT).length;
    const absent = records.filter((r) => r.status === AttendanceStatus.ABSENT).length;
    const leave = records.filter((r) => r.status === AttendanceStatus.LEAVE).length;
    const late = records.filter((r) => r.status === AttendanceStatus.LATE).length;
    const marked = records.length;
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

  async update(id: string, dto: UpdateAttendanceDto, currentUser: CurrentUser) {
    const attendance = await this.findAttendanceOrThrow(id);
    this.assertSchoolAccess(currentUser, attendance.schoolId);

    return this.prisma.studentAttendance.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
        markedById: currentUser.id,
      },
      include: attendanceInclude,
    });
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
    return new Date(`${dateStr}T00:00:00.000Z`);
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

  private resolveSchoolId(currentUser: CurrentUser, schoolId?: string): string {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      if (!schoolId) {
        throw new BadRequestException('schoolId is required');
      }
      return schoolId;
    }

    if (!currentUser.schoolId) {
      throw new ForbiddenException('School context missing');
    }

    if (schoolId && schoolId !== currentUser.schoolId) {
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
}
