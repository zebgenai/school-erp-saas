import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationEngineService } from '../notifications/notification-engine.service';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeRoleDto } from './dto/change-role.dto';
import { CreateUserDto } from './dto-create-user';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-status.dto';
import { UserQueryDto } from './dto/user-query.dto';

const SCHOOL_ASSIGNABLE_ROLES: UserRole[] = [
  UserRole.SCHOOL_ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.TEACHER,
  UserRole.RECEPTIONIST,
  UserRole.PARENT,
];

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  schoolId: true,
  lastLoginAt: true,
  forcePasswordChange: true,
  lockedUntil: true,
  loginAttempts: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private auditLogs: AuditLogsService,
    private readonly notificationEngine: NotificationEngineService,
  ) {}

  async create(dto: CreateUserDto, currentUser: CurrentUser) {
    this.assertAssignableRole(dto.role, currentUser);

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictException('Email already exists');

    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);

    if (dto.role !== UserRole.SUPER_ADMIN && !schoolId) {
      throw new BadRequestException('schoolId is required for school users');
    }

    await this.assertRoleEnabled(schoolId, dto.role);

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        phone: dto.phone || null,
        password: hashedPassword,
        role: dto.role,
        status: UserStatus.ACTIVE,
        schoolId: dto.role === UserRole.SUPER_ADMIN ? null : schoolId,
      },
      select: USER_SELECT,
    });

    if (schoolId) {
      await this.auditLogs.log({
        action: AuditAction.USER_CREATED,
        actorId: currentUser.id,
        actorName: currentUser.name,
        schoolId,
        metadata: { targetUserId: user.id, targetEmail: user.email, role: user.role },
      });

      this.notificationEngine.dispatch(() =>
        this.notificationEngine.emitNewUser(schoolId, user.name, user.id, user.role),
      );
    }

    return user;
  }

  async findAll(currentUser: CurrentUser, query: UserQueryDto) {
    const where: any = this.buildListWhere(currentUser);

    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? 50,
        skip: query.skip ?? 0,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: users, total };
  }

  async findOne(id: string, currentUser: CurrentUser) {
    const user = await this.findUserOrThrow(id);
    this.assertCanAccessUser(currentUser, user);
    return this.safeUser(user);
  }

  async update(id: string, dto: UpdateUserDto, currentUser: CurrentUser) {
    const user = await this.findUserOrThrow(id);
    this.assertCanAccessUser(currentUser, user);

    if (dto.email && dto.email.toLowerCase() !== user.email) {
      const exists = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
      if (exists && exists.id !== id) throw new ConflictException('Email already exists');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined ? { email: dto.email.toLowerCase() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
        ...(dto.forcePasswordChange !== undefined ? { forcePasswordChange: dto.forcePasswordChange } : {}),
      },
      select: USER_SELECT,
    });

    if (user.schoolId) {
      await this.auditLogs.log({
        action: AuditAction.USER_UPDATED,
        actorId: currentUser.id,
        actorName: currentUser.name,
        schoolId: user.schoolId,
        metadata: { targetUserId: id, changes: dto },
      });
    }

    return updated;
  }

  async resetPassword(id: string, dto: ResetPasswordDto, currentUser: CurrentUser) {
    const user = await this.findUserOrThrow(id);
    this.assertCanAccessUser(currentUser, user);

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id },
      data: {
        password: hashed,
        forcePasswordChange: dto.forceChange ?? true,
        loginAttempts: 0,
        lockedUntil: null,
      },
    });

    if (user.schoolId) {
      await this.auditLogs.log({
        action: AuditAction.PASSWORD_RESET,
        actorId: currentUser.id,
        actorName: currentUser.name,
        schoolId: user.schoolId,
        metadata: { targetUserId: id, targetEmail: user.email, forceChange: dto.forceChange ?? true },
      });
    }

    return { message: 'Password reset successfully' };
  }

  async changeRole(id: string, dto: ChangeRoleDto, currentUser: CurrentUser) {
    const user = await this.findUserOrThrow(id);
    this.assertCanAccessUser(currentUser, user);
    this.assertAssignableRole(dto.role, currentUser);
    await this.assertRoleEnabled(user.schoolId, dto.role);

    const oldRole = user.role;
    const updated = await this.prisma.user.update({
      where: { id },
      data: { role: dto.role },
      select: USER_SELECT,
    });

    if (user.schoolId) {
      await this.auditLogs.log({
        action: AuditAction.ROLE_CHANGED,
        actorId: currentUser.id,
        actorName: currentUser.name,
        schoolId: user.schoolId,
        metadata: { targetUserId: id, oldRole, newRole: dto.role },
      });
    }

    return updated;
  }

  async updateStatus(id: string, dto: UpdateUserStatusDto, currentUser: CurrentUser) {
    const user = await this.findUserOrThrow(id);
    this.assertCanAccessUser(currentUser, user);

    let updateData: Record<string, unknown> = {};
    let auditAction: AuditAction = AuditAction.USER_UPDATED;

    switch (dto.action) {
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
      where: { id },
      data: updateData,
      select: USER_SELECT,
    });

    if (user.schoolId) {
      await this.auditLogs.log({
        action: auditAction,
        actorId: currentUser.id,
        actorName: currentUser.name,
        schoolId: user.schoolId,
        metadata: { targetUserId: id, targetEmail: user.email },
      });
    }

    return updated;
  }

  async remove(id: string, currentUser: CurrentUser) {
    const user = await this.findUserOrThrow(id);
    this.assertCanAccessUser(currentUser, user);

    if (user.id === currentUser.id) {
      throw new BadRequestException('You cannot delete your own account');
    }

    if (user.role === UserRole.SCHOOL_ADMIN && user.schoolId) {
      const adminCount = await this.prisma.user.count({
        where: { schoolId: user.schoolId, role: UserRole.SCHOOL_ADMIN, status: UserStatus.ACTIVE },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot delete the last active School Admin. Assign another admin first.');
      }
    }

    await this.prisma.user.delete({ where: { id } });

    if (user.schoolId) {
      await this.auditLogs.log({
        action: AuditAction.USER_DELETED,
        actorId: currentUser.id,
        actorName: currentUser.name,
        schoolId: user.schoolId,
        metadata: { targetUserId: id, targetEmail: user.email, role: user.role },
      });
    }

    return { message: 'User deleted' };
  }

  private buildListWhere(currentUser: CurrentUser) {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      return {};
    }
    if (!currentUser.schoolId) {
      throw new ForbiddenException('School context missing');
    }
    return {
      schoolId: currentUser.schoolId,
      role: { not: UserRole.SUPER_ADMIN },
    };
  }

  private resolveSchoolId(currentUser: CurrentUser, schoolId?: string): string | undefined {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
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

  private assertAssignableRole(role: UserRole, currentUser: CurrentUser) {
    if (role === UserRole.SUPER_ADMIN || role === UserRole.PLATFORM_MANAGER) {
      throw new ForbiddenException('Cannot create or assign platform roles here');
    }
    if (currentUser.role !== UserRole.SUPER_ADMIN && !SCHOOL_ASSIGNABLE_ROLES.includes(role)) {
      throw new ForbiddenException('Role not allowed for school user management');
    }
  }

  private async assertRoleEnabled(schoolId: string | null | undefined, role: UserRole) {
    if (!schoolId || role === UserRole.SUPER_ADMIN || role === UserRole.PLATFORM_MANAGER) return;
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { disabledRoles: true },
    });
    if (school?.disabledRoles?.includes(role)) {
      throw new ForbiddenException('This role has been removed from the school');
    }
  }

  private assertCanAccessUser(currentUser: CurrentUser, target: { schoolId: string | null; role: UserRole }) {
    if (
      (target.role === UserRole.SUPER_ADMIN || target.role === UserRole.PLATFORM_MANAGER) &&
      currentUser.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Cannot manage Super Admin users');
    }
    if (currentUser.role === UserRole.SUPER_ADMIN) return;
    if (!currentUser.schoolId) {
      throw new ForbiddenException('School context missing');
    }
    if (target.schoolId !== currentUser.schoolId) {
      throw new ForbiddenException("Cannot access another school's user");
    }
  }

  private async findUserOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private safeUser(user: any) {
    const { password, passwordResetToken, ...safe } = user;
    return safe;
  }
}
