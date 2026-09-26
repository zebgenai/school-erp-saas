/**
 * Pure helpers for Teacher ID Card Design settings UI.
 * Backend authorization remains the security boundary; these only shape requests.
 */

export type TeacherSettingsActorRole = "SUPER_ADMIN" | "SCHOOL_ADMIN" | string;

export type TeacherSettingsSchoolOption = {
  id: string;
  name: string;
  status?: string | null;
};

/** SUPER_ADMIN must pick a school; SCHOOL_ADMIN uses the logged-in school. */
export function shouldShowTeacherSettingsSchoolPicker(role?: string | null): boolean {
  return role === "SUPER_ADMIN";
}

/**
 * Resolve which schoolId the settings UI should target.
 * - SCHOOL_ADMIN: always ownSchoolId (ignores UI selection)
 * - SUPER_ADMIN: selectedSchoolId only (never falls back to a stale default)
 * - others: null
 */
export function resolveTeacherSettingsTargetSchoolId(input: {
  role?: string | null;
  ownSchoolId?: string | null;
  selectedSchoolId?: string | null;
}): string | null {
  if (input.role === "SUPER_ADMIN") {
    return input.selectedSchoolId?.trim() || null;
  }
  if (input.role === "SCHOOL_ADMIN") {
    return input.ownSchoolId?.trim() || null;
  }
  return input.ownSchoolId?.trim() || null;
}

/** Query params for GET /id-cards/teacher-settings */
export function buildTeacherSettingsQuery(
  role: string | null | undefined,
  schoolId: string | null,
): Record<string, string> | undefined {
  if (!schoolId) return undefined;
  if (role === "SUPER_ADMIN") return { schoolId };
  return undefined;
}

/** PATCH body — SUPER_ADMIN must include schoolId; SCHOOL_ADMIN must not send another school's id. */
export function buildTeacherSettingsSaveBody(
  colors: {
    primary: string;
    accent: string;
    background: string;
    text: string;
  },
  role: string | null | undefined,
  schoolId: string | null,
): Record<string, string> {
  const body: Record<string, string> = {
    primaryColor: colors.primary,
    accentColor: colors.accent,
    backgroundColor: colors.background,
    textColor: colors.text,
  };
  if (role === "SUPER_ADMIN" && schoolId) {
    body.schoolId = schoolId;
  }
  return body;
}

/** Reset body — SUPER_ADMIN targets selected school explicitly. */
export function buildTeacherSettingsResetBody(
  role: string | null | undefined,
  schoolId: string | null,
): Record<string, string> {
  if (role === "SUPER_ADMIN" && schoolId) {
    return { schoolId };
  }
  return {};
}

/** Only apply loaded settings when the response school matches the current target. */
export function shouldApplyTeacherSettingsResponse(
  responseSchoolId: string | null | undefined,
  targetSchoolId: string | null,
): boolean {
  if (!targetSchoolId || !responseSchoolId) return false;
  return responseSchoolId === targetSchoolId;
}

export function mapSuperAdminSchoolsList(payload: unknown): TeacherSettingsSchoolOption[] {
  if (!payload) return [];
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.data)
      ? (payload as any).data
      : Array.isArray((payload as any)?.items)
        ? (payload as any).items
        : [];
  return rows
    .filter((r: any) => r && typeof r.id === "string" && typeof r.name === "string")
    .map((r: any) => ({ id: r.id, name: r.name, status: r.status ?? null }));
}
