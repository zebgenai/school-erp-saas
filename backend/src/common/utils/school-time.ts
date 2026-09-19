/** Default timezone for Pakistan schools. Never rely on the VPS/server TZ. */
export const DEFAULT_SCHOOL_TIMEZONE = 'Asia/Karachi';

export function resolveSchoolTimeZone(timeZone?: string | null): string {
  const trimmed = timeZone?.trim();
  if (!trimmed) return DEFAULT_SCHOOL_TIMEZONE;
  try {
    // Throws RangeError for invalid IANA names
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return trimmed;
  } catch {
    return DEFAULT_SCHOOL_TIMEZONE;
  }
}

/** Calendar date (YYYY-MM-DD) in the school's timezone. */
export function localDateString(now: Date, timeZone?: string | null): string {
  const tz = resolveSchoolTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error(`Unable to format local date for timezone ${tz}`);
  }
  return `${year}-${month}-${day}`;
}

/** Minutes since local midnight in the school's timezone (0–1439). */
export function localMinutesOfDay(now: Date, timeZone?: string | null): number {
  const tz = resolveSchoolTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  let hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  // Some engines report midnight as 24:00
  if (hour === 24) hour = 0;
  return hour * 60 + minute;
}
