/** Attendance QR namespaces — must match backend id-cards/qr-token.ts */
export const STUDENT_QR_PREFIX = "CC1.";
export const TEACHER_QR_PREFIX = "TCC1.";

export type AttendanceQrKind = "student" | "teacher";

/**
 * Classify a scanned attendance QR token by namespace.
 * Checks teacher prefix (TCC1.) before student (CC1.).
 */
export function classifyAttendanceQrToken(raw: string): AttendanceQrKind | null {
  const token = (raw ?? "").trim();
  if (!token) return null;
  if (token.startsWith(TEACHER_QR_PREFIX)) return "teacher";
  if (token.startsWith(STUDENT_QR_PREFIX)) return "student";
  return null;
}
