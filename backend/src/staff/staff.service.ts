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
import { CreateStaffDto } from './dto/create-staff.dto';
import { StaffQueryDto } from './dto/staff-query.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

const staffInclude = { user: { select: { id: true, email: true, role: true, status: true } } } satisfies Prisma.StaffInclude;

@Injectable()
export class StaffService {
  constructor(
    private prisma: PrismaService,
    private readonly notificationEngine: NotificationEngineService,
  ) {}

  async findAll(currentUser: CurrentUser, query: StaffQueryDto) {
    const where: Prisma.StaffWhereInput = {
      ...this.buildSchoolFilter(currentUser, query.schoolId),
      ...(query.status ? { status: query.status } : {}),
      ...(query.department ? { department: query.department } : {}),
    };

    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { designation: { contains: query.search, mode: 'insensitive' } },
        { department: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const { take, skip } = resolvePagination(query);
    const [data, total] = await Promise.all([
      this.prisma.staff.findMany({
        where,
        include: staffInclude,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.staff.count({ where }),
    ]);

    return paginatedResult(data, total, take, skip);
  }

  async findOne(id: string, currentUser: CurrentUser) {
    const staff = await this.findStaffOrThrow(id);
    this.assertSchoolAccess(currentUser, staff.schoolId);
    return staff;
  }

  async create(dto: CreateStaffDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);

    if (dto.userId) {
      await this.assertUserBelongsToSchool(dto.userId, schoolId);
      const existing = await this.prisma.staff.findUnique({ where: { userId: dto.userId } });
      if (existing) {
        throw new BadRequestException('This user is already linked to a staff profile');
      }
    }

    const staff = await this.prisma.staff.create({
      data: {
        schoolId,
        fullName: dto.fullName,
        designation: dto.designation,
        department: dto.department,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : undefined,
        salary: dto.salary,
        status: dto.status ?? 'ACTIVE',
        ...(dto.userId ? { userId: dto.userId } : {}),
      },
      include: staffInclude,
    });

    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitNewStaff(schoolId, staff.fullName, staff.id),
    );

    return staff;
  }

  async update(id: string, dto: UpdateStaffDto, currentUser: CurrentUser) {
    const staff = await this.findStaffOrThrow(id);
    this.assertSchoolAccess(currentUser, staff.schoolId);

    if (dto.userId && dto.userId !== staff.userId) {
      await this.assertUserBelongsToSchool(dto.userId, staff.schoolId);
      const existing = await this.prisma.staff.findUnique({ where: { userId: dto.userId } });
      if (existing && existing.id !== id) {
        throw new BadRequestException('This user is already linked to another staff profile');
      }
    }

    return this.prisma.staff.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.designation !== undefined ? { designation: dto.designation } : {}),
        ...(dto.department !== undefined ? { department: dto.department } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.joiningDate !== undefined ? { joiningDate: new Date(dto.joiningDate) } : {}),
        ...(dto.salary !== undefined ? { salary: dto.salary } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.userId !== undefined ? { userId: dto.userId } : {}),
      },
      include: staffInclude,
    });
  }

  async remove(id: string, currentUser: CurrentUser) {
    const staff = await this.findStaffOrThrow(id);
    this.assertSchoolAccess(currentUser, staff.schoolId);

    return this.prisma.staff.update({
      where: { id },
      data: { status: 'INACTIVE' },
      include: staffInclude,
    });
  }

  async permanentDelete(id: string, currentUser: CurrentUser) {
    const staff = await this.findStaffOrThrow(id);
    this.assertSchoolAccess(currentUser, staff.schoolId);

    const paidPayrollCount = await this.prisma.payroll.count({
      where: { staffId: id, status: 'PAID' },
    });
    if (paidPayrollCount > 0) {
      throw new BadRequestException(
        `Cannot permanently delete "${staff.fullName}" — ${paidPayrollCount} paid payroll record(s) exist. Archive the staff member instead.`,
      );
    }

    // Remove pending/cancelled payroll records before deletion
    await this.prisma.payroll.deleteMany({
      where: { staffId: id, status: { in: ['PENDING', 'CANCELLED'] } },
    });

    return this.prisma.staff.delete({ where: { id } });
  }

  private async findStaffOrThrow(id: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
      include: staffInclude,
    });
    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }
    return staff;
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
