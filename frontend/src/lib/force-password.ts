/** Endpoint used by the forced-password page after client-side validation. */
export const CHANGE_PASSWORD_ENDPOINT = "/auth/change-password";

export function buildChangePasswordRequest(input: {
  currentPassword: string;
  newPassword: string;
}) {
  return {
    currentPassword: input.currentPassword,
    newPassword: input.newPassword,
  };
}

/** Mirrors backend PASSWORD_REGEX / IsStrongPassword policy. */
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;

export const PASSWORD_POLICY_MESSAGE =
  "Password must be 8–128 characters and include uppercase, lowercase, and a number";

export const FORCE_CHANGE_PASSWORD_PATH = "/force-change-password";

export type ForcePasswordUser = {
  role?: string;
  forcePasswordChange?: boolean;
} | null | undefined;

export function isStrongPassword(value: string): boolean {
  return PASSWORD_REGEX.test(value);
}

export function validatePasswordChange(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): string | null {
  if (!input.currentPassword.trim()) return "Current password is required";
  if (!input.newPassword) return "New password is required";
  if (!isStrongPassword(input.newPassword)) return PASSWORD_POLICY_MESSAGE;
  if (input.newPassword !== input.confirmPassword) return "Passwords do not match";
  if (input.currentPassword === input.newPassword) {
    return "New password must be different from the current password";
  }
  return null;
}

/** Post-login / session-restore destination. */
export function postAuthPath(
  user: ForcePasswordUser,
  homeForRole: (role?: string) => string,
): string {
  if (user?.forcePasswordChange) return FORCE_CHANGE_PASSWORD_PATH;
  return homeForRole(user?.role);
}

/**
 * Whether a forced user may stay on this path.
 * Forced users may only remain on the force-change page.
 */
export function shouldRedirectForcedUser(
  user: ForcePasswordUser,
  pathname: string,
): string | null {
  if (!user?.forcePasswordChange) return null;
  if (pathname === FORCE_CHANGE_PASSWORD_PATH) return null;
  return FORCE_CHANGE_PASSWORD_PATH;
}

/** Non-forced users who land on the force page go home. */
export function shouldLeaveForcePasswordPage(
  user: ForcePasswordUser,
  pathname: string,
  homeForRole: (role?: string) => string,
): string | null {
  if (!user) return "/login";
  if (pathname !== FORCE_CHANGE_PASSWORD_PATH) return null;
  if (user.forcePasswordChange) return null;
  return homeForRole(user.role);
}
