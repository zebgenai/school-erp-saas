import { CalendarDays } from "lucide-react";
import { Card, EmptyState, Skeleton } from "@/components/ui-kit";
import { useApiQuery, asList } from "@/lib/hooks";

type UpcomingEvent = {
  id: string;
  title: string;
  eventType: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  allDay: boolean;
  colorLabel: string;
  className: string | null;
  sectionName: string | null;
  location: string | null;
};

function formatDay(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Upcoming academic calendar events — shared by the admin dashboard and all portals. */
export function UpcomingEventsWidget({
  limit = 5,
  title = "Upcoming Events",
  className,
}: {
  limit?: number;
  title?: string;
  className?: string;
}) {
  const { data, loading } = useApiQuery<any>("/academic-calendar/upcoming", { limit });
  const events = asList<UpcomingEvent>((data as any)?.events);

  return (
    <Card className={className}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <a href="/academic-calendar" className="text-xs text-primary hover:underline">
          View calendar
        </a>
      </div>

      {loading ? (
        <Skeleton className="h-32" />
      ) : events.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No upcoming events" />
      ) : (
        <ul className="divide-y">
          {events.map((e) => (
            <li key={e.id} className="py-2.5 flex items-start gap-3">
              <span
                className="mt-1.5 size-2.5 rounded-full shrink-0"
                style={{ backgroundColor: e.colorLabel }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{e.title}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {formatDay(e.startDate)}
                  {!e.allDay && e.startTime ? ` · ${e.startTime}` : ""}
                  {e.className ? ` · ${e.className}` : ""}
                  {e.location ? ` · ${e.location}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
