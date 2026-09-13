export type SchoolSubscriptionView = {
  status?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  plan?: { name?: string | null } | null;
} | null;

export function schoolPlanDisplay(subscription?: SchoolSubscriptionView) {
  const planName = subscription?.plan?.name?.trim() || "No Plan";
  const status = subscription?.status?.trim() || null;
  const endDate = subscription?.endDate ?? null;
  return { planName, status, endDate, hasPlan: Boolean(subscription?.plan?.name?.trim()) };
}

export function formatPlanDate(value?: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
}
