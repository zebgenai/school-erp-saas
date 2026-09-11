import { UserRole } from '@prisma/client';
import { isPlatformRole } from '../../roles/roles.constants';

/**
 * When Host resolves to a school, only that school's users may authenticate.
 * Platform users must not log in through a school subdomain.
 * Returns true when the attempt should be treated as invalid credentials.
 */
export function isTenantLoginRejected(
  user: { role: UserRole; schoolId?: string | null } | null | undefined,
  tenantSchoolId: string | null | undefined,
): boolean {
  if (!tenantSchoolId) return false;
  if (!user) return true;
  if (isPlatformRole(user.role)) return true;
  return user.schoolId !== tenantSchoolId;
}
