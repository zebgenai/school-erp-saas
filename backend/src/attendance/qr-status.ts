import { AttendanceStatus } from '@prisma/client';
import { localMinutesOfDay, resolveSchoolTimeZone } from '../common/utils/school-time';

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseHhMm(value?: string | null): number | null {
  if (!value) return null;
  const match = HH_MM.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * QR present/late cutoffs use school-local time (default Asia/Karachi).
 * After the late window, QR still marks LATE (no automatic ABSENT).
 *
 * Windows:
 * - no cutoffs → PRESENT
 * - presentUntil only → PRESENT until that time, then LATE
 * - lateUntil only → PRESENT until that time, then LATE
 * - both → PRESENT until presentUntil, LATE until lateUntil, then LATE
 */
export function resolveQrAttendanceStatus(input: {
  now?: Date;
  timeZone?: string | null;
  /** Override for tests; when omitted, derived from now + timeZone. */
  minutesOfDay?: number;
  presentUntil?: string | null;
  lateUntil?: string | null;
}): AttendanceStatus {
  const presentUntil = parseHhMm(input.presentUntil);
  const lateUntil = parseHhMm(input.lateUntil);
  if (presentUntil == null && lateUntil == null) {
    return AttendanceStatus.PRESENT;
  }

  const now = input.now ?? new Date();
  const minutes =
    input.minutesOfDay ??
    localMinutesOfDay(now, resolveSchoolTimeZone(input.timeZone));

  if (presentUntil != null && minutes <= presentUntil) {
    return AttendanceStatus.PRESENT;
  }

  // lateUntil-only: times at/before the late cutoff are still on-time (PRESENT).
  if (presentUntil == null && lateUntil != null && minutes <= lateUntil) {
    return AttendanceStatus.PRESENT;
  }

  if (lateUntil != null && minutes <= lateUntil) {
    return AttendanceStatus.LATE;
  }

  // Past configured windows (or past presentUntil with no lateUntil).
  return AttendanceStatus.LATE;
}
