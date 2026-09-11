import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { isPlatformRole } from '../../roles/roles.constants';
import type { TenantSchool } from './tenant.types';

type IsolationUser = {
  role: UserRole;
  schoolId?: string | null;
};

function requestedSchoolIdFromRequest(req: {
  body?: unknown;
  query?: unknown;
}): string | undefined {
  const body = req.body as { schoolId?: unknown } | undefined;
  const query = req.query as { schoolId?: unknown } | undefined;
  const raw = body?.schoolId ?? query?.schoolId;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

/**
 * School-scoped users must match the Host tenant and cannot pick another school
 * via body/query schoolId. Platform roles keep the existing override.
 */
export function assertTenantIsolation(
  user: IsolationUser | null | undefined,
  tenantSchool: TenantSchool | null | undefined,
  requestedSchoolId?: string,
): void {
  if (!user) return;
  if (isPlatformRole(user.role)) return;

  if (tenantSchool && user.schoolId !== tenantSchool.id) {
    throw new ForbiddenException("Cannot access another school's data");
  }

  if (requestedSchoolId && user.schoolId && requestedSchoolId !== user.schoolId) {
    throw new ForbiddenException("Cannot access another school's data");
  }
}

export function assertRequestTenantIsolation(req: {
  user?: IsolationUser;
  tenantSchool?: TenantSchool | null;
  body?: unknown;
  query?: unknown;
}): void {
  assertTenantIsolation(req.user, req.tenantSchool, requestedSchoolIdFromRequest(req));
}
