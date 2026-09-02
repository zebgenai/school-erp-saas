import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PayrollStatus, Prisma, StaffType, UserRole } from '@prisma/client';
import { resolvePagination } from '../common/dto/pagination-query.dto';
import { paginatedResult } from '../common/utils/paginated-result';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEngineService } from '../notifications/notification-engine.service';
import { GeneratePayrollDto } from './dto/generate-payroll.dto';
import { MarkPaidDto } from './dto/mark-paid.dto';
import { PayrollQueryDto } from './dto/payroll-query.dto';
import { UpdatePayrollDto } from './dto/update-payroll.dto';

const payrollInclude = {
  teacher: { select: { id: true, fullName: true, email: true, phone: true } },
  staff: { select: { id: true, fullName: true, designation: true, department: true } },
  paidBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.PayrollInclude;

@Injectable()
export class PayrollService {
  constructor(
    private prisma: PrismaService,
    private readonly notificationEngine: NotificationEngineService,
  ) {}

  async generate(dto: GeneratePayrollDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);
    const { month, year } = dto;

    const [teachers, staffMembers] = await Promise.all([
      this.prisma.teacher.findMany({ where: { schoolId, status: 'ACTIVE' } }),
      this.prisma.staff.findMany({ where: { schoolId, status: 'ACTIVE' } }),
    ]);

    const existingPayrolls = await this.prisma.payroll.findMany({
      where: { schoolId, month, year },
      select: { teacherId: true, staffId: true },
    });

    const existingTeacherIds = new Set(
      existingPayrolls.map((p) => p.teacherId).filter(Boolean) as string[],
    );
    const existingStaffIds = new Set(
      existingPayrolls.map((p) => p.staffId).filter(Boolean) as string[],
    );

    const newTeachers = teachers.filter((t) => !existingTeacherIds.has(t.id));
    const newStaff = staffMembers.filter((s) => !existingStaffIds.has(s.id));

    const payrollData: Prisma.PayrollCreateManyInput[] = [
      ...newTeachers.map((t) => {
        const basic = t.salary ?? 0;
        return {
          schoolId,
          staffType: StaffType.TEACHER,
          teacherId: t.id,
          staffName: t.fullName,
          month,
          year,
          basicSalary: basic,
          allowances: 0,
          deductions: 0,
          netSalary: basic,
          status: PayrollStatus.PENDING,
        };
      }),
      ...newStaff.map((s) => {
        const basic = s.salary ?? 0;
        return {
          schoolId,
          staffType: StaffType.STAFF,
          staffId: s.id,
          staffName: s.fullName,
          month,
          year,
          basicSalary: basic,
          allowances: 0,
          deductions: 0,
          netSalary: basic,
          status: PayrollStatus.PENDING,
        };
      }),
    ];

    if (payrollData.length === 0) {
      return {
        message: `All active teachers and staff already have payroll for ${month}/${year}`,
        created: 0,
        skipped: existingTeacherIds.size + existingStaffIds.size,
      };
    }

    await this.prisma.payroll.createMany({ data: payrollData });

    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitSalaryProcessed(schoolId, month, year, payrollData.length),
    );

    return {
      message: `Payroll generated for ${month}/${year}`,
      created: payrollData.length,
      skipped: existingTeacherIds.size + existingStaffIds.size,
      details: {
        teachersAdded: newTeachers.length,
        staffAdded: newStaff.length,
      },
    };
  }

  async findAll(currentUser: CurrentUser, query: PayrollQueryDto) {
    const where: Prisma.PayrollWhereInput = {
      ...this.buildSchoolFilter(currentUser, query.schoolId),
      ...(query.month ? { month: query.month } : {}),
      ...(query.year ? { year: query.year } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.staffType ? { staffType: query.staffType } : {}),
      ...(query.teacherId ? { teacherId: query.teacherId } : {}),
      ...(query.staffId ? { staffId: query.staffId } : {}),
    };

    if (query.search) {
      where.staffName = { contains: query.search, mode: 'insensitive' };
    }

    const { take, skip } = resolvePagination(query);
    const [data, total] = await Promise.all([
      this.prisma.payroll.findMany({
        where,
        include: payrollInclude,
        orderBy: [{ year: 'desc' }, { month: 'desc' }, { staffName: 'asc' }],
        take,
        skip,
      }),
      this.prisma.payroll.count({ where }),
    ]);

    return paginatedResult(data, total, take, skip);
  }

  async findOne(id: string, currentUser: CurrentUser) {
    const payroll = await this.findPayrollOrThrow(id);
    this.assertSchoolAccess(currentUser, payroll.schoolId);
    return payroll;
  }

  async update(id: string, dto: UpdatePayrollDto, currentUser: CurrentUser) {
    const payroll = await this.findPayrollOrThrow(id);
    this.assertSchoolAccess(currentUser, payroll.schoolId);

    if (payroll.status === PayrollStatus.PAID) {
      throw new BadRequestException('Cannot modify a payroll record that has already been paid');
    }

    const basicSalary = dto.basicSalary ?? payroll.basicSalary;
    const allowances = dto.allowances ?? payroll.allowances;
    const deductions = dto.deductions ?? payroll.deductions;
    const netSalary = basicSalary + allowances - deductions;

    return this.prisma.payroll.update({
      where: { id },
      data: {
        ...(dto.basicSalary !== undefined ? { basicSalary: dto.basicSalary } : {}),
        ...(dto.allowances !== undefined ? { allowances: dto.allowances } : {}),
        ...(dto.deductions !== undefined ? { deductions: dto.deductions } : {}),
        netSalary,
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: payrollInclude,
    });
  }

  async markPaid(id: string, dto: MarkPaidDto, currentUser: CurrentUser) {
    const payroll = await this.findPayrollOrThrow(id);
    this.assertSchoolAccess(currentUser, payroll.schoolId);

    if (payroll.status === PayrollStatus.PAID) {
      throw new BadRequestException('Payroll is already marked as paid');
    }
    if (payroll.status === PayrollStatus.CANCELLED) {
      throw new BadRequestException('Cannot mark a cancelled payroll as paid');
    }

    const noteParts: string[] = [];
    if (dto.method) noteParts.push(`Method: ${dto.method}`);
    if (dto.notes) noteParts.push(dto.notes);
    const combinedNotes = noteParts.length ? noteParts.join(' · ') : payroll.notes;

    const updated = await this.prisma.payroll.update({
      where: { id },
      data: {
        status: PayrollStatus.PAID,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        paidById: currentUser.id,
        ...(combinedNotes !== undefined ? { notes: combinedNotes } : {}),
      },
      include: payrollInclude,
    });

    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitPayrollPaid(payroll.schoolId, id),
    );

    return updated;
  }

  async cancel(id: string, currentUser: CurrentUser) {
    const payroll = await this.findPayrollOrThrow(id);
    this.assertSchoolAccess(currentUser, payroll.schoolId);

    if (payroll.status === PayrollStatus.PAID) {
      throw new BadRequestException('Cannot cancel a payroll record that has already been paid');
    }

    return this.prisma.payroll.update({
      where: { id },
      data: { status: PayrollStatus.CANCELLED },
      include: payrollInclude,
    });
  }

  async getSummary(currentUser: CurrentUser, query: PayrollQueryDto) {
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);
    const now = new Date();
    const month = query.month ?? now.getUTCMonth() + 1;
    const year = query.year ?? now.getUTCFullYear();

    const where: Prisma.PayrollWhereInput = {
      ...schoolFilter,
      month,
      year,
    };

    const [byStatus, aggregate] = await Promise.all([
      this.prisma.payroll.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
        _sum: { netSalary: true },
      }),
      this.prisma.payroll.aggregate({
        where: { ...where, status: { not: PayrollStatus.CANCELLED } },
        _sum: { netSalary: true, basicSalary: true, allowances: true, deductions: true },
        _count: { id: true },
      }),
    ]);

    const statusMap = Object.fromEntries(
      byStatus.map((g) => [g.status, { count: g._count.id, totalNet: g._sum.netSalary ?? 0 }]),
    );

    return {
      month,
      year,
      totalRecords: aggregate._count.id,
      totalNetSalary: aggregate._sum.netSalary ?? 0,
      totalBasicSalary: aggregate._sum.basicSalary ?? 0,
      totalAllowances: aggregate._sum.allowances ?? 0,
      totalDeductions: aggregate._sum.deductions ?? 0,
      pending: statusMap[PayrollStatus.PENDING] ?? { count: 0, totalNet: 0 },
      paid: statusMap[PayrollStatus.PAID] ?? { count: 0, totalNet: 0 },
      cancelled: statusMap[PayrollStatus.CANCELLED] ?? { count: 0, totalNet: 0 },
    };
  }

  private async findPayrollOrThrow(id: string) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id },
      include: payrollInclude,
    });
    if (!payroll) throw new NotFoundException('Payroll record not found');
    return payroll;
  }

  private resolveSchoolId(currentUser: CurrentUser, schoolId?: string): string {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      if (!schoolId) throw new BadRequestException('schoolId is required');
      return schoolId;
    }
    if (!currentUser.schoolId) throw new ForbiddenException('School context missing');
    if (schoolId && schoolId !== currentUser.schoolId) {
      throw new ForbiddenException("Cannot access another school's data");
    }
    return currentUser.schoolId;
  }

  private buildSchoolFilter(currentUser: CurrentUser, schoolId?: string) {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      return schoolId ? { schoolId } : {};
    }
    if (!currentUser.schoolId) throw new ForbiddenException('School context missing');
    if (schoolId && schoolId !== currentUser.schoolId) {
      throw new ForbiddenException("Cannot access another school's data");
    }
    return { schoolId: currentUser.schoolId };
  }

  private assertSchoolAccess(currentUser: CurrentUser, resourceSchoolId: string) {
    if (currentUser.role === UserRole.SUPER_ADMIN) return;
    if (!currentUser.schoolId) throw new ForbiddenException('School context missing');
    if (currentUser.schoolId !== resourceSchoolId) {
      throw new ForbiddenException("Cannot access another school's data");
    }
  }
}
