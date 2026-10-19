import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  UserCog, CalendarCheck, BookOpen, Clock, ClipboardList,
  GraduationCap, Wallet, Users, CheckCircle2, XCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PageHeader, Skeleton, EmptyState, StatusBadge } from "@/components/ui-kit";
import { UpcomingEventsWidget } from "@/components/UpcomingEventsWidget";
import { useApiQuery, asList, asObj } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  attendanceCounts,
  attendanceSchoolParams,
  bulkRecords,
  marksFromStudents,
  registerMatches,
  saveBlockReason,
  schoolTodayDate,
  type AttendanceMark,
} from "@/lib/attendance-register";

export const Route = createFileRoute("/teacher")({
  head: () => ({ meta: [{ title: "Teacher Portal — School ERP" }] }),
  component: () => <AppShell><TeacherPortalGuard /></AppShell>,
});

function TeacherPortalGuard() {
  const { user } = useAuth();
  useEffect(() => {
    if (user && user.role !== "TEACHER") { window.location.href = "/dashboard"; }
  }, [user]);
  if (!user || user.role !== "TEACHER") return null;
  return <TeacherPortal />;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type Tab = "overview" | "timetable" | "attendance" | "results" | "payroll";

function TeacherPortal() {
  const [tab, setTab] = useState<Tab>("overview");
  const portal = useApiQuery<any>("/teachers/my-portal");
  const d = asObj<any>(portal.data);

  const teacher    = d.teacher ?? {};
  const timetable  = asList<any>(d.timetable);
  const classes    = asList<any>(d.classes);
  const todayAtt   = asList<any>(d.todayAttendance);
  const examSubs   = asList<any>(d.examSubjects);
  const payroll    = asList<any>(d.payroll);

  // Build timetable grid
  const ttGrid: Record<string, any> = {};
  timetable.forEach((t: any) => { ttGrid[`${t.dayOfWeek}-${t.periodNo}`] = t; });
  const periods = [...new Set(timetable.map((t: any) => t.periodNo))].sort((a: any, b: any) => a - b);

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: "overview",   label: "Overview",   icon: UserCog },
    { id: "timetable",  label: "Timetable",  icon: Clock },
    { id: "attendance", label: "Attendance", icon: CalendarCheck },
    { id: "results",    label: "Results",    icon: ClipboardList },
    { id: "payroll",    label: "Payroll",    icon: Wallet },
  ];

  if (portal.loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (portal.error || !teacher.id) {
    return (
      <EmptyState icon={UserCog} title="No teacher profile"
        description="Your account is not linked to a teacher profile. Contact the school admin." />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${teacher.fullName}`}
        description={`Teacher Portal · ${classes.length} Class${classes.length !== 1 ? "es" : ""} assigned`}
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-xl w-fit">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === t.id ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { label: "My Classes", value: classes.length, icon: GraduationCap, color: "text-primary" },
              { label: "Today's Attendance", value: todayAtt.length, icon: CalendarCheck, color: "text-green-500" },
              { label: "My Subjects", value: [...new Set(timetable.map((t: any) => t.subjectId))].length, icon: BookOpen, color: "text-amber-500" },
            ].map((c) => (
              <Card key={c.label} hover>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">{c.label}</div>
                  <c.icon className={`size-4 ${c.color}`} />
                </div>
                <div className="text-2xl font-bold mt-1">{c.value}</div>
              </Card>
            ))}
          </div>

          <UpcomingEventsWidget limit={6} title="Upcoming Academic Events" />

          {/* Today's Attendance Summary */}
          <Card>
            <h3 className="font-semibold mb-3 flex items-center gap-2"><CalendarCheck className="size-4 text-primary" /> Today's Attendance</h3>
            {todayAtt.length === 0
              ? <EmptyState icon={CalendarCheck} title="No attendance marked today" description="Use the Attendance tab to mark attendance." />
              : (
                <div className="divide-y max-h-64 overflow-y-auto">
                  {todayAtt.map((a: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <span className="font-medium">{a.student?.fullName}</span>
                        <span className="text-muted-foreground text-xs ml-2">{a.class?.name} {a.section?.name}</span>
                      </div>
                      <span className={`font-medium text-xs ${a.status === "PRESENT" ? "text-green-600" : a.status === "ABSENT" ? "text-destructive" : "text-amber-500"}`}>
                        {a.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
          </Card>

          {/* Assigned Classes */}
          <Card>
            <h3 className="font-semibold mb-3 flex items-center gap-2"><GraduationCap className="size-4 text-primary" /> My Classes</h3>
            {classes.length === 0
              ? <EmptyState icon={GraduationCap} title="No classes assigned" />
              : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {classes.map((cls: any) => (
                    <div key={cls.id} className="border rounded-xl p-3 bg-muted/30">
                      <div className="font-semibold">{cls.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {asList(cls.sections).length} section{asList(cls.sections).length !== 1 ? "s" : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </Card>
        </div>
      )}

      {/* Timetable Tab */}
      {tab === "timetable" && (
        <Card>
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Clock className="size-4 text-primary" /> My Timetable</h3>
          {timetable.length === 0
            ? <EmptyState icon={Clock} title="No timetable assigned" />
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="border px-3 py-2 text-left font-medium">Day</th>
                      {periods.map((p: any) => (
                        <th key={p} className="border px-2 py-2 font-medium text-center">Period {p}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map((day, di) => (
                      <tr key={day} className="hover:bg-muted/30">
                        <td className="border px-3 py-2 font-medium">{day}</td>
                        {periods.map((p: any) => {
                          const entry = ttGrid[`${di + 1}-${p}`];
                          return (
                            <td key={p} className="border px-2 py-2 text-center">
                              {entry ? (
                                <div>
                                  <div className="font-semibold text-primary">{entry.subject?.name}</div>
                                  <div className="text-muted-foreground">{entry.class?.name} {entry.section?.name}</div>
                                  <div className="text-muted-foreground">{entry.startTime}–{entry.endTime}</div>
                                </div>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      )}

      {/* Attendance Entry Tab */}
      {tab === "attendance" && <AttendanceTab assignedClasses={classes} />}

      {/* Results Tab */}
      {tab === "results" && <TeacherResultsTab examSubjects={examSubs} assignedClasses={classes} />}

      {/* Payroll Tab */}
      {tab === "payroll" && (
        <Card>
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Wallet className="size-4 text-primary" /> Salary History</h3>
          {payroll.length === 0
            ? <EmptyState icon={Wallet} title="No payroll records" />
            : (
              <div className="divide-y">
                {payroll.map((p: any, i: number) => (
                  <div key={i} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][p.month - 1]} {p.year}</div>
                      <div className="text-xs text-muted-foreground">{p.staffName}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{p.netSalary?.toLocaleString()}</div>
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
        </Card>
      )}
    </div>
  );
}

/** Inline attendance entry — limited to teacher's assigned classes */
function AttendanceTab({ assignedClasses }: { assignedClasses: any[] }) {
  const { user } = useAuth();
  const schoolParams = attendanceSchoolParams(user);
  const today = useApiQuery<{ date: string }>("/attendance/school-today", schoolParams);
  const [classId, setClassId]   = useState("");
  const [sectionId, setSectionId] = useState("");
  const [date, setDate]         = useState("");
  const [dateTouched, setDateTouched] = useState(false);
  const sections = useApiQuery<any>(classId ? "/sections" : null, classId ? { classId } : undefined);
  const register = useApiQuery<any>(classId && date ? "/attendance/register" : null, {
    classId,
    sectionId: sectionId || undefined,
    date,
  });
  const [marks, setMarks]       = useState<Record<string, AttendanceMark>>({});
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    const next = schoolTodayDate(today.data);
    if (next && !dateTouched) setDate(next);
  }, [today.data, dateTouched]);

  const classList = assignedClasses.length > 0 ? assignedClasses : asList<any>([]);
  const sectionList = asList<any>(sections.data);
  const registerBody = asObj<any>(register.data);
  const registerReady = registerMatches(registerBody, classId, sectionId, date);
  const studentList = registerReady ? asList<any>(registerBody.students) : [];

  useEffect(() => {
    if (!registerReady) return;
    setMarks(marksFromStudents(studentList));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply the register that just loaded
  }, [register.data, registerReady]);

  const setMark = (studentId: string, status: AttendanceMark) =>
    setMarks((prev) => ({ ...prev, [studentId]: status }));

  const markAll = (status: AttendanceMark) => {
    const next: Record<string, AttendanceMark> = {};
    studentList.forEach((s) => { next[s.id] = status; });
    setMarks(next);
  };

  const counts = attendanceCounts(studentList.map((s: any) => s.id), marks);
  const blockReason = saveBlockReason({
    classId,
    date,
    studentCount: studentList.length,
    unmarked: counts.unmarked,
    studentsLoading: Boolean(classId && date && register.loading),
    attendanceLoading: Boolean(classId && date && (register.loading || register.isFetching)),
    attendanceError: register.error,
    classesError: null,
    sectionsLoading: Boolean(classId && sections.loading),
    sectionsError: classId ? sections.error : null,
    dateError: today.error,
  });

  const save = async () => {
    if (blockReason) return toast.error(blockReason);
    setSaving(true);
    try {
      const records = bulkRecords(studentList, marks);
      const body: Record<string, any> = { classId, date, records };
      if (sectionId) body.sectionId = sectionId;
      await api.post("/attendance/bulk", body);
      toast.success("Attendance saved");
      register.refetch();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <h3 className="font-semibold mb-4 flex items-center gap-2"><CalendarCheck className="size-4 text-primary" /> Mark Attendance</h3>
      <div className="flex gap-3 flex-wrap mb-4">
        <select value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); setMarks({}); }}
          className="h-10 px-3 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40">
          <option value="">Select class</option>
          {classList.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={sectionId} onChange={(e) => { setSectionId(e.target.value); setMarks({}); }}
          className="h-10 px-3 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          disabled={!classId || Boolean(sections.error)}>
          <option value="">All sections</option>
          {sectionList.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => { setDateTouched(true); setDate(e.target.value); setMarks({}); }}
          className="h-10 px-3 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
        <div className="flex gap-2 ml-auto">
          <button onClick={() => markAll("PRESENT")} className="px-3 h-9 rounded-lg border text-xs bg-green-50 text-green-700 hover:bg-green-100 transition flex items-center gap-1">
            <CheckCircle2 className="size-3" /> All Present
          </button>
          <button onClick={() => markAll("ABSENT")} className="px-3 h-9 rounded-lg border text-xs bg-red-50 text-destructive hover:bg-red-100 transition flex items-center gap-1">
            <XCircle className="size-3" /> All Absent
          </button>
        </div>
      </div>

      {blockReason && classId && <p className="text-sm text-muted-foreground mb-3">{blockReason}</p>}
      {classId && sections.error && <p className="text-sm text-destructive mb-3">{sections.error}</p>}
      {today.error && !date && <p className="text-sm text-destructive mb-3">{today.error}</p>}

      {!classId && <EmptyState icon={Users} title="Select a class" description="Choose a class to mark attendance." />}

      {classId && date && (register.loading || !registerReady) && !register.error && <Skeleton className="h-48" />}

      {classId && register.error && (
        <EmptyState icon={Users} title="Attendance could not be loaded" description={register.error} />
      )}

      {classId && registerReady && studentList.length === 0 && (
        <EmptyState icon={Users} title="No students" description="No active students found in this class." />
      )}

      {studentList.length > 0 && (
        <>
          <div className="divide-y max-h-[400px] overflow-y-auto">
            {studentList.map((s: any) => {
              const status = marks[s.id];
              return (
                <div key={s.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="font-medium text-sm">{s.fullName}</span>
                    <span className="text-muted-foreground text-xs ml-2">{s.admissionNo}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(["PRESENT", "ABSENT", "LATE", "LEAVE"] as const).map((st) => (
                      <button key={st} onClick={() => setMark(s.id, st)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${status === st
                          ? st === "PRESENT" ? "bg-green-500 text-white border-green-500"
                          : st === "ABSENT"  ? "bg-destructive text-white border-destructive"
                          : st === "LATE"    ? "bg-amber-500 text-white border-amber-500"
                          : "bg-blue-500 text-white border-blue-500"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={save} disabled={saving || Boolean(blockReason)}
              className="px-6 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50">
              {saving ? "Saving…" : "Save Attendance"}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

/** Mark entry for exam subjects assigned to the teacher's school */
function TeacherResultsTab({ examSubjects, assignedClasses }: { examSubjects: any[]; assignedClasses: any[] }) {
  const [selectedId, setSelectedId] = useState("");
  const selected = examSubjects.find((es) => es.id === selectedId) ?? examSubjects[0];
  const classId = selected?.exam?.classId ?? assignedClasses[0]?.id ?? "";
  const students = useApiQuery<any>(classId ? "/students" : null, classId ? { classId } : undefined);
  const existingMarks = useApiQuery<any>(
    selected?.examId ? `/exams/${selected.examId}/marks` : null,
    selected?.subjectId ? { subjectId: selected.subjectId } : undefined,
  );
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const studentList = asList<any>(students.data);
  const markList = asList<any>(existingMarks.data);

  useEffect(() => {
    if (examSubjects.length > 0 && !selectedId) setSelectedId(examSubjects[0].id);
  }, [examSubjects, selectedId]);

  useEffect(() => {
    const m: Record<string, string> = {};
    markList.forEach((mk: any) => { m[mk.studentId] = String(mk.obtainedMarks ?? ""); });
    setMarks(m);
  }, [markList, selectedId]);

  const save = async () => {
    if (!selected?.examId || !selected?.subjectId) return toast.error("Select an exam subject");
    const records = studentList
      .filter((s) => marks[s.id] !== undefined && marks[s.id] !== "")
      .map((s) => ({
        studentId: s.id,
        obtainedMarks: Number(marks[s.id]),
        remarks: "",
      }));
    if (records.length === 0) return toast.error("Enter marks for at least one student");
    setSaving(true);
    try {
      await api.post("/exams/marks/bulk", {
        examId: selected.examId,
        subjectId: selected.subjectId,
        records,
      });
      toast.success("Marks saved");
      existingMarks.refetch();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save marks");
    } finally {
      setSaving(false);
    }
  };

  if (examSubjects.length === 0) {
    return (
      <Card>
        <EmptyState icon={ClipboardList} title="No exam subjects found"
          description="Exam subjects will appear here once configured by the school admin." />
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <ClipboardList className="size-4 text-primary" /> Enter Exam Results
      </h3>

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={selected?.id ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
          className="h-10 px-3 rounded-lg border bg-card text-sm min-w-[240px]"
        >
          {examSubjects.map((es: any) => (
            <option key={es.id} value={es.id}>
              {es.exam?.name} — {es.subject?.name} (/{es.totalMarks})
            </option>
          ))}
        </select>
        {selected && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <StatusBadge status={selected.exam?.status ?? "DRAFT"} />
            <span>Pass: {selected.passingMarks} marks</span>
          </div>
        )}
      </div>

      {!classId ? (
        <EmptyState icon={Users} title="No class linked" description="This exam has no class assigned." />
      ) : students.loading ? (
        <Skeleton className="h-48" />
      ) : studentList.length === 0 ? (
        <EmptyState icon={Users} title="No students" description="No students found for this exam's class." />
      ) : (
        <>
          <div className="divide-y max-h-[420px] overflow-y-auto border rounded-xl">
            {studentList.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <span className="font-medium text-sm">{s.fullName}</span>
                  <span className="text-muted-foreground text-xs ml-2">{s.admissionNo}</span>
                </div>
                <input
                  type="number"
                  min={0}
                  max={selected?.totalMarks ?? 100}
                  value={marks[s.id] ?? ""}
                  onChange={(e) => setMarks((p) => ({ ...p, [s.id]: e.target.value }))}
                  placeholder="0"
                  className="w-20 h-9 px-2 rounded-lg border bg-card text-sm text-right"
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={save} disabled={saving}
              className="px-6 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50">
              {saving ? "Saving…" : "Save Marks"}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
