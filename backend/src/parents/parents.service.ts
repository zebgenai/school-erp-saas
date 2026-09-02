import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { resolvePagination } from '../common/dto/pagination-query.dto';
import { monthYearRange } from '../common/utils/month-year-range';
import { paginatedResult } from '../common/utils/paginated-result';
import { NotificationEngineService } from '../notifications/notification-engine.service';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateParentDto } from './dto/create-parent.dto';
import { ParentQueryDto } from './dto/parent-query.dto';
import { UpdateParentDto } from './dto/update-parent.dto';

const parentInclude = {
  user: { select: { id: true, email: true, role: true, status: true } },
  student: { select: { id: true, fullName: true, admissionNo: true, classId: true, class: { select: { name: true } } } },
} satisfies Prisma.ParentInclude;

@Injectable()
export class ParentsService {
  constructor(
    private prisma: PrismaService,
    private readonly notificationEngine: NotificationEngineService,
  ) {}

  async findAll(currentUser: CurrentUser, query: ParentQueryDto) {
    const registeredRange = monthYearRange(query.month, query.year);
    const where: Prisma.ParentWhereInput = {
      ...this.buildSchoolFilter(currentUser, query.schoolId),
      ...(query.status ? { status: query.status } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(registeredRange ? { createdAt: registeredRange } : {}),
    };

    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { student: { fullName: { contains: query.search, mode: 'insensitive' } } },
        { student: { admissionNo: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const { take, skip } = resolvePagination(query);
    const [data, total] = await Promise.all([
      this.prisma.parent.findMany({
        where,
        include: parentInclude,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.parent.count({ where }),
    ]);

    return paginatedResult(data, total, take, skip);
  }

  async findOne(id: string, currentUser: CurrentUser) {
    const parent = await this.findParentOrThrow(id);
    this.assertSchoolAccess(currentUser, parent.schoolId);
    return parent;
  }

  async create(dto: CreateParentDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);

    if (dto.userId) {
      await this.assertUserBelongsToSchool(dto.userId, schoolId);
      const existing = await this.prisma.parent.findUnique({ where: { userId: dto.userId } });
      if (existing) {
        throw new BadRequestException('This user is already linked to a parent profile');
      }
    }

    if (dto.studentId) {
      await this.assertStudentBelongsToSchool(dto.studentId, schoolId);
    }

    const parent = await this.prisma.parent.create({
      data: {
        schoolId,
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        status: dto.status ?? 'ACTIVE',
        ...(dto.studentId ? { studentId: dto.studentId } : {}),
        ...(dto.userId ? { userId: dto.userId } : {}),
      },
      include: parentInclude,
    });

    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitNewParent(schoolId, parent.fullName, parent.id),
    );

    return parent;
  }

  async update(id: string, dto: UpdateParentDto, currentUser: CurrentUser) {
    const parent = await this.findParentOrThrow(id);
    this.assertSchoolAccess(currentUser, parent.schoolId);

    if (dto.userId && dto.userId !== parent.userId) {
      await this.assertUserBelongsToSchool(dto.userId, parent.schoolId);
      const existing = await this.prisma.parent.findUnique({ where: { userId: dto.userId } });
      if (existing && existing.id !== id) {
        throw new BadRequestException('This user is already linked to another parent profile');
      }
    }

    if (dto.studentId && dto.studentId !== parent.studentId) {
      await this.assertStudentBelongsToSchool(dto.studentId, parent.schoolId);
    }

    return this.prisma.parent.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.studentId !== undefined ? { studentId: dto.studentId || null } : {}),
        ...(dto.userId !== undefined ? { userId: dto.userId } : {}),
      },
      include: parentInclude,
    });
  }

  async remove(id: string, currentUser: CurrentUser) {
    const parent = await this.findParentOrThrow(id);
    this.assertSchoolAccess(currentUser, parent.schoolId);

    return this.prisma.parent.update({
      where: { id },
      data: { status: 'INACTIVE' },
      include: parentInclude,
    });
  }

  async permanentDelete(id: string, currentUser: CurrentUser) {
    const parent = await this.findParentOrThrow(id);
    this.assertSchoolAccess(currentUser, parent.schoolId);

    return this.prisma.parent.delete({ where: { id } });
  }

  /** Parent-role only: full portal data for the logged-in parent */
  async getMyPortal(currentUser: CurrentUser) {
    const parent = await this.prisma.parent.findFirst({
      where: { userId: currentUser.id },
      include: {
        student: {
          include: {
            class: true,
            section: true,
          },
        },
      },
    });

    if (!parent) {
      throw new NotFoundException('Parent profile not found for this account');
    }

    const student = parent.student;
    if (!student) {
      return { parent, student: null, attendance: [], fees: [], notices: [], timetable: [] };
    }

    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const year = now.getUTCFullYear();
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const last30Start = new Date(Date.UTC(year, month - 1, now.getUTCDate() - 29));

    const [attendance, fees, notices, timetable, marks] = await Promise.all([
      this.prisma.studentAttendance.findMany({
        where: {
          studentId: student.id,
          date: { gte: last30Start, lte: now },
        },
        orderBy: { date: 'desc' },
        take: 30,
      }),
      this.prisma.feeInvoice.findMany({
        where: { studentId: student.id },
        include: { payments: { orderBy: { paymentDate: 'desc' }, take: 5 } },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 12,
      }),
      this.prisma.notice.findMany({
        where: { schoolId: parent.schoolId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      student.classId
        ? this.prisma.timetableEntry.findMany({
            where: { schoolId: parent.schoolId, classId: student.classId },
            include: {
              subject: { select: { name: true } },
              teacher: { select: { fullName: true } },
            },
            orderBy: [{ dayOfWeek: 'asc' }, { periodNo: 'asc' }],
          })
        : Promise.resolve([]),
      this.prisma.mark.findMany({
        where: { studentId: student.id },
        include: {
          exam:    { select: { name: true, startDate: true } },
          subject: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const presentCount = attendance.filter((a) => a.status === 'PRESENT').length;
    const absentCount = attendance.filter((a) => a.status === 'ABSENT').length;
    const lateCount = attendance.filter((a) => a.status === 'LATE').length;

    return {
      parent: { id: parent.id, fullName: parent.fullName, email: parent.email, phone: parent.phone },
      student: {
        id: student.id,
        fullName: student.fullName,
        admissionNo: student.admissionNo,
        class: student.class,
        section: student.section,
        status: student.status,
      },
      attendanceSummary: {
        total: attendance.length,
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        rate: attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0,
      },
      attendance,
      fees,
      notices,
      timetable,
      results: marks,
    };
  }

  private async findParentOrThrow(id: string) {
    const parent = await this.prisma.parent.findUnique({
      where: { id },
      include: parentInclude,
    });
    if (!parent) {
      throw new NotFoundException('Parent not found');
    }
    return parent;
  }

  private async assertUserBelongsToSchool(userId: string, schoolId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.schoolId !== schoolId) {
      throw new BadRequestException('User does not belong to the specified school');
    }
  }

  private async assertStudentBelongsToSchool(studentId: string, schoolId: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    if (student.schoolId !== schoolId) {
      throw new BadRequestException('Student does not belong to the specified school');
    }
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
      throw new ForbiddenException("Cannot access another school's data");
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
      throw new ForbiddenException("Cannot access another school's data");
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
      throw new ForbiddenException("Cannot access another school's data");
    }
  }
}
