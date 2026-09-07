import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  User, CalendarCheck, Receipt, Megaphone, Clock,
  CheckCircle2, XCircle, TrendingUp, BookOpen, FileText,
  Download, Printer,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/form";
import { pdfApi } from "@/lib/pdfUtils";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PageHeader, Skeleton, EmptyState, StatusBadge } from "@/components/ui-kit";
import { UpcomingEventsWidget } from "@/components/UpcomingEventsWidget";
import { useApiQuery, asList, asObj } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { resolveFileUrl } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/student")({
  head: () => ({ meta: [{ title: "Student Portal — School ERP" }] }),
  component: () => <AppShell><StudentPortalGuard /></AppShell>,
});

function StudentPortalGuard() {
  const { user } = useAuth();
  useEffect(() => {
    if (user && user.role !== "STUDENT") { window.location.href = "/dashboard"; }
  }, [user]);
  if (!user || user.role !== "STUDENT") return null;
  return <StudentPortal />;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type Tab = "overview" | "attendance" | "fees" | "timetable" | "results" | "notices" | "documents";

function StudentPortal() {
  const [tab, setTab] = useState<Tab>("overview");
  const portal = useApiQuery<any>("/students/my-portal");
  const d = asObj<any>(portal.data);

  const student = d.student;
  const attSummary = d.attendanceSummary ?? {};
  const attendance = asList<any>(d.attendance);
  const fees = asList<any>(d.fees);
  const notices = asList<any>(d.notices);
  const timetable = asList<any>(d.timetable);
  const marks = asList<any>(d.marks);
  const documents = asList<any>(d.documents);

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "overview",   label: "Overview",   icon: TrendingUp },
    { id: "attendance", label: "Attendance", icon: CalendarCheck },
    { id: "fees",       label: "Fees",       icon: Receipt },
    { id: "timetable",  label: "Timetable",  icon: Clock },
    { id: "results",    label: "Results",    icon: BookOpen },
    { id: "notices",    label: "Notices",    icon: Megaphone },
    { id: "documents",  label: "Documents",  icon: FileText },
  ];

  if (portal.loading) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-6">
      {/* Student Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border-2 border-primary/20">
          {student?.photoUrl
            ? <img src={student.photoUrl} alt={student?.fullName} className="w-full h-full object-cover" />
            : <User className="w-8 h-8 text-primary" />}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{student?.fullName ?? "Student"}</h1>
          <p className="text-sm text-muted-foreground">
            {student?.admissionNo} · {student?.class} {student?.section ? `- ${student.section}` : ""}
          </p>
        </div>
        {student?.id && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => pdfApi.studentProfile(student.id, student.admissionNo).catch((e) => toast.error(e.message))}>
              <Download className="size-4" /> Profile PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => pdfApi.studentAttendance(student.id).catch((e) => toast.error(e.message))}>
              <Download className="size-4" /> Attendance PDF
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap border-b border-border pb-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "overview" && <OverviewTab attSummary={attSummary} fees={fees} marks={marks} student={student} />}
      {tab === "attendance" && <AttendanceTab attendance={attendance} attSummary={attSummary} />}
      {tab === "fees" && <FeesTab fees={fees} student={student} />}
      {tab === "timetable" && <TimetableTab timetable={timetable} />}
      {tab === "results" && <ResultsTab marks={marks} />}
      {tab === "notices" && <NoticesTab notices={notices} />}
      {tab === "documents" && <DocumentsTab documents={documents} />}
    </div>
  );
}

function OverviewTab({ attSummary, fees, marks, student }: any) {
  const unpaidFees = fees.filter((f: any) => f.status !== "PAID");
  const recentMarks = marks.slice(0, 5);

  return (
    <div className="space-y-6">
      <UpcomingEventsWidget limit={5} title="Upcoming Academic Events" />
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Attendance</p>
          <p className="text-2xl font-bold text-green-500">{attSummary.percentage ?? 0}%</p>
          <p className="text-xs text-muted-foreground">{attSummary.present ?? 0}/{attSummary.total ?? 0} days</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Fee Status</p>
          <p className="text-2xl font-bold text-primary">{fees.length}</p>
          <p className="text-xs text-muted-foreground">{unpaidFees.length} unpaid</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Exam Results</p>
          <p className="text-2xl font-bold text-blue-500">{marks.length}</p>
          <p className="text-xs text-muted-foreground">marks recorded</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Class</p>
          <p className="text-2xl font-bold text-purple-500">{student?.class ?? "—"}</p>
          <p className="text-xs text-muted-foreground">Section: {student?.section ?? "—"}</p>
        </Card>
      </div>

      {/* Recent Results */}
      {recentMarks.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Recent Exam Results</h3>
          <div className="space-y-2">
            {recentMarks.map((m: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-2 bg-muted/40 rounded-lg">
                <div>
                  <p className="text-sm font-medium">{m.exam?.name}</p>
                  <p className="text-xs text-muted-foreground">{m.subject?.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{m.obtainedMarks}/{m.totalMarks}</p>
                  <StatusBadge status={m.grade ?? "—"} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Unpaid Fees */}
      {unpaidFees.length > 0 && (
        <Card className="p-4 border-l-4 border-l-orange-400">
          <h3 className="font-semibold text-orange-600 mb-2">Pending Fees ({unpaidFees.length})</h3>
          {unpaidFees.map((f: any) => (
            <div key={f.id} className="flex justify-between text-sm py-1 border-b border-border last:border-0">
              <span>{MONTHS[(f.month ?? 1) - 1]} {f.year}</span>
              <span className="font-medium">PKR {(f.totalAmount - f.paidAmount).toLocaleString()}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function AttendanceTab({ attendance, attSummary }: any) {
  const last30 = attendance.slice(0, 30).reverse();
  const chartData = MONTHS.map((m, i) => ({
    month: m,
    present: attendance.filter((a: any) => new Date(a.date).getMonth() === i && a.status === "PRESENT").length,
    absent: attendance.filter((a: any) => new Date(a.date).getMonth() === i && a.status !== "PRESENT").length,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Days", val: attSummary.total ?? 0, color: "text-foreground" },
          { label: "Present", val: attSummary.present ?? 0, color: "text-green-500" },
          { label: "Absent", val: attSummary.absent ?? 0, color: "text-red-500" },
        ].map(s => (
          <Card key={s.label} className="p-4 text-center">
            <p className={`text-3xl font-bold ${s.color}`}>{s.val}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h3 className="font-semibold mb-3">Monthly Attendance</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="present" fill="#22c55e" radius={[4,4,0,0]} />
            <Bar dataKey="absent"  fill="#ef4444" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold mb-3">Recent Attendance (last 30 days)</h3>
        <div className="grid grid-cols-6 sm:grid-cols-10 gap-2">
          {last30.map((a: any, i: number) => (
            <div key={i} title={`${new Date(a.date).toLocaleDateString()} — ${a.status}`}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                a.status === "PRESENT" ? "bg-green-100 text-green-700" :
                a.status === "LATE"    ? "bg-yellow-100 text-yellow-700" :
                "bg-red-100 text-red-700"
              }`}>
              {a.status === "PRESENT" ? "P" : a.status === "LATE" ? "L" : "A"}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function FeesTab({ fees, student }: any) {
  if (!fees.length) return <EmptyState title="No fee records found" />;

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {["Invoice No","Month","Amount","Paid","Balance","Status","Action"].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fees.map((f: any) => (
              <tr key={f.id} className="border-b border-border hover:bg-muted/30">
                <td className="px-4 py-2">{f.invoiceNo}</td>
                <td className="px-4 py-2">{MONTHS[(f.month ?? 1) - 1]} {f.year}</td>
                <td className="px-4 py-2">PKR {f.amount?.toLocaleString()}</td>
                <td className="px-4 py-2">PKR {f.paidAmount?.toLocaleString()}</td>
                <td className="px-4 py-2">PKR {(f.totalAmount - f.paidAmount)?.toLocaleString()}</td>
                <td className="px-4 py-2"><StatusBadge status={f.status} /></td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    <button onClick={() => pdfApi.feeInvoice(f.id).catch((e) => toast.error(e.message))}
                      className="flex items-center gap-1 text-xs text-primary hover:underline">
                      <Download className="w-3 h-3" /> PDF
                    </button>
                    <button onClick={() => pdfApi.printFeeInvoice(f.id).catch((e) => toast.error(e.message))}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                      <Printer className="w-3 h-3" /> Print
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TimetableTab({ timetable }: any) {
  const byDay: Record<number, any[]> = {};
  timetable.forEach((e: any) => {
    if (!byDay[e.dayOfWeek]) byDay[e.dayOfWeek] = [];
    byDay[e.dayOfWeek].push(e);
  });

  return (
    <div className="space-y-4">
      {Object.keys(byDay).length === 0
        ? <EmptyState title="No timetable entries" />
        : Object.entries(byDay).map(([day, periods]) => (
          <Card key={day} className="p-4">
            <h3 className="font-semibold mb-2">{DAYS[(Number(day) - 1) % DAYS.length]}</h3>
            <div className="space-y-2">
              {periods.sort((a, b) => a.periodNo - b.periodNo).map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm bg-muted/40 rounded-lg p-2">
                  <span className="font-medium">{p.subject?.name}</span>
                  <span className="text-muted-foreground">{p.teacher?.fullName}</span>
                  <span className="text-muted-foreground text-xs">{p.startTime} – {p.endTime}</span>
                </div>
              ))}
            </div>
          </Card>
        ))
      }
    </div>
  );
}

function ResultsTab({ marks }: any) {
  if (!marks.length) return <EmptyState title="No exam results yet" />;
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {["Exam","Subject","Marks Obtained","Total","Grade","Status"].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {marks.map((m: any) => (
              <tr key={m.id} className="border-b border-border hover:bg-muted/30">
                <td className="px-4 py-2">{m.exam?.name}</td>
                <td className="px-4 py-2">{m.subject?.name}</td>
                <td className="px-4 py-2">{m.obtainedMarks}</td>
                <td className="px-4 py-2">{m.totalMarks}</td>
                <td className="px-4 py-2">{m.grade ?? "—"}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs font-medium ${m.status === "PASS" ? "text-green-600" : m.status === "FAIL" ? "text-red-600" : "text-muted-foreground"}`}>
                    {m.status ?? "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function NoticesTab({ notices }: any) {
  if (!notices.length) return <EmptyState title="No announcements" />;
  return (
    <div className="space-y-3">
      {notices.map((n: any) => (
        <Card key={n.id} className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={n.type} />
            <span className="text-xs text-muted-foreground">{new Date(n.startDate ?? n.createdAt).toLocaleDateString()}</span>
          </div>
          <h3 className="font-semibold">{n.title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{n.content}</p>
        </Card>
      ))}
    </div>
  );
}

function DocumentsTab({ documents }: any) {
  if (!documents.length) return <EmptyState title="No documents uploaded" />;
  const typeLabels: Record<string, string> = {
    BIRTH_CERTIFICATE: "Birth Certificate",
    B_FORM: "B-Form",
    ID_CARD: "ID Card",
    TRANSFER_CERTIFICATE: "Transfer Certificate",
    PHOTO: "Photo",
    OTHER: "Other",
  };
  return (
    <div className="space-y-3">
      {documents.map((doc: any) => (
        <Card key={doc.id} className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-medium">{doc.fileName}</p>
              <p className="text-xs text-muted-foreground">{typeLabels[doc.type] ?? doc.type}</p>
            </div>
          </div>
          <a href={resolveFileUrl(doc.fileUrl)} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline">
            <Download className="w-3 h-3" /> Download
          </a>
        </Card>
      ))}
    </div>
  );
}
