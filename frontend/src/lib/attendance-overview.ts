/** School Admin is the only role that gets the school-local attendance overview. */
export function showsSchoolAdminTodayOverview(role?: string | null): boolean {
  return role === "SCHOOL_ADMIN";
}

/**
 * The older Present Today / Absent Today cards use the UTC dashboard summary.
 * School Admin uses the school-local overview instead. Other roles keep the old cards.
 */
export function showsLegacyTodayAttendanceCards(
  role: string | null | undefined,
  canViewAttendance: boolean,
): boolean {
  return Boolean(canViewAttendance) && role !== "SCHOOL_ADMIN";
}
