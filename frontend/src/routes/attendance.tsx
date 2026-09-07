import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Save, UserCheck, UserX, Clock, Plane } from "lucide-react";
import { toast } from "sonner";
import { toastSuccess, toastError } from "@/lib/errors";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PageHeader, Skeleton, EmptyState, StatusBadge, ErrorState } from "@/components/ui-kit";
import { Button, Select } from "@/components/form";
import { useApiQuery, asList } from "@/lib/hooks";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/attendance")({
  head: () => ({ meta: [{ title: "Attendance — School ERP" }] }),
  component: () => <AppShell><AttendancePage /></AppShell>,
});

const STATUSES = ["PRESENT", "ABSENT", "LEAVE", "LATE"] as const;
type S = typeof STATUSES[number];

function AttendancePage() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const canMark = can("attendance.mark");
  const classes = useApiQuery<any>("/classes");
  const sections = useApiQuery<any>("/sections");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const students = useApiQuery<any>(classId ? `/students` : null, { classId, sectionId, limit: 200 });
  const existing = useApiQuery<any>(classId ? `/attendance` : null, { classId, sectionId, date });
  const summary = useApiQuery<any>("/attendance/summary", { date, classId, sectionId });

  const [marks, setMarks] = useState<Record<string, S>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const m: Record<string, S> = {};
    asList<any>(existing.data).forEach((a: any) => { m[a.studentId] = (a.status as S) || "PRESENT"; });
    setMarks(m);
  }, [existing.data]);

  const studentList = useMemo(() => asList<any>(students.data), [students.data]);

  const setAll = (s: S) => {
    const m: Record<string, S> = {};
    studentList.forEach((st) => (m[st.id] = s));
    setMarks(m);
  };

  const save = async () => {
    if (!classId) return toast.error("Select a class");
    setSaving(true);
    try {
      const isSuper = (user?.role || "").toUpperCase() === "SUPER_ADMIN";
      const schoolId = (user as any)?.schoolId || user?.school?.id;
      const records = studentList.map((st) => ({
        studentId: st.id,
        status: marks[st.id] || "PRESENT",
        remarks: "",
      }));
      const body: Record<string, any> = { classId, date, records };
      if (sectionId) body.sectionId = sectionId;
      if (isSuper && schoolId) body.schoolId = schoolId;
      await api.post("/attendance/bulk", body);
        toastSuccess("Attendance saved successfully");
      existing.refetch(); summary.refetch();
    } catch (e: any) { toastError(e); }
    finally { setSaving(false); }
  };

  const counts = useMemo(() => {
    const c = { PRESENT: 0, ABSENT: 0, LEAVE: 0, LATE: 0 } as Record<S, number>;
    Object.values(marks).forEach((v) => { c[v] = (c[v] || 0) + 1; });
    return c;
  }, [marks]);

  const s = summary.data || {};

  return (
    <div>
      <PageHeader title="Attendance" description="Mark daily attendance for each class and section." />

      <Card className="mb-4">
        <div className="grid sm:grid-cols-4 gap-3">
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Select Class</option>
            {asList<any>(classes.data).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">All Sections</option>
            {asList<any>(sections.data).map((sec) => <option key={sec.id} value={sec.id}>{sec.name}</option>)}
          </Select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="h-10 px-3 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
          {canMark && (
          <Button onClick={save} loading={saving} disabled={!classId || studentList.length === 0}>
            <Save className="size-4" /> Save Attendance
          </Button>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Present", v: counts.PRESENT, icon: UserCheck, color: "text-emerald-600 bg-emerald-500/10" },
          { label: "Absent", v: counts.ABSENT, icon: UserX, color: "text-rose-600 bg-rose-500/10" },
          { label: "Late", v: counts.LATE, icon: Clock, color: "text-amber-600 bg-amber-500/10" },
          { label: "Leave", v: counts.LEAVE, icon: Plane, color: "text-blue-600 bg-blue-500/10" },
        ].map((c) => (
          <Card key={c.label} hover>
            <div className="flex items-center gap-3">
              <div className={`size-10 rounded-xl grid place-items-center ${c.color}`}><c.icon className="size-5" /></div>
              <div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
                <div className="text-xl font-bold">{c.v}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b flex-wrap gap-2">
          <div className="font-semibold">Mark Attendance · {studentList.length} students</div>
          <div className="flex gap-1">
            {STATUSES.map((s) => (
              <button key={s} onClick={() => setAll(s)} className="px-2.5 py-1 rounded-md text-xs bg-muted hover:bg-muted/70 font-medium">
                All {s.toLowerCase()}
              </button>
            ))}
          </div>
        </div>
        {!classId ? (
          <EmptyState icon={CalendarCheck} title="Select a class" description="Pick a class to begin marking attendance." />
        ) : students.error ? (
          <ErrorState message={students.error} onRetry={students.refetch} />
        ) : students.loading ? (
          <div className="p-6 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : studentList.length === 0 ? (
          <EmptyState icon={CalendarCheck} title="No students in this class" />
        ) : (
          <ul className="divide-y">
            {studentList.map((st) => {
              const cur = marks[st.id] || "PRESENT";
              return (
                <li key={st.id} className="flex items-center gap-3 p-3 sm:p-4 hover:bg-muted/30 transition">
                  <div className="size-9 rounded-full bg-primary/10 text-primary grid place-items-center font-semibold text-sm">
                    {(st.fullName || "?").charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{st.fullName}</div>
                    <div className="text-xs text-muted-foreground">{st.admissionNo}</div>
                  </div>
                  <div className="flex gap-1">
                    {STATUSES.map((s) => (
                      <button key={s} onClick={() => setMarks((p) => ({ ...p, [st.id]: s }))}
                        className={cn(
                          "px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition",
                          cur === s
                            ? s === "PRESENT" ? "bg-success text-success-foreground border-success"
                              : s === "ABSENT" ? "bg-destructive text-destructive-foreground border-destructive"
                              : s === "LATE" ? "bg-warning text-warning-foreground border-warning"
                              : "bg-info text-white border-info"
                            : "bg-card hover:bg-muted text-muted-foreground"
                        )}>{s.charAt(0) + s.slice(1).toLowerCase()}</button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
