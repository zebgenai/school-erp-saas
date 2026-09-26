import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TeacherAttendanceSource, UserRole } from '@prisma/client';
import { resolvePagination } from '../common/dto/pagination-query.dto';
import { paginatedResult } from '../common/utils/paginated-result';
import {
  DEFAULT_SCHOOL_TIMEZONE,
  localDateString,
  resolveSchoolTimeZone,
} from '../common/utils/school-time';
import { CurrentUser } from '../common/types/current-user.type';
import { normalizeScannedTeacherQr } from '../id-cards/qr-token';
import { PrismaService } from '../prisma/prisma.service';
import { TeacherAttendanceQueryDto } from './dto/teacher-attendance-query.dto';
import { TeacherPunchDto } from './dto/teacher-punch.dto';
import { TeacherQrScanDto } from './dto/teacher-qr-scan.dto';

export const TEACHER_CHECKOUT_MIN_MS = 10 * 60 * 1000;

export type TeacherPunchResultCode =
  | 'CHECK_IN'
  | 'ALREADY_CHECKED_IN'
  | 'CHECK_OUT'
  | 'ALREADY_COMPLETED'
  | 'INVALID_TEACHER'
  | 'INACTIVE_TEACHER'
  | 'INVALID_CARD'
  | 'REVOKED_CARD';

const teacherAttendanceInclude = {
  teacher: {
    select: {
      id: true,
      fullName: true,
      employeeNo: true,
      designation: true,
      status: true,
      photoUrl: true,
    },
  },
  markedBy: { select: { id: true, name: true, email: true, role: true } },
} satisfies Prisma.TeacherAttendanceInclude;

type AttendanceRecord = Prisma.TeacherAttendanceGetPayload<{
  include: typeof teacherAttendanceInclude;
}>;

@Injectable()
export class TeacherAttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Server-authoritative punch. `now` is injectable for tests.
   * Client timestamps are never accepted.
   */
  async punch(
    dto: TeacherPunchDto,
    currentUser: CurrentUser,
    now: Date = new Date(),
    source: TeacherAttendanceSource = TeacherAttendanceSource.MANUAL,
  ) {
    const teacher = await this.prisma.teacher.findUnique({ where: { id: dto.teacherId } });
    if (!teacher) {
      return this.punchResult('INVALID_TEACHER', 'Teacher not found.');
    }

    const schoolId = this.resolvePunchSchoolId(currentUser, teacher.schoolId, dto.schoolId);
    if (teacher.schoolId !== schoolId) {
      return this.punchResult('INVALID_TEACHER', 'Teacher does not belong to this school.');
    }

    await this.assertCanPunchTeacher(currentUser, teacher, source);

    if (teacher.status !== 'ACTIVE') {
      return this.punchResult('INACTIVE_TEACHER', 'Teacher is inactive.');
    }

    return this.executePunch(teacher, schoolId, currentUser, now, source);
  }

  /**
   * QR punch: identity comes only from the TCC1 TeacherIdCard token.
   * School staff only — SUPER_ADMIN excluded (no school context on scanner).
   */
  async punchFromQr(dto: TeacherQrScanDto, currentUser: CurrentUser, now: Date = new Date()) {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'QR attendance scanning is limited to school staff with school context',
      );
    }
    if (!currentUser.schoolId) {
      throw new ForbiddenException('School context missing');
    }

    const raw = (dto.qrToken || dto.token || '').trim();
    const token = normalizeScannedTeacherQr(raw);
    if (!token) {
      return this.punchResult('INVALID_CARD', 'Invalid teacher QR code.');
    }

    const schoolId = currentUser.schoolId;
    const card = await this.prisma.teacherIdCard.findUnique({
      where: { qrToken: token },
      include: { teacher: true },
    });

    if (!card || card.schoolId !== schoolId || card.teacher.schoolId !== schoolId) {
      return this.punchResult('INVALID_CARD', 'Invalid or inactive teacher QR code.');
    }
    if (!card.isActive || card.revokedAt) {
      return this.punchResult('REVOKED_CARD', 'This teacher ID card has been revoked.');
    }
    if (card.teacher.status !== 'ACTIVE') {
      return this.punchResult('INACTIVE_TEACHER', 'Teacher is inactive.');
    }

    await this.assertCanPunchTeacher(currentUser, card.teacher, TeacherAttendanceSource.QR);

    return this.executePunch(
      card.teacher,
      schoolId,
      currentUser,
      now,
      TeacherAttendanceSource.QR,
    );
  }

  async findAll(currentUser: CurrentUser, query: TeacherAttendanceQueryDto) {
    const schoolId = this.resolveListSchoolId(currentUser, query.schoolId);
    const dateStr = query.workDate ?? query.date;
    let workDate: Date | undefined;
    if (dateStr) {
      workDate = this.normalizeWorkDate(dateStr);
    } else {
      const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
      const timeZone = resolveSchoolTimeZone(school?.timezone ?? DEFAULT_SCHOOL_TIMEZONE);
      workDate = this.normalizeWorkDate(localDateString(new Date(), timeZone));
    }

    let teacherIdFilter = query.teacherId;
    if (currentUser.role === UserRole.TEACHER) {
      const self = await this.prisma.teacher.findFirst({
        where: { userId: currentUser.id, schoolId },
        select: { id: true },
      });
      if (!self) {
        throw new ForbiddenException('Teacher profile not found for this account');
      }
      if (query.teacherId && query.teacherId !== self.id) {
        throw new ForbiddenException('Teachers may only view their own attendance');
      }
      teacherIdFilter = self.id;
    } else if (query.teacherId) {
      await this.assertTeacherInSchool(query.teacherId, schoolId);
    }

    const where: Prisma.TeacherAttendanceWhereInput = {
      schoolId,
      workDate,
      ...(teacherIdFilter ? { teacherId: teacherIdFilter } : {}),
    };

    const { take, skip } = resolvePagination(query);
    const [rows, total] = await Promise.all([
      this.prisma.teacherAttendance.findMany({
        where,
        include: teacherAttendanceInclude,
        orderBy: [{ checkInAt: 'desc' }, { createdAt: 'desc' }],
        take,
        skip,
      }),
      this.prisma.teacherAttendance.count({ where }),
    ]);

    const data = rows.map((row) => ({
      ...row,
      workingMinutes: this.workingMinutes(row.checkInAt, row.checkOutAt),
      status: row.checkOutAt
        ? ('COMPLETED' as const)
        : ('CHECKED_IN' as const),
    }));

    return paginatedResult(data, total, take, skip);
  }

  private async executePunch(
    teacher: {
      id: string;
      schoolId: string;
      fullName: string;
      status: string;
      userId: string | null;
      employeeNo?: string | null;
      designation?: string | null;
      photoUrl?: string | null;
    },
    schoolId: string,
    currentUser: CurrentUser,
    now: Date,
    source: TeacherAttendanceSource,
  ) {
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
    const timeZone = resolveSchoolTimeZone(school?.timezone ?? DEFAULT_SCHOOL_TIMEZONE);
    const workDate = this.normalizeWorkDate(localDateString(now, timeZone));

    const existing = await this.prisma.teacherAttendance.findUnique({
      where: {
        schoolId_teacherId_workDate: {
          schoolId,
          teacherId: teacher.id,
          workDate,
        },
      },
      include: teacherAttendanceInclude,
    });

    if (!existing) {
      try {
        const created = await this.prisma.teacherAttendance.create({
          data: {
            schoolId,
            teacherId: teacher.id,
            workDate,
            checkInAt: now,
            source,
            markedById: currentUser.id,
          },
          include: teacherAttendanceInclude,
        });
        return this.punchResult('CHECK_IN', `${teacher.fullName} checked in.`, created);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const raced = await this.prisma.teacherAttendance.findUnique({
            where: {
              schoolId_teacherId_workDate: {
                schoolId,
                teacherId: teacher.id,
                workDate,
              },
            },
            include: teacherAttendanceInclude,
          });
          if (!raced) throw error;
          return this.applySecondPunch(raced, teacher.fullName, now, currentUser);
        }
        throw error;
      }
    }

    return this.applySecondPunch(existing, teacher.fullName, now, currentUser);
  }

  private async applySecondPunch(
    existing: AttendanceRecord,
    teacherName: string,
    now: Date,
    currentUser: CurrentUser,
  ) {
    if (existing.checkOutAt) {
      return this.punchResult(
        'ALREADY_COMPLETED',
        `${teacherName} already completed attendance for today.`,
        existing,
      );
    }

    const elapsed = now.getTime() - existing.checkInAt.getTime();
    if (elapsed < TEACHER_CHECKOUT_MIN_MS) {
      return this.punchResult(
        'ALREADY_CHECKED_IN',
        `${teacherName} already checked in. Checkout allowed after 10 minutes.`,
        existing,
        { checkoutAllowedInMs: TEACHER_CHECKOUT_MIN_MS - elapsed },
      );
    }

    const updated = await this.prisma.teacherAttendance.update({
      where: { id: existing.id },
      data: {
        checkOutAt: now,
        markedById: currentUser.id,
      },
      include: teacherAttendanceInclude,
    });

    return this.punchResult('CHECK_OUT', `${teacherName} checked out.`, updated);
  }

  private punchResult(
    result: TeacherPunchResultCode,
    message: string,
    record?: AttendanceRecord | null,
    extra?: { checkoutAllowedInMs?: number },
  ) {
    const teacher = record?.teacher ?? null;
    const checkInAt = record?.checkInAt ?? null;
    const checkOutAt = record?.checkOutAt ?? null;
    const workingMinutes = this.workingMinutes(checkInAt, checkOutAt);
    const remainingMs = extra?.checkoutAllowedInMs;
    const remainingSeconds =
      remainingMs != null ? Math.max(0, Math.ceil(remainingMs / 1000)) : undefined;
    const remainingMinutes =
      remainingMs != null ? Math.max(0, Math.ceil(remainingMs / 60000)) : undefined;

    return {
      result,
      message,
      teacher: teacher
        ? {
            id: teacher.id,
            fullName: teacher.fullName,
            employeeNo: teacher.employeeNo,
            designation: teacher.designation,
          }
        : null,
      workDate: record?.workDate ?? null,
      checkInAt,
      checkOutAt,
      workingMinutes,
      ...(remainingSeconds != null ? { remainingSeconds, remainingMinutes } : {}),
      ...(remainingMs != null
        ? { checkoutAllowedInMs: Math.max(0, Math.ceil(remainingMs)) }
        : {}),
      attendance: record
        ? {
            id: record.id,
            schoolId: record.schoolId,
            teacherId: record.teacherId,
            workDate: record.workDate,
            checkInAt: record.checkInAt,
            checkOutAt: record.checkOutAt,
            source: record.source,
            teacher: record.teacher,
            workingMinutes,
          }
        : null,
    };
  }

  private workingMinutes(checkInAt?: Date | null, checkOutAt?: Date | null): number | null {
    if (!checkInAt || !checkOutAt) return null;
    return Math.max(0, Math.floor((checkOutAt.getTime() - checkInAt.getTime()) / 60000));
  }

  private async assertCanPunchTeacher(
    currentUser: CurrentUser,
    teacher: { id: string; userId: string | null; schoolId: string },
    source: TeacherAttendanceSource,
  ) {
    if (currentUser.role === UserRole.SUPER_ADMIN || currentUser.role === UserRole.SCHOOL_ADMIN) {
      return;
    }

    // Gate/scanner staff may scan any teacher card in-school (QR only — never manual punch).
    if (
      (currentUser.role === UserRole.RECEPTIONIST ||
        currentUser.role === UserRole.ATTENDANCE_SCANNER) &&
      source === TeacherAttendanceSource.QR
    ) {
      return;
    }

    if (currentUser.role === UserRole.TEACHER) {
      if (!teacher.userId || teacher.userId !== currentUser.id) {
        throw new ForbiddenException('Teachers may only punch their own attendance');
      }
      return;
    }

    throw new ForbiddenException('Not authorized to punch teacher attendance');
  }

  private resolvePunchSchoolId(
    currentUser: CurrentUser,
    teacherSchoolId: string,
    dtoSchoolId?: string,
  ): string {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      if (dtoSchoolId && dtoSchoolId !== teacherSchoolId) {
        throw new ForbiddenException("Cannot access another school's data");
      }
      return teacherSchoolId;
    }

    if (!currentUser.schoolId) {
      throw new ForbiddenException('School context missing');
    }
    if (dtoSchoolId && dtoSchoolId !== currentUser.schoolId) {
      throw new ForbiddenException("Cannot access another school's data");
    }
    if (teacherSchoolId !== currentUser.schoolId) {
      throw new ForbiddenException("Cannot access another school's data");
    }
    return currentUser.schoolId;
  }

  private resolveListSchoolId(currentUser: CurrentUser, schoolId?: string): string {
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
      throw new ForbiddenException("Cannot access another school's data");
    }
    return currentUser.schoolId;
  }

  private async assertTeacherInSchool(teacherId: string, schoolId: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }
    if (teacher.schoolId !== schoolId) {
      throw new ForbiddenException('Teacher does not belong to the specified school');
    }
    return teacher;
  }

  /** Same calendar-day key pattern as StudentAttendance.date. */
  private normalizeWorkDate(dateStr: string): Date {
    return new Date(`${dateStr}T00:00:00.000Z`);
  }
}
