import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  User, CalendarCheck, Receipt, Megaphone, Clock, BookOpen,
  CheckCircle2, XCircle, AlertCircle, TrendingUp, Download, Printer,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/form";
import { pdfApi } from "@/lib/pdfUtils";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PageHeader, Skeleton, EmptyState, StatusBadge } from "@/components/ui-kit";
import { UpcomingEventsWidget } from "@/components/UpcomingEventsWidget";
import { useApiQuery, asList, asObj } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/parent")({
  head: () => ({ meta: [{ title: "Parent Portal — School ERP" }] }),
  component: () => <AppShell><ParentPortalGuard /></AppShell>,
});

function ParentPortalGuard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (user && user.role !== "PARENT") { navigate({ to: "/dashboard" }); }
  }, [user, navigate]);
  if (!user || user.role !== "PARENT") return null;
  return <ParentPortal />;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function ParentPortal() {
  const portal = useApiQuery<any>("/parents/my-portal");
  const d = asObj<any>(portal.data);

  const student = d.student;
  const attSummary = d.attendanceSummary ?? {};
  const attendance = asList<any>(d.attendance);
  const fees = asList<any>(d.fees);
  const notices = asList<any>(d.notices);
  const timetable = asList<any>(d.timetable);
  const results = asList<any>(d.results);

  // Build timetable grid
  const ttGrid: Record<string, any> = {};
  timetable.forEach((t: any) => { ttGrid[`${t.dayOfWeek}-${t.periodNo}`] = t; });
  const periods = [...new Set(timetable.map((t: any) => t.periodNo))].sort((a: any, b: any) => a - b);

  const attChartData = attendance.slice(0, 14).reverse().map((a: any) => ({
    date: a.date?.slice(5, 10),
    status: a.status,
    present: a.status === "PRESENT" ? 1 : 0,
    absent: a.status === "ABSENT" ? 1 : 0,
  }));

  if (portal.loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (portal.error || !student) {
    return (
      <EmptyState icon={User} title="No linked student"
        description="Your parent account is not yet linked to a student. Please contact school administration." />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={`Welcome, ${d.parent?.fullName || "Parent"}`}
        description={`Viewing details for ${student.fullName} · ${student.class?.name ?? "—"} ${student.section?.name ?? ""}`}
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => pdfApi.studentProfile(student.id, student.admissionNo).catch((e) => toast.error(e.message))}>
              <Download className="size-4" /> Profile PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => pdfApi.studentAttendance(student.id).catch((e) => toast.error(e.message))}>
              <Download className="size-4" /> Attendance PDF
            </Button>
          </div>
        }
      />

      {/* Student Info + Attendance Summary */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="flex items-center gap-3 col-span-full sm:col-span-2 lg:col-span-1">
          <div className="size-12 rounded-full bg-gradient-primary text-primary-foreground grid place-items-center font-bold text-xl shadow-glow">
            {student.fullName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold">{student.fullName}</div>
            <div className="text-xs text-muted-foreground">{student.admissionNo}</div>
            <StatusBadge status={student.status} />
          </div>
        </Card>
        {[
          { label: "Present", value: attSummary.present ?? 0, icon: CheckCircle2, color: "text-green-500" },
          { label: "Absent",  value: attSummary.absent  ?? 0, icon: XCircle,      color: "text-destructive" },
          { label: "Attend. Rate", value: `${attSummary.rate ?? 0}%`, icon: TrendingUp, color: "text-primary" },
        ].map((c) => (
          <Card key={c.label} hover>
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <c.icon className={`size-4 ${c.color}`} />
            </div>
            <div className="text-2xl font-bold mt-1">{c.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Last 30 days</div>
          </Card>
        ))}
      </div>

      <div className="mb-6">
        <UpcomingEventsWidget limit={5} title="Upcoming School Events" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Attendance trend */}
        <Card>
          <h3 className="font-semibold mb-3 flex items-center gap-2"><CalendarCheck className="size-4 text-primary" /> Attendance (Last 14 Days)</h3>
          {attChartData.length === 0
            ? <EmptyState icon={CalendarCheck} title="No records" />
            : (
              <div className="h-48">
                <ResponsiveContainer>
                  <BarChart data={attChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 250)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis hide />
                    <Tooltip />
                    <Bar dataKey="present" fill="oklch(0.65 0.16 155)" radius={[4,4,0,0]} name="Present" />
                    <Bar dataKey="absent"  fill="oklch(0.6 0.22 25)"  radius={[4,4,0,0]} name="Absent" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          <div className="mt-3 divide-y max-h-40 overflow-y-auto">
            {attendance.slice(0, 10).map((a: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-1.5 text-xs">
                <span className="text-muted-foreground">{a.date?.slice(0, 10)}</span>
                <span className={`font-medium ${a.status === "PRESENT" ? "text-green-600" : a.status === "ABSENT" ? "text-destructive" : "text-amber-500"}`}>
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Fee Status */}
        <Card>
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Receipt className="size-4 text-primary" /> Fee Invoices</h3>
          {fees.length === 0
            ? <EmptyState icon={Receipt} title="No invoices" />
            : (
              <div className="divide-y max-h-80 overflow-y-auto">
                {fees.map((inv: any, i: number) => {
                  const pending = Math.max(inv.totalAmount - inv.paidAmount, 0);
                  return (
                    <div key={i} className="py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {MONTHS[(inv.month ?? 1) - 1]} {inv.year}
                        </span>
                        <StatusBadge status={inv.status} />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>Total: <strong className="text-foreground">{inv.totalAmount?.toLocaleString()}</strong></span>
                        <span>Paid: <strong className="text-green-600">{inv.paidAmount?.toLocaleString()}</strong></span>
                        {pending > 0 && <span>Due: <strong className="text-destructive">{pending.toLocaleString()}</strong></span>}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => pdfApi.feeInvoice(inv.id).catch((e) => toast.error(e.message))}
                          className="text-xs text-primary hover:underline flex items-center gap-1">
                          <Download className="size-3" /> Invoice PDF
                        </button>
                        {inv.payments?.[0]?.id && (
                          <button onClick={() => pdfApi.feeReceipt(inv.payments[0].id, inv.payments[0].receiptNo).catch((e) => toast.error(e.message))}
                            className="text-xs text-primary hover:underline flex items-center gap-1">
                            <Receipt className="size-3" /> Receipt PDF
                          </button>
                        )}
                      </div>
                      {asList(inv.payments).slice(0, 2).map((p: any, pi: number) => (
                        <div key={pi} className="text-xs text-muted-foreground ml-2 mt-0.5">
                          ↳ Paid {p.amount?.toLocaleString()} on {p.paymentDate?.slice(0,10)} via {p.method}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Exam Results */}
        <Card>
          <h3 className="font-semibold mb-3 flex items-center gap-2"><BookOpen className="size-4 text-primary" /> Exam Results</h3>
          {results.length === 0
            ? <EmptyState icon={BookOpen} title="No results yet" />
            : (
              <div className="divide-y max-h-64 overflow-y-auto">
                {results.map((m: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <div className="font-medium">{m.exam?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{m.subject?.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-primary">{m.obtainedMarks ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{m.exam?.startDate?.slice(0,10)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </Card>

        {/* Notices & Announcements */}
        <Card>
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Megaphone className="size-4 text-primary" /> School Notices</h3>
          {notices.length === 0
            ? <EmptyState icon={Megaphone} title="No notices" />
            : (
              <ul className="divide-y max-h-64 overflow-y-auto">
                {notices.map((n: any, i: number) => (
                  <li key={n.id || i} className="py-3">
                    <div className="text-sm font-medium">{n.title ?? n.subject}</div>
                    {n.content && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.content}</div>}
                    <div className="text-xs text-muted-foreground mt-1">{n.createdAt?.slice(0,10)}</div>
                  </li>
                ))}
              </ul>
            )}
        </Card>
      </div>

      {/* Timetable */}
      {timetable.length > 0 && (
        <Card>
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Clock className="size-4 text-primary" /> Class Timetable</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  <th className="border px-2 py-1.5 text-left font-medium">Day</th>
                  {periods.map((p: any) => (
                    <th key={p} className="border px-2 py-1.5 font-medium text-center">Period {p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day, di) => (
                  <tr key={day} className="hover:bg-muted/30">
                    <td className="border px-2 py-1.5 font-medium">{day}</td>
                    {periods.map((p: any) => {
                      const entry = ttGrid[`${di + 1}-${p}`];
                      return (
                        <td key={p} className="border px-2 py-1.5 text-center">
                          {entry ? (
                            <div>
                              <div className="font-medium text-primary">{entry.subject?.name}</div>
                              <div className="text-muted-foreground">{entry.teacher?.fullName}</div>
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
        </Card>
      )}
    </div>
  );
}
