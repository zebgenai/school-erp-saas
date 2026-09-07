import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  MapPin,
  Plus,
  Printer,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import {
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  StatusBadge,
} from "@/components/ui-kit";
import { Button, Field, Select, TextInput, Textarea } from "@/components/form";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { api } from "@/lib/api";
import { useApiQuery, asList, asObj } from "@/lib/hooks";
import { usePermissions } from "@/lib/permissions";
import { downloadCSV, printHtml } from "@/lib/printUtils";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/academic-calendar")({
  head: () => ({ meta: [{ title: "Academic Calendar — School ERP" }] }),
  component: () => (
    <AppShell>
      <AcademicCalendarPage />
    </AppShell>
  ),
});

type ViewMode = "month" | "week" | "day" | "agenda" | "reports";

type CalendarEvent = {
  id: string;
  sourceId: string;
  source: "MANUAL" | "EXAM" | "HOMEWORK" | "ONLINE_CLASS" | "FEE";
  title: string;
  description: string | null;
  eventType: string;
  status: string;
  academicSession: string | null;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  colorLabel: string;
  recurrence: string;
  classId: string | null;
  className: string | null;
  sectionId: string | null;
  sectionName: string | null;
  teacherId: string | null;
  teacherName: string | null;
  visibility: string[];
  editable: boolean;
  linkUrl: string | null;
};

type EventTypeMeta = { value: string; label: string; color: string };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** All calendar math runs on UTC-normalised keys so it matches the API's date strings. */
function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d.getTime());
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

function startOfWeek(d: Date): Date {
  return addDays(d, -d.getUTCDay());
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function formatLongDate(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
}

function eventCoversDay(e: CalendarEvent, key: string): boolean {
  return e.startDate <= key && e.endDate >= key;
}

function AcademicCalendarPage() {
  const { role, can } = usePermissions();
  const isPortalUser = role === "STUDENT" || role === "PARENT";
  const canManage =
    !isPortalUser && (role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN" || role === "TEACHER");

  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState<Date>(todayUtc());
  const [filters, setFilters] = useState({
    classId: "",
    sectionId: "",
    teacherId: "",
    eventType: "",
    academicSession: "",
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [deleting, setDeleting] = useState<CalendarEvent | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const range = useMemo(() => {
    if (view === "day") {
      return { from: dateKey(cursor), to: dateKey(cursor) };
    }
    if (view === "week") {
      const start = startOfWeek(cursor);
      return { from: dateKey(start), to: dateKey(addDays(start, 6)) };
    }
    if (view === "agenda") {
      return { from: dateKey(cursor), to: dateKey(addDays(cursor, 90)) };
    }
    const first = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    const last = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    return { from: dateKey(startOfWeek(first)), to: dateKey(addDays(startOfWeek(last), 6)) };
  }, [view, cursor]);

  const meta = useApiQuery<any>("/academic-calendar/meta", undefined, { staleTime: 10 * 60_000 });
  const widgets = useApiQuery<any>("/academic-calendar/widgets");
  const classes = useApiQuery<any>(isPortalUser ? null : "/classes");
  const sections = useApiQuery<any>(isPortalUser ? null : "/sections");
  const teachers = useApiQuery<any>(isPortalUser ? null : "/teachers");

  const feed = useApiQuery<any>(
    view === "reports" ? null : "/academic-calendar/feed",
    {
      from: range.from,
      to: range.to,
      ...(filters.classId ? { classId: filters.classId } : {}),
      ...(filters.sectionId ? { sectionId: filters.sectionId } : {}),
      ...(filters.teacherId ? { teacherId: filters.teacherId } : {}),
      ...(filters.eventType ? { eventType: filters.eventType } : {}),
      ...(filters.academicSession ? { academicSession: filters.academicSession } : {}),
    },
  );

  const eventTypes = asList<EventTypeMeta>(asObj<any>(meta.data).eventTypes);
  const events = asList<CalendarEvent>(asObj<any>(feed.data).events);
  const w = asObj<any>(widgets.data);

  const refreshAll = () => {
    feed.refetch();
    widgets.refetch();
  };

  const shift = (dir: number) => {
    if (view === "day") setCursor((c) => addDays(c, dir));
    else if (view === "week") setCursor((c) => addDays(c, dir * 7));
    else if (view === "agenda") setCursor((c) => addDays(c, dir * 30));
    else
      setCursor(
        (c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + dir, 1)),
      );
  };

  const rangeLabel =
    view === "day"
      ? formatLongDate(dateKey(cursor))
      : view === "week"
        ? `${formatLongDate(range.from)} — ${formatLongDate(range.to)}`
        : view === "agenda"
          ? `Next 90 days from ${formatLongDate(range.from)}`
          : `${MONTH_NAMES[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`;

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/academic-calendar/${deleting.sourceId}`);
      toast.success("Event deleted");
      setDeleting(null);
      setSelected(null);
      refreshAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete event");
    } finally {
      setDeleteBusy(false);
    }
  };

  const setStatus = async (event: CalendarEvent, action: "publish" | "cancel") => {
    try {
      await api.post(`/academic-calendar/${event.sourceId}/${action}`);
      toast.success(action === "publish" ? "Event published" : "Event cancelled");
      setSelected(null);
      refreshAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update event");
    }
  };

  return (
    <div>
      <PageHeader
        title="Academic Calendar"
        description="Holidays, exams, meetings, and school events across every class and portal."
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> New Event
            </Button>
          ) : undefined
        }
      />

      <div className="grid sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Today's Events" value={w.todayEvents ?? 0} icon={CalendarDays} loading={widgets.loading} />
        <StatCard label="Upcoming" value={w.upcomingEvents ?? 0} icon={Clock} loading={widgets.loading} />
        <StatCard label="Holidays This Month" value={w.holidaysThisMonth ?? 0} icon={CalendarRange} loading={widgets.loading} />
        <StatCard label="Total in Range" value={w.totalEvents ?? 0} icon={Users} loading={widgets.loading} />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="inline-flex gap-1 p-1 bg-muted rounded-xl">
          {(
            [
              { id: "month", label: "Month" },
              { id: "week", label: "Week" },
              { id: "day", label: "Day" },
              { id: "agenda", label: "Agenda" },
              ...(!isPortalUser ? [{ id: "reports" as const, label: "Reports" }] : []),
            ] as { id: ViewMode; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition",
                view === t.id ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {view !== "reports" && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => shift(-1)} aria-label="Previous">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(todayUtc())}>
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={() => shift(1)} aria-label="Next">
              <ChevronRight className="size-4" />
            </Button>
            <span className="text-sm font-medium ml-1">{rangeLabel}</span>
          </div>
        )}
      </div>

      {!isPortalUser && view !== "reports" && (
        <Card className="mb-4 p-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Field label="Class">
              <Select
                value={filters.classId}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, classId: e.target.value, sectionId: "" }))
                }
              >
                <option value="">All classes</option>
                {asList<any>(classes.data).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Section">
              <Select
                value={filters.sectionId}
                onChange={(e) => setFilters((f) => ({ ...f, sectionId: e.target.value }))}
              >
                <option value="">All sections</option>
                {asList<any>(sections.data)
                  .filter((s) => !filters.classId || s.classId === filters.classId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
              </Select>
            </Field>
            <Field label="Teacher">
              <Select
                value={filters.teacherId}
                onChange={(e) => setFilters((f) => ({ ...f, teacherId: e.target.value }))}
              >
                <option value="">All teachers</option>
                {asList<any>(teachers.data).map((t) => (
                  <option key={t.id} value={t.id}>{t.fullName}</option>
                ))}
              </Select>
            </Field>
            <Field label="Event Type">
              <Select
                value={filters.eventType}
                onChange={(e) => setFilters((f) => ({ ...f, eventType: e.target.value }))}
              >
                <option value="">All types</option>
                {eventTypes.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Academic Session">
              <TextInput
                placeholder="e.g. 2025-2026"
                value={filters.academicSession}
                onChange={(e) => setFilters((f) => ({ ...f, academicSession: e.target.value }))}
              />
            </Field>
          </div>
        </Card>
      )}

      {view === "reports" ? (
        <CalendarReports eventTypes={eventTypes} />
      ) : feed.loading ? (
        <Card><Skeleton className="h-96" /></Card>
      ) : feed.error ? (
        <Card><ErrorState message={feed.error} onRetry={feed.refetch} /></Card>
      ) : view === "month" ? (
        <MonthView cursor={cursor} events={events} onSelect={setSelected} />
      ) : view === "week" ? (
        <WeekView from={range.from} events={events} onSelect={setSelected} />
      ) : view === "day" ? (
        <DayView day={range.from} events={events} onSelect={setSelected} />
      ) : (
        <AgendaView events={events} onSelect={setSelected} />
      )}

      <EventFormModal
        open={createOpen || Boolean(editing)}
        event={editing}
        eventTypes={eventTypes}
        classes={asList<any>(classes.data)}
        sections={asList<any>(sections.data)}
        teachers={asList<any>(teachers.data)}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreateOpen(false);
          setEditing(null);
          refreshAll();
        }}
      />

      <EventDetailModal
        event={selected}
        canManage={canManage}
        onClose={() => setSelected(null)}
        onEdit={(e) => {
          setSelected(null);
          setEditing(e);
        }}
        onDelete={(e) => setDeleting(e)}
        onStatus={setStatus}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        loading={deleteBusy}
        title="Delete calendar event"
        message={`"${deleting?.title ?? ""}" will be permanently removed from the calendar.`}
      />
    </div>
  );
}

function StatCard({
  label, value, icon: Icon, loading,
}: { label: string; value: number | string; icon: any; loading?: boolean }) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <Icon className="size-5 text-primary" />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold">
          {loading ? <Skeleton className="h-6 w-10" /> : value}
        </div>
      </div>
    </Card>
  );
}

function EventChip({
  event, onSelect, compact,
}: { event: CalendarEvent; onSelect: (e: CalendarEvent) => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      title={event.title}
      className={cn(
        "w-full text-left rounded-md px-1.5 py-1 text-[11px] font-medium truncate transition hover:opacity-80",
        event.status === "CANCELLED" && "line-through opacity-60",
        compact ? "leading-tight" : "",
      )}
      style={{ backgroundColor: `${event.colorLabel}1a`, color: event.colorLabel }}
    >
      {!event.allDay && event.startTime ? `${event.startTime} ` : ""}
      {event.title}
    </button>
  );
}

function MonthView({
  cursor, events, onSelect,
}: { cursor: Date; events: CalendarEvent[]; onSelect: (e: CalendarEvent) => void }) {
  const first = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = dateKey(todayUtc());

  return (
    <Card className="p-0 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border/60">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-2 text-[11px] font-semibold text-muted-foreground text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = dateKey(day);
          const inMonth = day.getUTCMonth() === cursor.getUTCMonth();
          const dayEvents = events.filter((e) => eventCoversDay(e, key));
          return (
            <div
              key={key}
              className={cn(
                "min-h-[104px] border-r border-b border-border/40 p-1.5 space-y-1",
                !inMonth && "bg-muted/30",
              )}
            >
              <div
                className={cn(
                  "text-[11px] font-semibold w-6 h-6 grid place-items-center rounded-full",
                  key === today ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  !inMonth && "opacity-50",
                )}
              >
                {day.getUTCDate()}
              </div>
              {dayEvents.slice(0, 3).map((e) => (
                <EventChip key={e.id} event={e} onSelect={onSelect} compact />
              ))}
              {dayEvents.length > 3 && (
                <div className="text-[10px] text-muted-foreground pl-1">
                  +{dayEvents.length - 3} more
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function WeekView({
  from, events, onSelect,
}: { from: string; events: CalendarEvent[]; onSelect: (e: CalendarEvent) => void }) {
  const start = new Date(`${from}T00:00:00Z`);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = dateKey(todayUtc());

  return (
    <Card className="p-0 overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-7">
        {days.map((day) => {
          const key = dateKey(day);
          const dayEvents = events.filter((e) => eventCoversDay(e, key));
          return (
            <div key={key} className="border-r border-b border-border/40 p-2 min-h-[200px] space-y-1.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {WEEKDAYS[day.getUTCDay()]}
                </span>
                <span
                  className={cn(
                    "text-[11px] font-semibold w-6 h-6 grid place-items-center rounded-full",
                    key === today && "bg-primary text-primary-foreground",
                  )}
                >
                  {day.getUTCDate()}
                </span>
              </div>
              {dayEvents.length === 0 ? (
                <div className="text-[11px] text-muted-foreground/60">—</div>
              ) : (
                dayEvents.map((e) => <EventChip key={e.id} event={e} onSelect={onSelect} />)
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DayView({
  day, events, onSelect,
}: { day: string; events: CalendarEvent[]; onSelect: (e: CalendarEvent) => void }) {
  const dayEvents = events.filter((e) => eventCoversDay(e, day));
  return (
    <Card>
      <h3 className="text-sm font-semibold mb-3">{formatLongDate(day)}</h3>
      {dayEvents.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No events" description="Nothing scheduled for this day." />
      ) : (
        <ul className="divide-y">
          {dayEvents.map((e) => (
            <EventRow key={e.id} event={e} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function AgendaView({
  events, onSelect,
}: { events: CalendarEvent[]; onSelect: (e: CalendarEvent) => void }) {
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const list = map.get(e.startDate) ?? [];
      list.push(e);
      map.set(e.startDate, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [events]);

  if (grouped.length === 0) {
    return (
      <Card>
        <EmptyState icon={CalendarDays} title="No events" description="Nothing scheduled in this range." />
      </Card>
    );
  }

  return (
    <Card className="p-0">
      <div className="max-h-[680px] overflow-y-auto divide-y">
        {grouped.map(([key, list]) => (
          <div key={key}>
            <div className="px-4 py-2 bg-muted/40 text-xs font-semibold sticky top-0">
              {formatLongDate(key)}
            </div>
            <ul className="divide-y">
              {list.map((e) => (
                <EventRow key={e.id} event={e} onSelect={onSelect} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

function EventRow({
  event, onSelect,
}: { event: CalendarEvent; onSelect: (e: CalendarEvent) => void }) {
  return (
    <li
      className="p-3 cursor-pointer hover:bg-muted/40 flex items-start justify-between gap-3"
      onClick={() => onSelect(event)}
    >
      <div className="flex items-start gap-3 min-w-0">
        <span className="mt-1.5 size-2.5 rounded-full shrink-0" style={{ backgroundColor: event.colorLabel }} />
        <div className="min-w-0">
          <p className={cn("text-sm font-medium truncate", event.status === "CANCELLED" && "line-through")}>
            {event.title}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {event.eventType.replace(/_/g, " ")}
            {event.className ? ` · ${event.className}` : ""}
            {event.sectionName ? ` ${event.sectionName}` : ""}
            {event.teacherName ? ` · ${event.teacherName}` : ""}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {event.allDay ? "All day" : `${event.startTime ?? ""} – ${event.endTime ?? ""}`}
            {event.location ? ` · ${event.location}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {event.source !== "MANUAL" && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
            AUTO
          </span>
        )}
        <StatusBadge status={event.status} />
      </div>
    </li>
  );
}

function EventDetailModal({
  event, canManage, onClose, onEdit, onDelete, onStatus,
}: {
  event: CalendarEvent | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: (e: CalendarEvent) => void;
  onDelete: (e: CalendarEvent) => void;
  onStatus: (e: CalendarEvent, action: "publish" | "cancel") => void;
}) {
  if (!event) return null;
  const editable = canManage && event.editable;

  return (
    <Modal
      open={Boolean(event)}
      onClose={onClose}
      title={event.title}
      description={event.eventType.replace(/_/g, " ")}
      footer={
        editable ? (
          <>
            <Button variant="outline" size="sm" onClick={() => onDelete(event)}>
              <Trash2 className="size-4" /> Delete
            </Button>
            {event.status !== "PUBLISHED" && (
              <Button variant="secondary" size="sm" onClick={() => onStatus(event, "publish")}>
                Publish
              </Button>
            )}
            {event.status !== "CANCELLED" && (
              <Button variant="secondary" size="sm" onClick={() => onStatus(event, "cancel")}>
                Cancel Event
              </Button>
            )}
            <Button size="sm" onClick={() => onEdit(event)}>Edit</Button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <StatusBadge status={event.status} />
          {event.source !== "MANUAL" && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
              Auto-linked from {event.source.replace(/_/g, " ").toLowerCase()}
            </span>
          )}
        </div>

        {event.description && <p className="text-muted-foreground">{event.description}</p>}

        <div className="grid sm:grid-cols-2 gap-3 pt-2">
          <Detail label="Starts" value={formatLongDate(event.startDate)} />
          <Detail label="Ends" value={formatLongDate(event.endDate)} />
          <Detail
            label="Time"
            value={event.allDay ? "All day" : `${event.startTime ?? "—"} – ${event.endTime ?? "—"}`}
          />
          <Detail label="Recurrence" value={event.recurrence} />
          <Detail label="Class" value={event.className ?? "All classes"} />
          <Detail label="Section" value={event.sectionName ?? "All sections"} />
          <Detail label="Teacher" value={event.teacherName ?? "—"} />
          <Detail label="Academic Session" value={event.academicSession ?? "—"} />
        </div>

        {event.location && (
          <div className="flex items-center gap-2 text-muted-foreground pt-1">
            <MapPin className="size-4" /> {event.location}
          </div>
        )}

        <div className="pt-1">
          <div className="text-xs text-muted-foreground mb-1">Visible to</div>
          <div className="flex flex-wrap gap-1.5">
            {event.visibility.map((v) => (
              <span key={v} className="text-[11px] px-2 py-0.5 rounded-full bg-muted font-medium">
                {v}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

const VISIBILITY_OPTIONS = ["SCHOOL", "TEACHER", "STUDENT", "PARENT", "STAFF"];

function EventFormModal({
  open, event, eventTypes, classes, sections, teachers, onClose, onSaved,
}: {
  open: boolean;
  event: CalendarEvent | null;
  eventTypes: EventTypeMeta[];
  classes: any[];
  sections: any[];
  teachers: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() => blankForm());
  const [visibility, setVisibility] = useState<string[]>(VISIBILITY_OPTIONS);
  const [saving, setSaving] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  // Hydrate the form the first time a given event is opened for editing.
  const targetId = event?.sourceId ?? null;
  if (open && targetId !== loadedId) {
    setLoadedId(targetId);
    if (event) {
      setForm({
        title: event.title,
        description: event.description ?? "",
        eventType: event.eventType,
        academicSession: event.academicSession ?? "",
        classId: event.classId ?? "",
        sectionId: event.sectionId ?? "",
        teacherId: event.teacherId ?? "",
        startDate: event.startDate,
        endDate: event.endDate,
        startTime: event.startTime ?? "",
        endTime: event.endTime ?? "",
        allDay: event.allDay,
        location: event.location ?? "",
        colorLabel: event.colorLabel,
        recurrence: event.recurrence,
        recurrenceUntil: "",
        status: event.status,
      });
      setVisibility(event.visibility.length ? event.visibility : VISIBILITY_OPTIONS);
    } else {
      setForm(blankForm());
      setVisibility(VISIBILITY_OPTIONS);
    }
  }

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const toggleVisibility = (v: string) =>
    setVisibility((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));

  const submit = async () => {
    if (!form.title.trim()) return toast.error("Title is required");
    if (!form.startDate || !form.endDate) return toast.error("Start and end dates are required");
    if (form.endDate < form.startDate) return toast.error("End date cannot be before start date");
    if (!form.allDay && (!form.startTime || !form.endTime)) {
      return toast.error("Start and end time are required for timed events");
    }
    if (form.recurrence !== "NONE" && !form.recurrenceUntil) {
      return toast.error("Recurring events need a repeat-until date");
    }
    if (visibility.length === 0) return toast.error("Select at least one audience");

    const payload: Record<string, any> = {
      title: form.title.trim(),
      description: form.description || undefined,
      eventType: form.eventType,
      academicSession: form.academicSession || undefined,
      classId: form.classId || undefined,
      sectionId: form.sectionId || undefined,
      teacherId: form.teacherId || undefined,
      startDate: form.startDate,
      endDate: form.endDate,
      allDay: form.allDay,
      startTime: form.allDay ? undefined : form.startTime,
      endTime: form.allDay ? undefined : form.endTime,
      location: form.location || undefined,
      colorLabel: form.colorLabel || undefined,
      recurrence: form.recurrence,
      recurrenceUntil: form.recurrence === "NONE" ? undefined : form.recurrenceUntil,
      visibility,
      status: form.status,
    };

    setSaving(true);
    try {
      if (event) {
        await api.patch(`/academic-calendar/${event.sourceId}`, payload);
        toast.success("Event updated");
      } else {
        await api.post("/academic-calendar", payload);
        toast.success("Event created");
      }
      setLoadedId(null);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save event");
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    setLoadedId(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={event ? "Edit Event" : "New Calendar Event"}
      description="Events appear on every portal that matches the selected audience."
      size="lg"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={close} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={submit} loading={saving}>
            {event ? "Save Changes" : "Create Event"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <TextInput
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Annual Sports Day"
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Event Type">
            <Select value={form.eventType} onChange={(e) => set("eventType", e.target.value)}>
              {eventTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Academic Session">
            <TextInput
              value={form.academicSession}
              onChange={(e) => set("academicSession", e.target.value)}
              placeholder="2025-2026"
            />
          </Field>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Class (optional)">
            <Select
              value={form.classId}
              onChange={(e) => {
                set("classId", e.target.value);
                set("sectionId", "");
              }}
            >
              <option value="">Whole school</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Section (optional)">
            <Select value={form.sectionId} onChange={(e) => set("sectionId", e.target.value)}>
              <option value="">All sections</option>
              {sections
                .filter((s) => !form.classId || s.classId === form.classId)
                .map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
            </Select>
          </Field>
          <Field label="Teacher (optional)">
            <Select value={form.teacherId} onChange={(e) => set("teacherId", e.target.value)}>
              <option value="">—</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.fullName}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Start Date">
            <TextInput type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </Field>
          <Field label="End Date">
            <TextInput type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.allDay}
            onChange={(e) => set("allDay", e.target.checked)}
            className="size-4 rounded border-input"
          />
          All day event
        </label>

        {!form.allDay && (
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Start Time">
              <TextInput type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
            </Field>
            <Field label="End Time">
              <TextInput type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
            </Field>
          </div>
        )}

        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Location">
            <TextInput value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Main Hall" />
          </Field>
          <Field label="Color Label">
            <TextInput type="color" value={form.colorLabel} onChange={(e) => set("colorLabel", e.target.value)} className="h-11 p-1" />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Repeat">
            <Select value={form.recurrence} onChange={(e) => set("recurrence", e.target.value)}>
              <option value="NONE">Does not repeat</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Yearly</option>
            </Select>
          </Field>
          {form.recurrence !== "NONE" && (
            <Field label="Repeat Until">
              <TextInput
                type="date"
                value={form.recurrenceUntil}
                onChange={(e) => set("recurrenceUntil", e.target.value)}
              />
            </Field>
          )}
        </div>

        <Field label="Visibility">
          <div className="flex flex-wrap gap-2 pt-1">
            {VISIBILITY_OPTIONS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => toggleVisibility(v)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium border transition",
                  visibility.includes(v)
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-card text-muted-foreground border-border",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Description">
          <Textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Optional details shown on every portal"
          />
        </Field>
      </div>
    </Modal>
  );
}

function blankForm() {
  const today = dateKey(todayUtc());
  return {
    title: "",
    description: "",
    eventType: "SCHOOL_EVENT",
    academicSession: "",
    classId: "",
    sectionId: "",
    teacherId: "",
    startDate: today,
    endDate: today,
    startTime: "",
    endTime: "",
    allDay: true,
    location: "",
    colorLabel: "#0ea5e9",
    recurrence: "NONE",
    recurrenceUntil: "",
    status: "PUBLISHED",
  };
}

const REPORT_OPTIONS = [
  { value: "monthly", label: "Monthly Academic Calendar" },
  { value: "holidays", label: "Holiday List" },
  { value: "events", label: "Events Report" },
  { value: "teacher", label: "Teacher Calendar" },
  { value: "student", label: "Student Calendar" },
];

function CalendarReports({ eventTypes }: { eventTypes: EventTypeMeta[] }) {
  const now = new Date();
  const [report, setReport] = useState("monthly");
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [teacherId, setTeacherId] = useState("");
  const [classId, setClassId] = useState("");

  const teachers = useApiQuery<any>("/teachers");
  const classes = useApiQuery<any>("/classes");

  const data = useApiQuery<any>("/academic-calendar/reports", {
    report,
    month,
    year,
    ...(report === "teacher" && teacherId ? { teacherId } : {}),
    ...(report === "student" && classId ? { classId } : {}),
  });

  const result = asObj<any>(data.data);
  const items = asList<CalendarEvent>(result.items);
  const byType = asList<any>(result.byType);
  const reportLabel = REPORT_OPTIONS.find((r) => r.value === report)?.label ?? "Calendar Report";

  const rows = items.map((e) => [
    e.title,
    e.eventType.replace(/_/g, " "),
    e.startDate,
    e.endDate,
    e.allDay ? "All day" : `${e.startTime ?? ""}-${e.endTime ?? ""}`,
    e.className ?? "All",
    e.sectionName ?? "All",
    e.teacherName ?? "—",
    e.location ?? "—",
    e.status,
  ]);

  const headers = [
    "Title", "Type", "Start", "End", "Time", "Class", "Section", "Teacher", "Location", "Status",
  ];

  const exportCsv = () => {
    if (rows.length === 0) return toast.error("Nothing to export");
    downloadCSV(`${report}-calendar-${year}.csv`, headers, rows);
  };

  const print = () => {
    if (rows.length === 0) return toast.error("Nothing to print");
    const period =
      report === "monthly" ? `${MONTH_NAMES[Number(month) - 1]} ${year}` : `Year ${year}`;
    const body = `
      <div class="header">
        <div>
          <div class="logo">${reportLabel}</div>
          <div style="font-size:12px;color:#555;margin-top:2px">${period}</div>
        </div>
        <div class="meta"><div><strong>Total Events:</strong> ${items.length}</div></div>
      </div>
      <table>
        <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.map((r) => `<tr>${r.map((c) => `<td>${String(c ?? "")}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>`;
    printHtml(body, reportLabel);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <Field label="Report">
            <Select value={report} onChange={(e) => setReport(e.target.value)}>
              {REPORT_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </Field>
          {report === "monthly" && (
            <Field label="Month">
              <Select value={month} onChange={(e) => setMonth(e.target.value)}>
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={String(i + 1)}>{m}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Year">
            <TextInput type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          </Field>
          {report === "teacher" && (
            <Field label="Teacher">
              <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">All teachers</option>
                {asList<any>(teachers.data).map((t) => (
                  <option key={t.id} value={t.id}>{t.fullName}</option>
                ))}
              </Select>
            </Field>
          )}
          {report === "student" && (
            <Field label="Class">
              <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">All classes</option>
                {asList<any>(classes.data).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="size-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={print}>
              <Printer className="size-4" /> Print / PDF
            </Button>
          </div>
        </div>
      </Card>

      {byType.length > 0 && (
        <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {byType.map((t) => (
            <Card key={t.eventType} className="p-3">
              <div className="text-xs text-muted-foreground truncate">{t.label}</div>
              <div className="text-lg font-semibold">{t.count}</div>
            </Card>
          ))}
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        {data.loading ? (
          <div className="p-5"><Skeleton className="h-64" /></div>
        ) : data.error ? (
          <ErrorState message={data.error} onRetry={data.refetch} />
        ) : items.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No events" description="No events match this report." />
        ) : (
          <div className="overflow-x-auto max-h-[560px]">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  {headers.map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ backgroundColor: e.colorLabel }} />
                        {e.title}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {eventTypes.find((t) => t.value === e.eventType)?.label ??
                        e.eventType.replace(/_/g, " ")}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{e.startDate}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{e.endDate}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {e.allDay ? "All day" : `${e.startTime ?? ""}–${e.endTime ?? ""}`}
                    </td>
                    <td className="px-3 py-2">{e.className ?? "All"}</td>
                    <td className="px-3 py-2">{e.sectionName ?? "All"}</td>
                    <td className="px-3 py-2">{e.teacherName ?? "—"}</td>
                    <td className="px-3 py-2">{e.location ?? "—"}</td>
                    <td className="px-3 py-2"><StatusBadge status={e.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
