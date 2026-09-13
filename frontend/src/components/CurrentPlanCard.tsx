import { CreditCard } from "lucide-react";
import { Card, StatusBadge } from "@/components/ui-kit";
import { formatPlanDate, schoolPlanDisplay, type SchoolSubscriptionView } from "@/lib/school-plan-display";

export function CurrentPlanCard({
  subscription,
  loading = false,
}: {
  subscription?: SchoolSubscriptionView;
  loading?: boolean;
}) {
  const { planName, status, endDate } = schoolPlanDisplay(subscription);
  const expiry = formatPlanDate(endDate);

  return (
    <Card>
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <CreditCard className="size-4" /> Current Plan
      </h3>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading plan{"\u2026"}</p>
      ) : (
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Plan</dt>
            <dd className="font-semibold">{planName}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Status</dt>
            <dd>{status ? <StatusBadge status={status} /> : <span className="text-muted-foreground">{"\u2014"}</span>}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Expires</dt>
            <dd className="font-medium">{expiry || "\u2014"}</dd>
          </div>
        </dl>
      )}
    </Card>
  );
}
