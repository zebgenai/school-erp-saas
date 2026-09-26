export type TeacherPunchScanResult = {
  result:
    | "CHECK_IN"
    | "ALREADY_CHECKED_IN"
    | "CHECK_OUT"
    | "ALREADY_COMPLETED"
    | "INVALID_TEACHER"
    | "INACTIVE_TEACHER"
    | "INVALID_CARD"
    | "REVOKED_CARD";
  message: string;
  teacher?: {
    id: string;
    fullName: string;
    employeeNo?: string | null;
    designation?: string | null;
  } | null;
  workDate?: string | Date | null;
  checkInAt?: string | Date | null;
  checkOutAt?: string | Date | null;
  workingMinutes?: number | null;
  remainingSeconds?: number;
  remainingMinutes?: number;
  checkoutAllowedInMs?: number;
};

/** Format backend workingMinutes for display. */
export function formatWorkingHours(minutes: number | null | undefined): string {
  if (minutes == null || minutes < 0 || Number.isNaN(minutes)) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function teacherAttendanceStatusLabel(row: {
  checkInAt?: string | Date | null;
  checkOutAt?: string | Date | null;
  status?: string;
}): string {
  if (row.status === "COMPLETED" || row.checkOutAt) return "Completed";
  if (row.checkInAt) return "Checked in";
  return "—";
}

/** Pure helper used by unit tests — builds the API body for a teacher scan. */
export function teacherQrScanBody(token: string) {
  return { qrToken: token.trim() };
}

/** Pure helper — student scan still uses `{ token }`. */
export function studentQrScanBody(token: string) {
  return { token: token.trim() };
}
