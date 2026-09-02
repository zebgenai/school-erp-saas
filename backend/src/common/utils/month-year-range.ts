/**
 * Build a Prisma date filter from optional month/year selections.
 *
 * - month + year -> that single month
 * - year only    -> the whole year
 * - month only   -> that month in the current year
 * - neither      -> undefined (no date constraint)
 *
 * Ranges are built in UTC to match how dates are persisted.
 */
export function monthYearRange(
  month?: number,
  year?: number,
): { gte: Date; lt: Date } | undefined {
  if (!month && !year) return undefined;

  const resolvedYear = year ?? new Date().getUTCFullYear();

  if (!month) {
    return {
      gte: new Date(Date.UTC(resolvedYear, 0, 1)),
      lt: new Date(Date.UTC(resolvedYear + 1, 0, 1)),
    };
  }

  return {
    gte: new Date(Date.UTC(resolvedYear, month - 1, 1)),
    lt: new Date(Date.UTC(resolvedYear, month, 1)),
  };
}
