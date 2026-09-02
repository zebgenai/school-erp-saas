import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AuditAction, SubscriptionStatus, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationEngineService } from '../notifications/notification-engine.service';
import { CurrentUser } from '../common/types/current-user.type';
import {
  ACTIONS,
  CUSTOM_BASE_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  EDITABLE_ROLES,
  FIXED_FULL_ACCESS_ROLES,
  MODULES,
  PLATFORM_ROLES,
  ROLE_LABELS,
  SCHOOL_SCOPED_ROLES,
  isPlatformRole,
  sanitisePermissions,
  PermKey,
} from '../roles/roles.constants';
import { assertStrongPassword } from '../common/validators/password.validator';

@Injectable()
export class SuperAdminService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private auditLogs: AuditLogsService,
    private readonly notificationEngine: NotificationEngineService,
  ) {}

  // ─── Dashboard ───────────────────────────────────────────────────────────────

  async getDashboard() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [
      totalSchools,
      activeSchools,
      suspendedSchools,
      trialSchools,
      expiringSchools,
      totalStudents,
      totalTeachers,
      totalStaff,
      totalParents,
      newSchoolsThisMonth,
      mrr,
      arr,
      activeSubscriptions,
      pendingInvoices,
    ] = await Promise.all([
      this.prisma.school.count(),
      this.prisma.school.count({ where: { status: 'ACTIVE' } }),
      this.prisma.school.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.schoolSubscription.count({ where: { status: 'TRIAL' } }),
      this.prisma.schoolSubscription.count({
        where: {
          status: { in: ['ACTIVE', 'TRIAL'] },
          endDate: { gte: now, lte: thirtyDaysLater },
        },
      }),
      this.prisma.student.count(),
      this.prisma.teacher.count({ where: { status: 'ACTIVE' } }),
      this.prisma.staff.count({ where: { status: 'ACTIVE' } }),
      this.prisma.parent.count(),
      this.prisma.school.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.saasInvoice.aggregate({
        where: { status: 'PAID', paidAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      this.prisma.saasInvoice.aggregate({
        where: { status: 'PAID', paidAt: { gte: yearStart } },
        _sum: { amount: true },
      }),
      this.prisma.schoolSubscription.count({
        where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      }),
      this.prisma.saasInvoice.count({ where: { status: 'PENDING' } }),
    ]);

    return {
      totalSchools,
      activeSchools,
      suspendedSchools,
      trialSchools,
      expiringSchools,
      totalStudents,
      totalTeachers,
      totalStaff,
      totalParents,
      newSchoolsThisMonth,
      activeSubscriptions,
      pendingRenewals: pendingInvoices,
      mrr: Number(mrr._sum.amount ?? 0),
      arr: Number(arr._sum.amount ?? 0),
    };
  }

  async getRevenueChart() {
    // Last 12 months of revenue
    const months: { label: string; revenue: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const agg = await this.prisma.saasInvoice.aggregate({
        where: { status: 'PAID', paidAt: { gte: start, lte: end } },
        _sum: { amount: true },
      });
      months.push({
        label: start.toLocaleDateString('en', { month: 'short', year: '2-digit' }),
        revenue: Number(agg._sum.amount ?? 0),
      });
    }
    return months;
  }

  async getSchoolGrowth() {
    const months: { label: string; newSchools: number; total: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const newSchools = await this.prisma.school.count({
        where: { createdAt: { gte: start, lte: end } },
      });
      const total = await this.prisma.school.count({
        where: { createdAt: { lte: end } },
      });
      months.push({
        label: start.toLocaleDateString('en', { month: 'short', year: '2-digit' }),
        newSchools,
        total,
      });
    }
    return months;
  }

  // ─── Schools ─────────────────────────────────────────────────────────────────

  async getSchools(opts: { search?: string; status?: string; limit?: number; skip?: number }) {
    const where: any = {};
    if (opts.status) where.status = opts.status;
    if (opts.search) {
      where.OR = [
        { name: { contains: opts.search, mode: 'insensitive' } },
        { email: { contains: opts.search, mode: 'insensitive' } },
        { ownerName: { contains: opts.search, mode: 'insensitive' } },
      ];
    }

    const [schools, total] = await Promise.all([
      this.prisma.school.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: opts.limit ?? 50,
        skip: opts.skip ?? 0,
        include: {
          subscription: { include: { plan: true } },
          _count: { select: { students: true, teachers: true, staff: true } },
        },
      }),
      this.prisma.school.count({ where }),
    ]);

    return { data: schools, total };
  }

  async activateSchool(id: string, currentUser: CurrentUser) {
    const school = await this.findSchoolOrThrow(id);
    const updated = await this.prisma.school.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
    await this.auditLogs.log({
      action: AuditAction.SCHOOL_ACTIVATED,
      actorId: currentUser.id,
      actorName: currentUser.name,
      schoolId: id,
      schoolName: school.name,
    });
    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitSchoolActivated(id, school.name),
    );
    return updated;
  }

  async suspendSchool(id: string, reason: string | undefined, currentUser: CurrentUser) {
    const school = await this.findSchoolOrThrow(id);
    const updated = await this.prisma.school.update({
      where: { id },
      data: { status: 'SUSPENDED' },
    });
    if (school.subscription) {
      await this.prisma.schoolSubscription.update({
        where: { schoolId: id },
        data: { status: SubscriptionStatus.SUSPENDED },
      });
    }
    await this.auditLogs.log({
      action: AuditAction.SCHOOL_SUSPENDED,
      actorId: currentUser.id,
      actorName: currentUser.name,
      schoolId: id,
      schoolName: school.name,
      metadata: { reason },
    });
    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitSchoolSuspended(id, school.name),
    );
    return updated;
  }

  async assignPlan(
    schoolId: string,
    planId: string,
    opts: { endDate?: string; status?: SubscriptionStatus },
    currentUser: CurrentUser,
  ) {
    const [school, plan] = await Promise.all([
      this.findSchoolOrThrow(schoolId),
      this.prisma.subscriptionPlan.findUnique({ where: { id: planId } }),
    ]);
    if (!plan) throw new NotFoundException('Plan not found');

    const existing = await this.prisma.schoolSubscription.findUnique({
      where: { schoolId },
    });

    const subStatus = opts.status ?? (plan.tier === 'TRIAL' ? SubscriptionStatus.TRIAL : SubscriptionStatus.ACTIVE);
    const endDate = opts.endDate ? new Date(opts.endDate) : undefined;

    let sub;
    if (existing) {
      sub = await this.prisma.schoolSubscription.update({
        where: { schoolId },
        data: { planId, status: subStatus, ...(endDate ? { endDate } : {}) },
        include: { plan: true },
      });
    } else {
      sub = await this.prisma.schoolSubscription.create({
        data: {
          schoolId,
          planId,
          status: subStatus,
          ...(endDate ? { endDate } : {}),
        },
        include: { plan: true },
      });
    }

    await this.auditLogs.log({
      action: existing ? AuditAction.PLAN_CHANGED : AuditAction.PLAN_ASSIGNED,
      actorId: currentUser.id,
      actorName: currentUser.name,
      schoolId,
      schoolName: school.name,
      metadata: { planId, planName: plan.name, previousPlanId: existing?.planId },
    });

    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitPlanChanged(schoolId, plan.name),
    );

    return sub;
  }

  async extendSubscription(
    schoolId: string,
    days: number,
    currentUser: CurrentUser,
  ) {
    const sub = await this.prisma.schoolSubscription.findUnique({
      where: { schoolId },
    });
    if (!sub) throw new BadRequestException('School has no subscription');

    const currentEnd = sub.endDate ?? new Date();
    const newEnd = new Date(currentEnd.getTime() + days * 24 * 60 * 60 * 1000);

    const updated = await this.prisma.schoolSubscription.update({
      where: { schoolId },
      data: { endDate: newEnd, status: SubscriptionStatus.ACTIVE },
      include: { plan: true },
    });

    await this.auditLogs.log({
      action: AuditAction.SUBSCRIPTION_EXTENDED,
      actorId: currentUser.id,
      actorName: currentUser.name,
      schoolId,
      metadata: { days, newEndDate: newEnd.toISOString() },
    });

    return updated;
  }

  async impersonate(schoolId: string, currentUser: CurrentUser) {
    const schoolAdmin = await this.prisma.user.findFirst({
      where: { schoolId, role: 'SCHOOL_ADMIN', status: 'ACTIVE' },
      include: { school: true },
    });
    if (!schoolAdmin) {
      throw new NotFoundException(
        'No active school admin user found for this school',
      );
    }

    const payload = {
      sub: schoolAdmin.id,
      email: schoolAdmin.email,
      name: schoolAdmin.name,
      role: schoolAdmin.role,
      schoolId: schoolAdmin.schoolId,
      impersonatedBy: currentUser.id,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    await this.auditLogs.log({
      action: AuditAction.IMPERSONATION,
      actorId: currentUser.id,
      actorName: currentUser.name,
      schoolId,
      schoolName: schoolAdmin.school?.name,
      metadata: {
        targetUserId: schoolAdmin.id,
        targetEmail: schoolAdmin.email,
      },
    });

    const { password: _p, ...safeUser } = schoolAdmin as any;
    return { accessToken, user: safeUser };
  }

  // ─── Billing ─────────────────────────────────────────────────────────────────

  async getBilling(opts: { schoolId?: string; status?: string; limit?: number }) {
    const where: any = {};
    if (opts.schoolId) where.schoolId = opts.schoolId;
    if (opts.status) where.status = opts.status;

    return this.prisma.saasInvoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 50,
      include: { school: { select: { name: true, email: true } } },
    });
  }

  async createInvoice(dto: {
    schoolId: string;
    amount: number;
    period: string;
    dueDate: string;
    notes?: string;
  }) {
    const sub = await this.prisma.schoolSubscription.findUnique({
      where: { schoolId: dto.schoolId },
    });
    if (!sub) throw new BadRequestException('School has no active subscription');

    const count = await this.prisma.saasInvoice.count();
    const invoiceNo = `INV-${String(count + 1).padStart(5, '0')}`;

    return this.prisma.saasInvoice.create({
      data: {
        invoiceNo,
        schoolId: dto.schoolId,
        subscriptionId: sub.id,
        amount: dto.amount,
        period: dto.period,
        dueDate: new Date(dto.dueDate),
        notes: dto.notes,
        status: 'PENDING',
      },
      include: { school: { select: { name: true } } },
    });
  }

  async markInvoicePaid(invoiceId: string) {
    return this.prisma.saasInvoice.update({
      where: { id: invoiceId },
      data: { status: 'PAID', paidAt: new Date() },
    });
  }

  // ─── School Creation with Admin ──────────────────────────────────────────────

  async createSchoolWithAdmin(
    dto: {
      name: string;
      code?: string;
      address?: string;
      phone?: string;
      email?: string;
      adminName: string;
      adminEmail: string;
      adminPassword: string;
    },
    currentUser: CurrentUser,
  ) {
    const existing = await this.prisma.school.findFirst({
      where: { OR: [{ name: dto.name }, { slug: this.toSlug(dto.name) }] },
    });
    if (existing) throw new ConflictException(`School "${dto.name}" already exists`);

    const adminExists = await this.prisma.user.findUnique({ where: { email: dto.adminEmail.toLowerCase() } });
    if (adminExists) throw new ConflictException(`Email "${dto.adminEmail}" is already in use`);

    const hashed = await bcrypt.hash(dto.adminPassword, 10);

    const school = await this.prisma.$transaction(async (tx) => {
      const s = await tx.school.create({
        data: {
          name:     dto.name,
          slug:     this.toSlug(dto.name),
          address:  dto.address,
          phone:    dto.phone,
          email:    dto.email,
          ownerName: dto.adminName,
          status:   'ACTIVE',
        },
      });

      await tx.user.create({
        data: {
          schoolId: s.id,
          name:     dto.adminName,
          email:    dto.adminEmail.toLowerCase(),
          password: hashed,
          role:     UserRole.SCHOOL_ADMIN,
          status:   UserStatus.ACTIVE,
        },
      });

      return s;
    });

    await this.auditLogs.log({
      action:     AuditAction.SCHOOL_CREATED,
      actorId:    currentUser.id,
      actorName:  currentUser.name,
      schoolId:   school.id,
      schoolName: school.name,
      metadata:   { adminEmail: dto.adminEmail },
    });

    return { school, adminEmail: dto.adminEmail };
  }

  // ─── Update School ───────────────────────────────────────────────────────────

  async updateSchool(
    id: string,
    dto: { name?: string; email?: string; phone?: string; address?: string; ownerName?: string; code?: string },
    currentUser: CurrentUser,
  ) {
    const school = await this.findSchoolOrThrow(id);

    const updated = await this.prisma.school.update({
      where: { id },
      data: {
        ...(dto.name      ? { name: dto.name }           : {}),
        ...(dto.email     ? { email: dto.email }         : {}),
        ...(dto.phone     ? { phone: dto.phone }         : {}),
        ...(dto.address   ? { address: dto.address }     : {}),
        ...(dto.ownerName ? { ownerName: dto.ownerName } : {}),
      },
      include: { subscription: { include: { plan: true } } },
    });

    await this.auditLogs.log({
      action:     AuditAction.SCHOOL_UPDATED,
      actorId:    currentUser.id,
      actorName:  currentUser.name,
      schoolId:   id,
      schoolName: school.name,
      metadata:   { changes: dto },
    });

    return updated;
  }

  // ─── School Detail ───────────────────────────────────────────────────────────

  async getSchoolById(id: string) {
    const school = await this.prisma.school.findUnique({
      where: { id },
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { students: true, teachers: true, staff: true, parents: true } },
      },
    });
    if (!school) throw new NotFoundException('School not found');
    return school;
  }

  // ─── School Users (User Management) ─────────────────────────────────────────

  async getSchoolUsers(
    schoolId: string,
    opts: { search?: string; role?: string; status?: string; limit?: number; skip?: number },
  ) {
    await this.findSchoolOrThrow(schoolId);

    const where: any = { schoolId };
    if (opts.role)   where.role   = opts.role;
    if (opts.status) where.status = opts.status;
    if (opts.search) {
      where.OR = [
        { name:  { contains: opts.search, mode: 'insensitive' } },
        { email: { contains: opts.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true, name: true, email: true, role: true, status: true,
          lastLoginAt: true, forcePasswordChange: true, lockedUntil: true,
          loginAttempts: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: opts.limit ?? 50,
        skip: opts.skip ?? 0,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: users, total };
  }

  async createSchoolUser(
    schoolId: string,
    dto: { name: string; email: string; password: string; role: UserRole },
    currentUser: CurrentUser,
  ) {
    await this.findSchoolOrThrow(schoolId);
    if (isPlatformRole(dto.role)) {
      throw new BadRequestException('Platform roles cannot be assigned to a school. Use Platform Team instead.');
    }

    const exists = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (exists) throw new ConflictException(`Email "${dto.email}" is already registered`);

    const hashed = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        schoolId,
        name:     dto.name,
        email:    dto.email.toLowerCase(),
        password: hashed,
        role:     dto.role,
        status:   UserStatus.ACTIVE,
      },
      select: {
        id: true, name: true, email: true, role: true, status: true, createdAt: true,
      },
    });

    await this.auditLogs.log({
      action:    AuditAction.USER_CREATED,
      actorId:   currentUser.id,
      actorName: currentUser.name,
      schoolId,
      metadata:  { targetUserId: user.id, targetEmail: user.email, role: user.role },
    });

    return user;
  }

  async updateSchoolUser(
    userId: string,
    dto: { name?: string; email?: string },
    currentUser: CurrentUser,
  ) {
    const user = await this.findUserOrThrow(userId);
    this.assertNotPlatformTarget(user);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name  ? { name:  dto.name }                    : {}),
        ...(dto.email ? { email: dto.email.toLowerCase() }     : {}),
      },
      select: { id: true, name: true, email: true, role: true, status: true },
    });

    await this.auditLogs.log({
      action:    AuditAction.USER_UPDATED,
      actorId:   currentUser.id,
      actorName: currentUser.name,
      schoolId:  user.schoolId ?? '',
      metadata:  { targetUserId: userId, changes: dto },
    });

    return updated;
  }

  async resetUserPassword(
    userId: string,
    newPassword: string,
    forceChange: boolean,
    currentUser: CurrentUser,
  ) {
    const user = await this.findUserOrThrow(userId);
    if (isPlatformRole(user.role) && !user.schoolId) {
      this.assertPlatformOwner(currentUser);
      assertStrongPassword(newPassword);
    }
    const hashed = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashed,
        forcePasswordChange: forceChange,
        loginAttempts: 0,
        lockedUntil:   null,
      },
    });

    await this.auditLogs.log({
      action:    AuditAction.PASSWORD_RESET,
      actorId:   currentUser.id,
      actorName: currentUser.name,
      schoolId:  user.schoolId ?? '',
      metadata:  { targetUserId: userId, targetEmail: user.email, forceChange },
    });

    return { message: 'Password reset successfully' };
  }

  async changeUserRole(
    userId: string,
    newRole: UserRole,
    currentUser: CurrentUser,
  ) {
    const user = await this.findUserOrThrow(userId);
    this.assertNotPlatformTarget(user);
    const oldRole = user.role;

    if (isPlatformRole(newRole)) {
      throw new BadRequestException('Platform roles cannot be assigned to a school. Use Platform Team instead.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
      select: { id: true, name: true, email: true, role: true, status: true },
    });

    await this.auditLogs.log({
      action:    AuditAction.ROLE_CHANGED,
      actorId:   currentUser.id,
      actorName: currentUser.name,
      schoolId:  user.schoolId ?? '',
      metadata:  { targetUserId: userId, oldRole, newRole },
    });

    return updated;
  }

  async updateUserStatus(
    userId: string,
    action: 'ACTIVATE' | 'DEACTIVATE' | 'UNLOCK' | 'LOCK',
    currentUser: CurrentUser,
  ) {
    const user = await this.findUserOrThrow(userId);
    if (isPlatformRole(user.role) && !user.schoolId) {
      this.assertPlatformOwner(currentUser);
      if (user.id === currentUser.id && (action === 'DEACTIVATE' || action === 'LOCK')) {
        throw new BadRequestException('You cannot deactivate or lock your own account');
      }
      if (user.role === UserRole.SUPER_ADMIN && (action === 'DEACTIVATE' || action === 'LOCK')) {
        await this.assertNotLastSuperAdmin(userId);
      }
    }

    let updateData: any = {};
    let auditAction: AuditAction;

    switch (action) {
      case 'ACTIVATE':
        updateData = { status: UserStatus.ACTIVE, loginAttempts: 0, lockedUntil: null };
        auditAction = AuditAction.USER_ACTIVATED;
        break;
      case 'DEACTIVATE':
        updateData = { status: UserStatus.INACTIVE };
        auditAction = AuditAction.USER_DEACTIVATED;
        break;
      case 'UNLOCK':
        updateData = { loginAttempts: 0, lockedUntil: null };
        auditAction = AuditAction.USER_UNLOCKED;
        break;
      case 'LOCK':
        updateData = { lockedUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) };
        auditAction = AuditAction.USER_LOCKED;
        break;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, status: true, lockedUntil: true },
    });

    await this.auditLogs.log({
      action:    auditAction,
      actorId:   currentUser.id,
      actorName: currentUser.name,
      schoolId:  user.schoolId ?? '',
      metadata:  { targetUserId: userId, targetEmail: user.email },
    });

    return updated;
  }

  async deleteUser(userId: string, currentUser: CurrentUser) {
    const user = await this.findUserOrThrow(userId);
    this.assertNotPlatformTarget(user);

    // Prevent deleting the last SCHOOL_ADMIN
    if (user.role === UserRole.SCHOOL_ADMIN && user.schoolId) {
      const adminCount = await this.prisma.user.count({
        where: { schoolId: user.schoolId, role: UserRole.SCHOOL_ADMIN, status: UserStatus.ACTIVE },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot delete the last active School Admin. Assign another admin first.');
      }
    }

    await this.prisma.user.delete({ where: { id: userId } });

    await this.auditLogs.log({
      action:    AuditAction.USER_DELETED,
      actorId:   currentUser.id,
      actorName: currentUser.name,
      schoolId:  user.schoolId ?? '',
      metadata:  { targetUserId: userId, targetEmail: user.email, role: user.role },
    });

    return { message: 'User deleted' };
  }

  async changeSchoolAdmin(
    schoolId: string,
    newAdminUserId: string,
    currentUser: CurrentUser,
  ) {
    await this.findSchoolOrThrow(schoolId);
    const newAdmin = await this.prisma.user.findUnique({ where: { id: newAdminUserId } });
    if (!newAdmin || newAdmin.schoolId !== schoolId) {
      throw new BadRequestException('User does not belong to this school');
    }

    // Demote all current admins → ACCOUNTANT
    await this.prisma.user.updateMany({
      where: { schoolId, role: UserRole.SCHOOL_ADMIN },
      data:  { role: UserRole.ACCOUNTANT },
    });

    // Promote the new admin
    const promoted = await this.prisma.user.update({
      where: { id: newAdminUserId },
      data:  { role: UserRole.SCHOOL_ADMIN },
      select: { id: true, name: true, email: true, role: true },
    });

    await this.prisma.school.update({
      where: { id: schoolId },
      data:  { ownerName: newAdmin.name },
    });

    await this.auditLogs.log({
      action:    AuditAction.SCHOOL_ADMIN_CHANGED,
      actorId:   currentUser.id,
      actorName: currentUser.name,
      schoolId,
      metadata:  { newAdminId: newAdminUserId, newAdminEmail: newAdmin.email },
    });

    return promoted;
  }

  async deleteSchool(id: string, currentUser: CurrentUser) {
    const school = await this.findSchoolOrThrow(id);

    // Delete all users of the school first
    await this.prisma.user.deleteMany({ where: { schoolId: id } });
    await this.prisma.school.delete({ where: { id } });

    await this.auditLogs.log({
      action:     AuditAction.SCHOOL_DELETED,
      actorId:    currentUser.id,
      actorName:  currentUser.name,
      schoolId:   id,
      schoolName: school.name,
    });

    return { message: 'School deleted' };
  }

  // ─── School Role Management ──────────────────────────────────────────────────

  async getRolesOverview(opts: { search?: string } = {}) {
    const where: { name?: { contains: string; mode: 'insensitive' } } = {};
    if (opts.search?.trim()) {
      where.name = { contains: opts.search.trim(), mode: 'insensitive' };
    }

    const schools = await this.prisma.school.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        status: true,
        disabledRoles: true,
        customRoles: {
          select: { id: true, name: true, slug: true, baseRole: true, isActive: true, _count: { select: { users: true } } },
          orderBy: { name: 'asc' },
        },
        users: { select: { role: true, customRoleId: true } },
      },
    });

    const data = schools.map((school) => {
      const disabled = new Set(school.disabledRoles);
      const systemUsers = school.users.filter((u) => !u.customRoleId);
      const systemRoles = SCHOOL_SCOPED_ROLES.filter((role) => !disabled.has(role)).map((role) => ({
        key: role,
        label: ROLE_LABELS[role],
        type: 'system' as const,
        userCount: systemUsers.filter((u) => u.role === role).length,
      }));
      const customRoles = school.customRoles.map((r) => ({
        key: r.id,
        label: r.name,
        type: 'custom' as const,
        userCount: r._count.users,
        baseRole: r.baseRole,
        isActive: r.isActive,
      }));
      const roles = [...systemRoles, ...customRoles];
      return {
        schoolId: school.id,
        schoolName: school.name,
        status: school.status,
        systemRoleCount: systemRoles.length,
        customRoleCount: customRoles.length,
        totalRoles: roles.length,
        totalUsers: school.users.length,
        roles,
      };
    });

    return {
      totalSchools: data.length,
      totalCustomRoles: data.reduce((sum, s) => sum + s.customRoleCount, 0),
      data,
    };
  }

  async getSchoolRoles(schoolId: string) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, status: true, disabledRoles: true },
    });
    if (!school) throw new NotFoundException('School not found');

    const [stored, customRoles, users] = await Promise.all([
      this.prisma.rolePermission.findMany({ where: { schoolId } }),
      this.prisma.schoolCustomRole.findMany({
        where: { schoolId },
        include: { _count: { select: { users: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { schoolId },
        select: { role: true, customRoleId: true },
      }),
    ]);

    const overrideMap = new Map(stored.map((r) => [r.role, r.permissions as Record<string, boolean>]));
    const systemUsers = users.filter((u) => !u.customRoleId);

    const disabled = new Set(school.disabledRoles);
    const systemRoles = SCHOOL_SCOPED_ROLES.map((role) => {
      const override = overrideMap.get(role);
      const permissions = this.mergeRolePermissions(role, override);
      return {
        role,
        label: ROLE_LABELS[role],
        type: 'system' as const,
        editable: EDITABLE_ROLES.includes(role),
        fixedFullAccess: FIXED_FULL_ACCESS_ROLES.includes(role),
        customized: Boolean(override),
        removed: disabled.has(role),
        removable: role !== UserRole.SCHOOL_ADMIN,
        userCount: systemUsers.filter((u) => u.role === role).length,
        permissionCount: Object.values(permissions).filter(Boolean).length,
        permissionTotal: Object.keys(permissions).length,
        permissions,
      };
    });

    return {
      school,
      modules: MODULES,
      actions: ACTIONS,
      systemRoles,
      customRoles: customRoles.map((r) => {
        const permissions = this.mergeRolePermissions(
          r.baseRole,
          r.permissions as Record<string, boolean> | undefined,
        );
        return {
          id: r.id,
          name: r.name,
          slug: r.slug,
          description: r.description,
          baseRole: r.baseRole,
          baseRoleLabel: ROLE_LABELS[r.baseRole],
          type: 'custom' as const,
          isActive: r.isActive,
          userCount: r._count.users,
          permissionCount: Object.values(permissions).filter(Boolean).length,
          permissionTotal: Object.keys(permissions).length,
          permissions,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        };
      }),
      baseRoles: CUSTOM_BASE_ROLES.map((role) => ({
        role,
        label: ROLE_LABELS[role],
      })),
    };
  }

  async createCustomRole(
    schoolId: string,
    dto: { name: string; description?: string; baseRole: UserRole; permissions?: Record<string, boolean> },
    currentUser: CurrentUser,
  ) {
    await this.findSchoolOrThrow(schoolId);
    this.assertCustomBaseRole(dto.baseRole);

    const name = dto.name.trim();
    if (name.length < 2) throw new BadRequestException('Role name must be at least 2 characters');

    const slug = await this.uniqueRoleSlug(schoolId, name);
    const permissions = sanitisePermissions(dto.permissions ?? DEFAULT_ROLE_PERMISSIONS[dto.baseRole] as Record<string, boolean>);

    try {
      const created = await this.prisma.schoolCustomRole.create({
        data: {
          schoolId,
          name,
          slug,
          description: dto.description?.trim() || null,
          baseRole: dto.baseRole,
          permissions,
        },
      });
      await this.auditLogs.log({
        action: AuditAction.SETTING_UPDATED,
        actorId: currentUser.id,
        actorName: currentUser.name,
        schoolId,
        metadata: { entity: 'SchoolCustomRole', action: 'created', roleId: created.id, name },
      });
      return created;
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('A role with this name already exists at this school');
      throw e;
    }
  }

  async updateCustomRole(
    schoolId: string,
    roleId: string,
    dto: {
      name?: string;
      description?: string | null;
      baseRole?: UserRole;
      permissions?: Record<string, boolean>;
      isActive?: boolean;
    },
    currentUser: CurrentUser,
  ) {
    const existing = await this.findCustomRoleOrThrow(schoolId, roleId);
    if (dto.baseRole) this.assertCustomBaseRole(dto.baseRole);

    const data: {
      name?: string;
      slug?: string;
      description?: string | null;
      baseRole?: UserRole;
      permissions?: Record<string, boolean>;
      isActive?: boolean;
    } = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name.length < 2) throw new BadRequestException('Role name must be at least 2 characters');
      data.name = name;
      if (name.toLowerCase() !== existing.name.toLowerCase()) {
        data.slug = await this.uniqueRoleSlug(schoolId, name, roleId);
      }
    }
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.baseRole) data.baseRole = dto.baseRole;
    if (dto.permissions) data.permissions = sanitisePermissions(dto.permissions);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      const updated = await this.prisma.schoolCustomRole.update({
        where: { id: roleId },
        data,
      });
      if (dto.baseRole && dto.baseRole !== existing.baseRole) {
        await this.prisma.user.updateMany({
          where: { customRoleId: roleId },
          data: { role: dto.baseRole },
        });
      }
      await this.auditLogs.log({
        action: AuditAction.SETTING_UPDATED,
        actorId: currentUser.id,
        actorName: currentUser.name,
        schoolId,
        metadata: { entity: 'SchoolCustomRole', action: 'updated', roleId, name: updated.name },
      });
      return updated;
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('A role with this name already exists at this school');
      throw e;
    }
  }

  async deleteCustomRole(schoolId: string, roleId: string, currentUser: CurrentUser) {
    const existing = await this.findCustomRoleOrThrow(schoolId, roleId);
    const assigned = await this.prisma.user.updateMany({
      where: { customRoleId: roleId },
      data: { customRoleId: null },
    });
    await this.prisma.schoolCustomRole.delete({ where: { id: roleId } });
    await this.auditLogs.log({
      action: AuditAction.SETTING_UPDATED,
      actorId: currentUser.id,
      actorName: currentUser.name,
      schoolId,
      metadata: {
        entity: 'SchoolCustomRole',
        action: 'deleted',
        roleId,
        name: existing.name,
        reassignedUsers: assigned.count,
      },
    });
    return {
      message: assigned.count
        ? `Role removed. ${assigned.count} user(s) were moved back to ${ROLE_LABELS[existing.baseRole]}.`
        : 'Role removed',
    };
  }

  async updateSystemRolePermissions(
    schoolId: string,
    role: UserRole,
    permissions: Record<string, boolean>,
    currentUser: CurrentUser,
  ) {
    await this.findSchoolOrThrow(schoolId);
    if (!SCHOOL_SCOPED_ROLES.includes(role)) {
      throw new BadRequestException('Invalid school role');
    }
    if (FIXED_FULL_ACCESS_ROLES.includes(role)) {
      throw new BadRequestException(`Cannot modify permissions for ${ROLE_LABELS[role]}`);
    }
    const sanitised = sanitisePermissions(permissions);
    const record = await this.prisma.rolePermission.upsert({
      where: { schoolId_role: { schoolId, role } },
      create: { schoolId, role, permissions: sanitised },
      update: { permissions: sanitised },
    });
    await this.auditLogs.log({
      action: AuditAction.SETTING_UPDATED,
      actorId: currentUser.id,
      actorName: currentUser.name,
      schoolId,
      metadata: { entity: 'RolePermission', action: 'updated', role },
    });
    return { role, permissions: record.permissions };
  }

  async resetSystemRolePermissions(schoolId: string, role: UserRole, currentUser: CurrentUser) {
    await this.findSchoolOrThrow(schoolId);
    if (!SCHOOL_SCOPED_ROLES.includes(role)) {
      throw new BadRequestException('Invalid school role');
    }
    if (FIXED_FULL_ACCESS_ROLES.includes(role)) {
      throw new BadRequestException(`Cannot modify permissions for ${ROLE_LABELS[role]}`);
    }
    await this.prisma.rolePermission.deleteMany({ where: { schoolId, role } });
    await this.auditLogs.log({
      action: AuditAction.SETTING_UPDATED,
      actorId: currentUser.id,
      actorName: currentUser.name,
      schoolId,
      metadata: { entity: 'RolePermission', action: 'reset', role },
    });
    return { role, permissions: DEFAULT_ROLE_PERMISSIONS[role] };
  }

  async removeSystemRole(schoolId: string, role: UserRole, currentUser: CurrentUser) {
    const school = await this.findSchoolOrThrow(schoolId);
    if (!SCHOOL_SCOPED_ROLES.includes(role)) {
      throw new BadRequestException('Invalid school role');
    }
    if (role === UserRole.SCHOOL_ADMIN) {
      throw new BadRequestException('School Admin cannot be removed from a school');
    }
    const disabledRoles = Array.from(new Set([...(school.disabledRoles ?? []), role]));
    await this.prisma.school.update({
      where: { id: schoolId },
      data: { disabledRoles: { set: disabledRoles } },
    });
    await this.auditLogs.log({
      action: AuditAction.SETTING_UPDATED,
      actorId: currentUser.id,
      actorName: currentUser.name,
      schoolId,
      metadata: { entity: 'SystemRole', action: 'removed', role },
    });
    return { message: `${ROLE_LABELS[role]} removed from this school`, role };
  }

  async restoreSystemRole(schoolId: string, role: UserRole, currentUser: CurrentUser) {
    const school = await this.findSchoolOrThrow(schoolId);
    await this.prisma.school.update({
      where: { id: schoolId },
      data: { disabledRoles: { set: (school.disabledRoles ?? []).filter((r) => r !== role) } },
    });
    await this.auditLogs.log({
      action: AuditAction.SETTING_UPDATED,
      actorId: currentUser.id,
      actorName: currentUser.name,
      schoolId,
      metadata: { entity: 'SystemRole', action: 'restored', role },
    });
    return { message: `${ROLE_LABELS[role]} restored for this school`, role };
  }

  // ─── Platform Team ───────────────────────────────────────────────────────────

  async getPlatformUsers(opts: { search?: string; role?: string; status?: string } = {}) {
    const where: any = { role: { in: PLATFORM_ROLES }, schoolId: null };
    if (opts.role && PLATFORM_ROLES.includes(opts.role as UserRole)) where.role = opts.role;
    if (opts.status) where.status = opts.status;
    if (opts.search?.trim()) {
      where.OR = [
        { name: { contains: opts.search.trim(), mode: 'insensitive' } },
        { email: { contains: opts.search.trim(), mode: 'insensitive' } },
      ];
    }
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true, name: true, email: true, phone: true, role: true, status: true,
          lastLoginAt: true, forcePasswordChange: true, lockedUntil: true, createdAt: true,
        },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data: users, total };
  }

  async createPlatformUser(
    dto: { name: string; email: string; password: string; role: UserRole; phone?: string },
    currentUser: CurrentUser,
  ) {
    this.assertPlatformOwner(currentUser);
    if (!PLATFORM_ROLES.includes(dto.role)) {
      throw new BadRequestException('Role must be Super Admin or Manager');
    }
    assertStrongPassword(dto.password);
    const email = dto.email.toLowerCase().trim();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException('Email already exists');

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        phone: dto.phone?.trim() || null,
        password: await bcrypt.hash(dto.password, 10),
        role: dto.role,
        status: UserStatus.ACTIVE,
        schoolId: null,
        forcePasswordChange: true,
      },
      select: {
        id: true, name: true, email: true, phone: true, role: true, status: true, createdAt: true,
      },
    });

    await this.auditLogs.log({
      action: AuditAction.USER_CREATED,
      actorId: currentUser.id,
      actorName: currentUser.name,
      metadata: { targetUserId: user.id, targetEmail: user.email, role: user.role, scope: 'platform' },
    });
    return user;
  }

  async updatePlatformUser(
    id: string,
    dto: { name?: string; email?: string; phone?: string },
    currentUser: CurrentUser,
  ) {
    this.assertPlatformOwner(currentUser);
    const user = await this.requirePlatformUser(id);
    if (dto.email && dto.email.toLowerCase() !== user.email) {
      const clash = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
      if (clash) throw new ConflictException('Email already exists');
    }
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email.toLowerCase().trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
      },
      select: { id: true, name: true, email: true, phone: true, role: true, status: true },
    });
  }

  async changePlatformUserRole(id: string, role: UserRole, currentUser: CurrentUser) {
    this.assertPlatformOwner(currentUser);
    if (!PLATFORM_ROLES.includes(role)) {
      throw new BadRequestException('Role must be Super Admin or Manager');
    }
    const user = await this.requirePlatformUser(id);
    if (user.id === currentUser.id && role !== UserRole.SUPER_ADMIN) {
      throw new BadRequestException('You cannot demote your own Super Admin account');
    }
    if (user.role === UserRole.SUPER_ADMIN && role !== UserRole.SUPER_ADMIN) {
      await this.assertNotLastSuperAdmin(id);
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, name: true, email: true, role: true, status: true },
    });
    await this.auditLogs.log({
      action: AuditAction.ROLE_CHANGED,
      actorId: currentUser.id,
      actorName: currentUser.name,
      metadata: { targetUserId: id, oldRole: user.role, newRole: role, scope: 'platform' },
    });
    return updated;
  }

  async deletePlatformUser(id: string, currentUser: CurrentUser) {
    this.assertPlatformOwner(currentUser);
    const user = await this.requirePlatformUser(id);
    if (user.id === currentUser.id) {
      throw new BadRequestException('You cannot delete your own account');
    }
    if (user.role === UserRole.SUPER_ADMIN) {
      await this.assertNotLastSuperAdmin(id);
    }
    await this.prisma.user.delete({ where: { id } });
    await this.auditLogs.log({
      action: AuditAction.USER_DELETED,
      actorId: currentUser.id,
      actorName: currentUser.name,
      metadata: { targetUserId: id, targetEmail: user.email, role: user.role, scope: 'platform' },
    });
    return { message: 'User removed' };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async findSchoolOrThrow(id: string) {
    const school = await this.prisma.school.findUnique({
      where: { id },
      include: { subscription: true },
    });
    if (!school) throw new NotFoundException('School not found');
    return school;
  }

  private async findUserOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private toSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
  }

  private mergeRolePermissions(role: UserRole, override?: Record<string, boolean>): Record<string, boolean> {
    const defaults = (DEFAULT_ROLE_PERMISSIONS[role] ?? {}) as Record<PermKey, boolean>;
    if (!override) return defaults as Record<string, boolean>;
    return { ...defaults, ...override };
  }

  private assertCustomBaseRole(role: UserRole) {
    if (!CUSTOM_BASE_ROLES.includes(role)) {
      throw new BadRequestException('Custom roles must inherit from Accountant, Teacher, Receptionist, Parent, or Student');
    }
  }

  private async findCustomRoleOrThrow(schoolId: string, roleId: string) {
    const role = await this.prisma.schoolCustomRole.findFirst({ where: { id: roleId, schoolId } });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  private async uniqueRoleSlug(schoolId: string, name: string, excludeId?: string) {
    const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'role';
    let slug = base;
    let n = 2;
    while (true) {
      const clash = await this.prisma.schoolCustomRole.findFirst({
        where: { schoolId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
        select: { id: true },
      });
      if (!clash) return slug;
      slug = `${base}-${n++}`;
    }
  }

  private assertPlatformOwner(currentUser: CurrentUser) {
    if (currentUser.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can manage the platform team');
    }
  }

  private async requirePlatformUser(id: string) {
    const user = await this.findUserOrThrow(id);
    if (!isPlatformRole(user.role) || user.schoolId) {
      throw new BadRequestException('Not a platform team user');
    }
    return user;
  }

  private async assertNotLastSuperAdmin(excludeId: string) {
    const count = await this.prisma.user.count({
      where: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE, id: { not: excludeId } },
    });
    if (count < 1) {
      throw new BadRequestException('Cannot remove or demote the last Super Admin');
    }
  }

  private assertNotPlatformTarget(user: { role: UserRole; schoolId: string | null }) {
    if (isPlatformRole(user.role) && !user.schoolId) {
      throw new ForbiddenException('Manage this user from Platform Team');
    }
  }
}
