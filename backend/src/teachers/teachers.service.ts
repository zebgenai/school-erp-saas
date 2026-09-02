import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { resolvePagination } from '../common/dto/pagination-query.dto';
import { paginatedResult } from '../common/utils/paginated-result';
import { NotificationEngineService } from '../notifications/notification-engine.service';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { TeacherQueryDto } from './dto/teacher-query.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';

const teacherInclude = {
  user: { select: { id: true, email: true, role: true, status: true } },
  subjectsTaught: {
    select: {
      id: true,
      name: true,
      code: true,
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
    },
    orderBy: { name: 'asc' },
  },
  classesLed: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
  sectionsLed: {
    select: { id: true, name: true, class: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  },
} satisfies Prisma.TeacherInclude;

@Injectable()
export class TeachersService {
  constructor(
    private prisma: PrismaService,
    private readonly notificationEngine: NotificationEngineService,
  ) {}

  async findAll(currentUser: CurrentUser, query: TeacherQueryDto) {
    const where: Prisma.TeacherWhereInput = {
      ...this.buildSchoolFilter(currentUser, query.schoolId),
      ...(query.status ? { status: query.status } : {}),
    };

    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const { take, skip } = resolvePagination(query);
    const [data, total] = await Promise.all([
      this.prisma.teacher.findMany({
        where,
        include: teacherInclude,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.teacher.count({ where }),
    ]);

    return paginatedResult(data, total, take, skip);
  }

  async findOne(id: string, currentUser: CurrentUser) {
    const teacher = await this.findTeacherOrThrow(id);
    this.assertSchoolAccess(currentUser, teacher.schoolId);
    return teacher;
  }

  async create(dto: CreateTeacherDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);

    if (dto.userId) {
      await this.assertUserBelongsToSchool(dto.userId, schoolId);
      const existing = await this.prisma.teacher.findUnique({ where: { userId: dto.userId } });
      if (existing) {
        throw new BadRequestException('This user is already linked to a teacher profile');
      }
    }

    const teacher = await this.prisma.teacher.create({
      data: {
        schoolId,
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        salary: dto.salary,
        status: dto.status ?? 'ACTIVE',
        ...(dto.userId ? { userId: dto.userId } : {}),
      },
      include: teacherInclude,
    });

    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitNewTeacher(schoolId, teacher.fullName, teacher.id),
    );

    return teacher;
  }

  async update(id: string, dto: UpdateTeacherDto, currentUser: CurrentUser) {
    const teacher = await this.findTeacherOrThrow(id);
    this.assertSchoolAccess(currentUser, teacher.schoolId);

    if (dto.userId && dto.userId !== teacher.userId) {
      await this.assertUserBelongsToSchool(dto.userId, teacher.schoolId);
      const existing = await this.prisma.teacher.findUnique({ where: { userId: dto.userId } });
      if (existing && existing.id !== id) {
        throw new BadRequestException('This user is already linked to another teacher profile');
      }
    }

    return this.prisma.teacher.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.salary !== undefined ? { salary: dto.salary } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.userId !== undefined ? { userId: dto.userId } : {}),
      },
      include: teacherInclude,
    });
  }

  async remove(id: string, currentUser: CurrentUser) {
    const teacher = await this.findTeacherOrThrow(id);
    this.assertSchoolAccess(currentUser, teacher.schoolId);

    return this.prisma.teacher.update({
      where: { id },
      data: { status: 'INACTIVE' },
      include: teacherInclude,
    });
  }

  /**
   * Replace the teacher's subject assignments with the supplied set. Reuses the
   * `Subject.teacherId` relation rather than a parallel join table.
   */
  async assignSubjects(id: string, subjectIds: string[], currentUser: CurrentUser) {
    const teacher = await this.findTeacherOrThrow(id);
    this.assertSchoolAccess(currentUser, teacher.schoolId);

    const unique = [...new Set(subjectIds)];

    if (unique.length > 0) {
      const subjects = await this.prisma.subject.findMany({
        where: { id: { in: unique } },
        select: { id: true, schoolId: true },
      });

      if (subjects.length !== unique.length) {
        throw new NotFoundException('One or more selected subjects no longer exist');
      }
      const foreign = subjects.find((s) => s.schoolId !== teacher.schoolId);
      if (foreign) {
        throw new BadRequestException('Subject does not belong to the specified school');
      }
    }

    await this.prisma.$transaction([
      this.prisma.subject.updateMany({
        where: { teacherId: id, ...(unique.length ? { id: { notIn: unique } } : {}) },
        data: { teacherId: null },
      }),
      ...(unique.length
        ? [
            this.prisma.subject.updateMany({
              where: { id: { in: unique } },
              data: { teacherId: id },
            }),
          ]
        : []),
    ]);

    return this.findTeacherOrThrow(id);
  }

  /** Teacher-role only: full portal data for the logged-in teacher */
  async getMyPortal(currentUser: CurrentUser) {
    if (!currentUser.schoolId) throw new ForbiddenException('School context missing');
    const schoolId = currentUser.schoolId;

    const teacher = await this.prisma.teacher.findFirst({
      where: { userId: currentUser.id, schoolId },
      include: teacherInclude,
    });
    if (!teacher) throw new NotFoundException('Teacher profile not found for this account');

    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const year = now.getUTCFullYear();
    const today = new Date(`${now.toISOString().split('T')[0]}T00:00:00.000Z`);

    const [timetable, todayAttendance, recentAttendance, examSubjects, payroll] = await Promise.all([
      this.prisma.timetableEntry.findMany({
        where: { schoolId, teacherId: teacher.id },
        include: {
          subject: { select: { name: true } },
          class:   { select: { name: true } },
          section: { select: { name: true } },
        },
        orderBy: [{ dayOfWeek: 'asc' }, { periodNo: 'asc' }],
      }),
      this.prisma.timetableEntry.findMany({
        where: { schoolId, teacherId: teacher.id },
        select: { classId: true },
      }).then(async (entries) => {
        const classIds = [...new Set(entries.map((t) => t.classId).filter(Boolean))] as string[];
        if (classIds.length === 0) return [];
        return this.prisma.studentAttendance.findMany({
          where: { schoolId, date: today, classId: { in: classIds } },
          include: {
            student: { select: { fullName: true, admissionNo: true } },
            class:   { select: { name: true } },
            section: { select: { name: true } },
          },
          orderBy: { student: { fullName: 'asc' } },
          take: 50,
        });
      }),
      this.prisma.studentAttendance.groupBy({
        by: ['date'],
        where: {
          schoolId,
          date: {
            gte: new Date(Date.UTC(year, month - 1, 1)),
            lte: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
          },
        },
        _count: { studentId: true },
        orderBy: { date: 'desc' },
      }),
      this.prisma.timetableEntry.findMany({
        where: { schoolId, teacherId: teacher.id },
        select: { classId: true, subjectId: true },
      }).then(async (entries) => {
        const classIds = [...new Set(entries.map((t) => t.classId).filter(Boolean))] as string[];
        const subjectIds = [...new Set(entries.map((t) => t.subjectId).filter(Boolean))] as string[];
        if (classIds.length === 0 && subjectIds.length === 0) return [];
        return this.prisma.examSubject.findMany({
          where: {
            schoolId,
            ...(subjectIds.length > 0 ? { subjectId: { in: subjectIds } } : {}),
            ...(classIds.length > 0 ? { exam: { classId: { in: classIds } } } : {}),
          },
          include: {
            exam:    { select: { name: true, status: true, startDate: true, classId: true, sectionId: true } },
            subject: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });
      }),
      this.prisma.payroll.findMany({
        where: { teacherId: teacher.id },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 6,
      }),
    ]);

    // Derive unique classes from timetable entries
    const classIds = [...new Set(timetable.map((t) => t.classId).filter(Boolean))];
    const classes = await this.prisma.class.findMany({
      where: { id: { in: classIds as string[] } },
      include: { sections: true },
    });

    return {
      teacher: {
        id:       teacher.id,
        fullName: teacher.fullName,
        email:    teacher.email,
        phone:    teacher.phone,
        salary:   teacher.salary,
        status:   teacher.status,
      },
      timetable,
      classes,
      todayAttendance,
      recentAttendance,
      examSubjects,
      payroll,
    };
  }

  async permanentDelete(id: string, currentUser: CurrentUser) {
    const teacher = await this.findTeacherOrThrow(id);
    this.assertSchoolAccess(currentUser, teacher.schoolId);

    const paidPayrollCount = await this.prisma.payroll.count({
      where: { teacherId: id, status: 'PAID' },
    });
    if (paidPayrollCount > 0) {
      throw new BadRequestException(
        `Cannot permanently delete "${teacher.fullName}" — ${paidPayrollCount} paid payroll record(s) exist. Archive the teacher instead.`,
      );
    }

    // Remove pending/cancelled payroll records before deletion
    await this.prisma.payroll.deleteMany({
      where: { teacherId: id, status: { in: ['PENDING', 'CANCELLED'] } },
    });

    return this.prisma.teacher.delete({ where: { id } });
  }

  private async findTeacherOrThrow(id: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id },
      include: teacherInclude,
    });
    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }
    return teacher;
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
