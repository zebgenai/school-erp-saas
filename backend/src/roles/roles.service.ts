import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import {
  ALL_PERMISSION_KEYS,
  DEFAULT_ROLE_PERMISSIONS,
  EDITABLE_ROLES,
  FIXED_FULL_ACCESS_ROLES,
  MODULES,
  ACTIONS,
  ROLE_LABELS,
  sanitisePermissions,
  PermKey,
} from './roles.constants';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  /** Effective permissions for the current user's role at their school */
  async getEffectivePermissions(currentUser: CurrentUser): Promise<Record<string, boolean>> {
    if (FIXED_FULL_ACCESS_ROLES.includes(currentUser.role)) {
      return Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, true]));
    }
    if (!currentUser.schoolId) {
      return {};
    }

    const withCustom = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: {
        customRole: { select: { isActive: true, permissions: true } },
      },
    });
    if (withCustom?.customRole?.isActive) {
      return this.mergePermissions(
        currentUser.role,
        withCustom.customRole.permissions as Record<PermKey, boolean> | undefined,
      ) as Record<string, boolean>;
    }

    const stored = await this.prisma.rolePermission.findUnique({
      where: { schoolId_role: { schoolId: currentUser.schoolId, role: currentUser.role } },
    });
    return this.mergePermissions(
      currentUser.role,
      stored?.permissions as Record<PermKey, boolean> | undefined,
    ) as Record<string, boolean>;
  }

  /** Return metadata for every school-scoped role */
  async listRoles(currentUser?: CurrentUser) {
    const displayRoles = [
      UserRole.SCHOOL_ADMIN,
      UserRole.ACCOUNTANT,
      UserRole.TEACHER,
      UserRole.RECEPTIONIST,
      UserRole.PARENT,
      UserRole.STUDENT,
    ];
    const disabled = await this.getDisabledRoles(currentUser?.schoolId);
    return displayRoles
      .filter((role) => !disabled.has(role))
      .map((role) => ({
        role,
        label:    ROLE_LABELS[role] ?? role,
        editable: EDITABLE_ROLES.includes(role),
        fixedFullAccess: FIXED_FULL_ACCESS_ROLES.includes(role),
      }));
  }

  /** Return the full permission matrix for a school */
  async getMatrix(currentUser: CurrentUser) {
    const schoolId = this.requireSchoolId(currentUser);

    // Load any stored overrides from DB
    const stored = await this.prisma.rolePermission.findMany({
      where: { schoolId },
    });
    const overrideMap = new Map(stored.map((r) => [r.role as UserRole, r.permissions as Record<PermKey, boolean>]));
    const disabled = await this.getDisabledRoles(schoolId);

    const roles = (await this.listRoles(currentUser)).filter((r) => !disabled.has(r.role));
    return {
      modules: MODULES,
      actions: ACTIONS,
      roles: roles.map(({ role, label, editable, fixedFullAccess }) => ({
        role,
        label,
        editable,
        fixedFullAccess,
        permissions: this.mergePermissions(role, overrideMap.get(role)),
      })),
    };
  }

  /** Get permissions for a single role */
  async getRolePermissions(role: UserRole, currentUser: CurrentUser) {
    const schoolId = this.requireSchoolId(currentUser);
    const stored = await this.prisma.rolePermission.findUnique({
      where: { schoolId_role: { schoolId, role } },
    });
    return {
      role,
      label:       ROLE_LABELS[role] ?? role,
      editable:    EDITABLE_ROLES.includes(role),
      permissions: this.mergePermissions(role, stored?.permissions as Record<PermKey, boolean> | undefined),
    };
  }

  /** Update permissions for a single role (SCHOOL_ADMIN only) */
  async updateRolePermissions(
    role: UserRole,
    permissions: Record<string, boolean>,
    currentUser: CurrentUser,
  ) {
    if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.SCHOOL_ADMIN) {
      throw new ForbiddenException('Only School Admin can manage permissions');
    }
    if (FIXED_FULL_ACCESS_ROLES.includes(role)) {
      throw new ForbiddenException(`Cannot modify permissions for ${role}`);
    }

    const schoolId = this.requireSchoolId(currentUser);

    // Sanitise — only store known permission keys
    const sanitised = sanitisePermissions(permissions);

    const record = await this.prisma.rolePermission.upsert({
      where: { schoolId_role: { schoolId, role } },
      create: { schoolId, role, permissions: sanitised },
      update: { permissions: sanitised },
    });
    return { role, permissions: record.permissions };
  }

  /** Reset a role's permissions to system defaults */
  async resetRolePermissions(role: UserRole, currentUser: CurrentUser) {
    if (currentUser.role !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.SCHOOL_ADMIN) {
      throw new ForbiddenException('Only School Admin can manage permissions');
    }
    if (FIXED_FULL_ACCESS_ROLES.includes(role)) {
      throw new ForbiddenException(`Cannot modify permissions for ${role}`);
    }

    const schoolId = this.requireSchoolId(currentUser);
    await this.prisma.rolePermission.deleteMany({ where: { schoolId, role } });
    return { role, permissions: DEFAULT_ROLE_PERMISSIONS[role] };
  }

  // ─── helpers ────────────────────────────────────────────────────────────────

  private mergePermissions(
    role: UserRole,
    override?: Record<PermKey, boolean>,
  ): Record<PermKey, boolean> {
    const defaults = DEFAULT_ROLE_PERMISSIONS[role] ?? {};
    if (!override) return defaults as Record<PermKey, boolean>;
    // Stored override wins over defaults
    return { ...(defaults as Record<PermKey, boolean>), ...override };
  }

  private requireSchoolId(currentUser: CurrentUser): string {
    if (currentUser.role === UserRole.SUPER_ADMIN || currentUser.role === UserRole.PLATFORM_MANAGER) {
      // Super admin can query with a schoolId param — for now use a placeholder
      // In practice, super admin operates at platform level, not school level
      return currentUser.schoolId ?? '';
    }
    if (!currentUser.schoolId) throw new ForbiddenException('School context missing');
    return currentUser.schoolId;
  }

  private async getDisabledRoles(schoolId?: string | null): Promise<Set<UserRole>> {
    if (!schoolId) return new Set();
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { disabledRoles: true },
    });
    return new Set(school?.disabledRoles ?? []);
  }
}
