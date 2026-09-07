import { useState } from "react";
import {
  Activity,
  Archive,
  Banknote,
  Book,
  BookOpen,
  Briefcase,
  Building,
  Bus,
  CalendarCheck,
  CheckCircle,
  ClipboardList,
  CreditCard,
  GraduationCap,
  Key,
  Receipt,
  Trash2,
  Upload,
  UserCog,
  UserPlus,
  Users,
  UserX,
  Wallet,
} from "lucide-react";
import { useApiQuery } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui-kit";

export type TimelineItem = {
  id: string;
  icon: string;
  action: string;
  user: string;
  timestamp: string;
  description: string;
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  activity: Activity,
  "user-plus": UserPlus,
  "user-cog": UserCog,
  "user-x": UserX,
  archive: Archive,
  receipt: Receipt,
  wallet: Wallet,
  banknote: Banknote,
  "check-circle": CheckCircle,
  "calendar-check": CalendarCheck,
  "clipboard-list": ClipboardList,
  "graduation-cap": GraduationCap,
  "book-open": BookOpen,
  book: Book,
  bus: Bus,
  upload: Upload,
  trash: Trash2,
  key: Key,
  briefcase: Briefcase,
  users: Users,
  building: Building,
  "credit-card": CreditCard,
};

function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function ActivityTimeline({
  entity,
  entityId,
  limit = 20,
  className,
}: {
  entity: string;
  entityId: string;
  limit?: number;
  className?: string;
}) {
  const { data, loading, error, refetch } = useApiQuery<TimelineItem[]>(
    entity && entityId ? `/activity/timeline/${entity}/${entityId}?limit=${limit}` : null,
  );

  if (loading) {
    return (
      <div className={cn("space-y-3", className)}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={refetch} />;
  }

  const items = Array.isArray(data) ? data : [];

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No activity yet"
        description="Actions on this record will appear here."
      />
    );
  }

  return (
    <div className={cn("relative", className)}>
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
      <ul className="space-y-4">
        {items.map((item) => {
          const Icon = ICON_MAP[item.icon] ?? Activity;
          return (
            <li key={item.id} className="relative pl-10">
              <div className="absolute left-0 top-0 size-8 rounded-full bg-muted border border-border grid place-items-center">
                <Icon className="size-3.5 text-muted-foreground" />
              </div>
              <div className="rounded-lg border bg-card/50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium capitalize">{item.action}</p>
                  <time className="text-[10px] text-muted-foreground shrink-0">
                    {formatTime(item.timestamp)}
                  </time>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">by {item.user}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function RecentActivityWidget({ className }: { className?: string }) {
  const [period, setPeriod] = useState<"today" | "week" | "month">("week");
  const { data, loading, error, refetch } = useApiQuery<TimelineItem[]>(
    `/activity/recent?period=${period}&limit=20`,
  );

  const items = Array.isArray(data) ? data : [];

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div>
          <h3 className="font-semibold">Recent Activities</h3>
          <p className="text-xs text-muted-foreground">Last 20 events</p>
        </div>
        <div className="flex gap-1 rounded-lg border p-0.5 bg-muted/30">
          {(["today", "week", "month"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                "px-2.5 py-1 text-xs rounded-md transition capitalize",
                period === p
                  ? "bg-background shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p === "today" ? "Today" : p === "week" ? "This Week" : "This Month"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No recent activity"
          description="School events will show up here."
        />
      ) : (
        <ul className="divide-y max-h-80 overflow-y-auto">
          {items.map((item) => {
            const Icon = ICON_MAP[item.icon] ?? Activity;
            return (
              <li key={item.id} className="py-3 flex gap-3">
                <div className="size-8 shrink-0 rounded-lg bg-muted grid place-items-center">
                  <Icon className="size-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate capitalize">{item.action}</p>
                    <time className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(item.timestamp).toLocaleDateString()}
                    </time>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
                  <p className="text-[10px] text-muted-foreground/70">{item.user}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
