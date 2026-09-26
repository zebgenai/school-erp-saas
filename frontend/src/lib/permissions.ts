import { useAuth } from "./auth";
import {
  canPermission,
  canRoutePath,
  type AppRole,
  type Permission,
} from "./permissions-routing";

export type {
  AppRole,
  AppNavKind,
  Permission,
} from "./permissions-routing";

export {
  ATTENDANCE_SCANNER_HOME,
  canPermission,
  canRoutePath,
  homeRouteForRole,
  isAttendanceScannerRole,
  isPlatformStaff,
  resolveAppNavKind,
  roleDisplayName,
} from "./permissions-routing";

export function usePermissions() {
  const { user } = useAuth();
  const role = (user?.role ?? "STUDENT") as AppRole;
  const perms: Record<string, boolean> = user?.permissions ?? {};

  const can = (p: Permission): boolean => canPermission(role, perms, p);

  const canRoute = (path: string): boolean =>
    canRoutePath({
      role,
      path,
      permissions: perms,
      schoolId: user?.schoolId,
    });

  return { role, can, canRoute, permissions: perms };
}
