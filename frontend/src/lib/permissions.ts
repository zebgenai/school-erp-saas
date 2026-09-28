import { useAuth } from "./auth";
import {
  canPermission,
  canRoutePath,
  type AppRole,
  type Permission,
} from "./permissions-routing";
import { isFeatureEnabled } from "./feature-control.ts";

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

export { isFeatureEnabled, isPathFeatureAllowed, featureKeyForPath } from "./feature-control.ts";

export function usePermissions() {
  const { user } = useAuth();
  const role = (user?.role ?? "STUDENT") as AppRole;
  const perms: Record<string, boolean> = user?.permissions ?? {};
  const enabledFeatures = (user?.enabledFeatures as string[] | undefined) ?? undefined;

  const can = (p: Permission): boolean => canPermission(role, perms, p);

  const hasFeature = (featureKey: string): boolean =>
    isFeatureEnabled(featureKey, enabledFeatures);

  const canRoute = (path: string): boolean =>
    canRoutePath({
      role,
      path,
      permissions: perms,
      schoolId: user?.schoolId,
      enabledFeatures,
    });

  return { role, can, canRoute, hasFeature, permissions: perms, enabledFeatures };
}
