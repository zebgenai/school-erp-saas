import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Printer, Download, BarChart3, Users, CalendarCheck, Receipt,
  Wallet, TrendingDown, TrendingUp, ClipboardList, BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PageHeader, Skeleton, EmptyState, StatusBadge, ErrorState } from "@/components/ui-kit";
import { Button, Select } from "@/components/form";
import { useApiQuery, asList, asObj } from "@/lib/hooks";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { pdfApi } from "@/lib/pdfUtils";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — School ERP" }] }),
  component: () => <AppShell><Reports /></AppShell>,
});

const COLORS = [
  "oklch(0.55 0.18 258)", "oklch(0.65 0.16 155)",
  "oklch(0.78 0.15 75)",  "oklch(0.65 0.14 230)", "oklch(0.6 0.22 25)",
];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type ReportTab = "overview" | "attendance" | "fees" | "expenses" | "salary" | "pl" | "students" | "results";

function exportCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const lines = [
    headers.join(","),
    ...rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${filename}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function Reports() {
  const { user } = useAuth();
  const { role, can } = usePermissions();
  const showAttChart = can("attendance.view");
  const showTeacherCharts = role === "TEACHER" || role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN";
  const showRecentAdmissions = role !== "ACCOUNTANT";
  const [tab, setTab] = useState<ReportTab>("overview");
  const [month, setMonth]       = useState(() => new Date().toISOString().slice(0, 7));
  const [year, setYear]         = useState(() => String(new Date().getFullYear()));
  const [startDate, setStart]   = useState("");
  const [endDate, setEnd]       = useState("");
  const [classId, setClassId]   = useState("");

  const mo = parseInt(month.split("-")[1], 10);
  const yr = parseInt(month.split("-")[0], 10);

  const classes = useApiQuery<any>("/classes");
  const classList = asList<any>(classes.data);

  const params = { month: mo, year: yr, classId: classId || undefined };
  const rangeParams = { startDate: startDate || undefined, endDate: endDate || undefined, classId: classId || undefined };

  const summary       = useApiQuery<any>("/reports/dashboard-summary", { month: mo, year: yr });
  const feeChart      = useApiQuery<any>(can("fees.view") ? "/reports/monthly-fee-chart" : null, { year: yr });
  const attChart      = useApiQuery<any>(showAttChart ? "/reports/attendance-chart" : null, { month });
  const byClass       = useApiQuery<any>(showTeacherCharts ? "/reports/student-count-by-class" : null);
  const exams         = useApiQuery<any>(showTeacherCharts ? "/reports/upcoming-exams" : null);
  const defaulters    = useApiQuery<any>(can("fees.view") ? "/reports/fee-defaulters" : null, params);
  const recent        = useApiQuery<any>(showRecentAdmissions ? "/reports/recent-admissions" : null);

  const attReport     = useApiQuery<any>(tab === "attendance" && showTeacherCharts ? "/reports/attendance"  : null, { ...rangeParams, month: mo, year: yr });
  const feeReport     = useApiQuery<any>(tab === "fees"       ? "/reports/fees"        : null, params);
  const expReport     = useApiQuery<any>(tab === "expenses"   ? "/reports/expenses"    : null, { ...rangeParams, month: mo, year: yr });
  const salReport     = useApiQuery<any>(tab === "salary"     ? "/reports/salary"      : null, params);
  const plReport      = useApiQuery<any>(tab === "pl"         ? "/reports/profit-loss" : null, { year: parseInt(year, 10) });
  const studReport    = useApiQuery<any>(tab === "students"   ? "/reports/students"    : null, params);
  const resultReport  = useApiQuery<any>(tab === "results"    ? "/reports/exam-results": null, { classId: classId || undefined });

  const s = asObj<any>(summary.data);
  const feeData  = asList<any>(feeChart.data).map((r) => ({ label: MONTHS[r.month - 1], collected: r.totalPaid, pending: r.totalPending }));
  const attData  = asList<any>(attChart.data).map((r) => ({ label: r.date?.slice(5, 10), present: r.present, absent: r.absent }));
  const classData = asList<any>(byClass.data).map((r) => ({ name: r.class?.name || r.name || "?", value: Number(r.count ?? 0) }));

  type TabDef = { id: ReportTab; label: string; icon: any; show?: boolean };
  const ALL_TABS: TabDef[] = [
    { id: "overview",   label: "Overview",   icon: BarChart3, show: true },
    { id: "attendance", label: "Attendance", icon: CalendarCheck, show: showTeacherCharts },
    { id: "students",   label: "Students",   icon: Users, show: showTeacherCharts || role === "ACCOUNTANT" },
    { id: "fees",       label: "Fees",       icon: Receipt, show: can("fees.view") },
    { id: "expenses",   label: "Expenses",   icon: TrendingDown, show: can("expenses.view") },
    { id: "salary",     label: "Salary",     icon: Wallet, show: can("payroll.view") },
    { id: "pl",         label: "P & L",      icon: TrendingUp, show: can("fees.manage") },
    { id: "results",    label: "Exam Results", icon: ClipboardList, show: showTeacherCharts || role === "ACCOUNTANT" },
  ];
  const TABS = ALL_TABS.filter((t) => t.show !== false);

  return (
    <div>
      <PageHeader title="Reports" description="Comprehensive analytics and exports."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="h-10 px-3 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
            <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> Print</Button>
          </div>
        }
      />

      {/* Tab bar */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-xl overflow-x-auto mb-6">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${tab === t.id ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Students", v: s.totalStudents ?? "—" },
              { label: "Fee Collected", v: s.finance?.feeCollected ? `PKR ${Number(s.finance.feeCollected).toLocaleString()}` : "—" },
              { label: "Pending Fees",  v: s.finance?.feePending   ? `PKR ${Number(s.finance.feePending).toLocaleString()}`   : "—" },
              { label: "Attendance Rate", v: s.todayAttendance?.present != null
                  ? `${Math.round((s.todayAttendance.present / Math.max(s.activeStudents ?? 1, 1)) * 100)}%`
                  : "—" },
            ].map((c) => (
              <Card key={c.label} hover>
                <div className="text-xs text-muted-foreground">{c.label}</div>
                <div className="text-2xl font-bold mt-1">{summary.loading ? <Skeleton className="h-7 w-16" /> : c.v}</div>
              </Card>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <h3 className="font-semibold mb-3">Monthly Fee Collection</h3>
              <div className="h-64">
                {feeChart.loading ? <Skeleton className="h-full" /> : feeData.length === 0 ? <EmptyState icon={BarChart3} title="No data" /> : (
                  <ResponsiveContainer>
                    <AreaChart data={feeData}>
                      <defs>
                        <linearGradient id="fc" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={COLORS[0]} stopOpacity={0.4} />
                          <stop offset="100%" stopColor={COLORS[0]} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 250)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Area type="monotone" dataKey="collected" stroke={COLORS[0]} strokeWidth={2} fill="url(#fc)" name="Collected" />
                      <Area type="monotone" dataKey="pending"   stroke={COLORS[4]} strokeWidth={2} fill="none" name="Pending" strokeDasharray="4 2" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card>
              <h3 className="font-semibold mb-3">Attendance Trend</h3>
              <div className="h-64">
                {attChart.loading ? <Skeleton className="h-full" /> : attData.length === 0 ? <EmptyState icon={BarChart3} title="No data" /> : (
                  <ResponsiveContainer>
                    <BarChart data={attData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 250)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="present" fill={COLORS[1]} radius={[4,4,0,0]} name="Present" />
                      <Bar dataKey="absent"  fill={COLORS[4]} radius={[4,4,0,0]} name="Absent" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card>
              <h3 className="font-semibold mb-3">Students by Class</h3>
              <div className="h-64">
                {byClass.loading ? <Skeleton className="h-full" /> : classData.length === 0 ? <EmptyState icon={BarChart3} title="No data" /> : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={classData} dataKey="value" nameKey="name" outerRadius={90} innerRadius={45}>
                        {classData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Legend /><Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <h3 className="font-semibold">Fee Defaulters</h3>
                <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => {
                  pdfApi.feeDefaulters({ month: mo, year: yr, classId: classId || undefined }).catch((e) => toast.error(e.message));
                }}><Download className="size-3" /> PDF</Button>
                <Button size="sm" variant="outline" onClick={() => {
                  pdfApi.printFeeDefaulters({ month: mo, year: yr, classId: classId || undefined }).catch((e) => toast.error(e.message));
                }}><Printer className="size-3" /> Print</Button>
                <Button size="sm" variant="outline" onClick={() => {
                  exportCSV("fee-defaulters",
                    ["Student", "Class", "Section", "Total", "Paid", "Pending", "Status"],
                    asList<any>(defaulters.data).map((r) => [r.studentName, r.className, r.sectionName, r.totalAmount, r.paidAmount, r.pendingAmount, r.status])
                  );
                }}><Download className="size-3" /> CSV</Button>
                </div>
              </div>
              {defaulters.loading ? <Skeleton className="h-32" /> : asList(defaulters.data).length === 0
                ? <EmptyState icon={BarChart3} title="No defaulters" />
                : (
                  <ul className="divide-y text-sm max-h-48 overflow-y-auto">
                    {asList<any>(defaulters.data).slice(0, 8).map((r, i) => (
                      <li key={i} className="py-2 flex justify-between">
                        <div>
                          <span className="font-medium">{r.studentName}</span>
                          <span className="text-muted-foreground text-xs ml-2">{r.className}</span>
                        </div>
                        <span className="text-destructive font-semibold">{r.pendingAmount?.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
            </Card>
          </div>
        </div>
      )}

      {/* ── Attendance Report ── */}
      {tab === "attendance" && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="text-xs font-medium block mb-1">Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStart(e.target.value)}
                className="h-10 px-3 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEnd(e.target.value)}
                className="h-10 px-3 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Class</label>
              <select value={classId} onChange={(e) => setClassId(e.target.value)}
                className="h-10 px-3 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40">
                <option value="">All classes</option>
                {classList.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Button variant="outline" onClick={() => {
              const rows = asList<any>(asObj<any>(attReport.data).byStudent);
              exportCSV("attendance-report",
                ["Student", "Class", "Section", "Present", "Absent", "Leave", "Late", "Total Days"],
                rows.map((r) => [r.student?.fullName, r.student?.class?.name, r.student?.section?.name, r.present, r.absent, r.leave, r.late, r.totalDays])
              );
            }}><Download className="size-4" /> Export CSV</Button>
          </div>

          {attReport.loading ? <Skeleton className="h-64" /> : (
            <AttendanceReportTable data={attReport.data} />
          )}
        </div>
      )}

      {/* ── Fee Report ── */}
      {tab === "fees" && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="text-xs font-medium block mb-1">Month</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
                className="h-10 px-3 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Class</label>
              <select value={classId} onChange={(e) => setClassId(e.target.value)}
                className="h-10 px-3 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40">
                <option value="">All classes</option>
                {classList.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Button variant="outline" onClick={() => {
              const invoices = asList<any>(asObj<any>(feeReport.data).invoices);
              exportCSV("fee-report",
                ["Student", "Class", "Section", "Total", "Paid", "Pending", "Status"],
                invoices.map((i: any) => [i.student?.fullName, i.student?.class?.name, i.student?.section?.name, i.totalAmount, i.paidAmount, i.totalAmount - i.paidAmount, i.status])
              );
            }}><Download className="size-4" /> Export CSV</Button>
          </div>
          {feeReport.loading ? <Skeleton className="h-64" /> : <FeeReportTable data={feeReport.data} />}
        </div>
      )}

      {/* ── Expense Report ── */}
      {tab === "expenses" && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="text-xs font-medium block mb-1">Month</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
                className="h-10 px-3 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
            </div>
            <Button variant="outline" onClick={() => {
              pdfApi.expenseReport({ month: mo, year: yr }).catch((e) => toast.error(e.message));
            }}><Download className="size-4" /> Download PDF</Button>
            <Button variant="outline" onClick={() => {
              pdfApi.printExpenseReport({ month: mo, year: yr }).catch((e) => toast.error(e.message));
            }}><Printer className="size-4" /> Print PDF</Button>
            <Button variant="outline" onClick={() => {
              const expenses = asList<any>(asObj<any>(expReport.data).expenses);
              exportCSV("expense-report",
                ["Description", "Category", "Amount", "Date"],
                expenses.map((e: any) => [e.description, e.category?.name, e.amount, e.date?.slice(0,10)])
              );
            }}><Download className="size-4" /> Export CSV</Button>
          </div>
          {expReport.loading ? <Skeleton className="h-64" /> : <ExpenseReportTable data={expReport.data} />}
        </div>
      )}

      {/* ── Salary Report ── */}
      {tab === "salary" && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="text-xs font-medium block mb-1">Month</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
                className="h-10 px-3 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
            </div>
            <Button variant="outline" onClick={() => {
              const payrolls = asList<any>(asObj<any>(salReport.data).payrolls);
              exportCSV("salary-report",
                ["Name", "Type", "Gross Salary", "Net Salary", "Status", "Month", "Year"],
                payrolls.map((p: any) => [p.staffName, p.staffType, p.grossSalary, p.netSalary, p.status, p.month, p.year])
              );
            }}><Download className="size-4" /> Export CSV</Button>
          </div>
          {salReport.loading ? <Skeleton className="h-64" /> : <SalaryReportTable data={salReport.data} />}
        </div>
      )}

      {/* ── Profit & Loss ── */}
      {tab === "pl" && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="text-xs font-medium block mb-1">Year</label>
              <select value={year} onChange={(e) => setYear(e.target.value)}
                className="h-10 px-3 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40">
                {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <Button variant="outline" onClick={() => {
              pdfApi.financialReport({ year: parseInt(year, 10) }).catch((e) => toast.error(e.message));
            }}><Download className="size-4" /> Download PDF</Button>
            <Button variant="outline" onClick={() => {
              pdfApi.printFinancialReport({ year: parseInt(year, 10) }).catch((e) => toast.error(e.message));
            }}><Printer className="size-4" /> Print PDF</Button>
            <Button variant="outline" onClick={() => {
              const months = asList<any>(asObj<any>(plReport.data).months);
              exportCSV("profit-loss",
                ["Month", "Revenue", "Salary Expenses", "Other Expenses", "Total Expenses", "Net Profit"],
                months.map((m: any) => [MONTHS[m.month - 1], m.revenue, m.salary, m.expenses, m.totalExpenses, m.profit])
              );
            }}><Download className="size-4" /> Export CSV</Button>
          </div>
          {plReport.loading ? <Skeleton className="h-64" /> : <PLReportTable data={plReport.data} />}
        </div>
      )}

      {/* ── Student Report ── */}
      {tab === "students" && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="text-xs font-medium block mb-1">Month</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
                className="h-10 px-3 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Class</label>
              <select value={classId} onChange={(e) => setClassId(e.target.value)}
                className="h-10 px-3 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40">
                <option value="">All classes</option>
                {classList.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Button variant="outline" onClick={() => {
              const students = asList<any>(asObj<any>(studReport.data).students);
              exportCSV("student-report",
                ["Name", "Admission No", "Class", "Section", "Status", "Present", "Absent", "Late", "Fee Status"],
                students.map((s: any) => [s.fullName, s.admissionNo, s.class, s.section, s.status, s.attendance?.present, s.attendance?.absent, s.attendance?.late, s.fee?.status ?? "—"])
              );
            }}><Download className="size-4" /> Export CSV</Button>
          </div>
          {studReport.loading ? <Skeleton className="h-64" /> : <StudentReportTable data={studReport.data} />}
        </div>
      )}

      {/* ── Exam Results ── */}
      {tab === "results" && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="text-xs font-medium block mb-1">Class</label>
              <select value={classId} onChange={(e) => setClassId(e.target.value)}
                className="h-10 px-3 rounded-lg border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40">
                <option value="">All classes</option>
                {classList.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          {resultReport.loading ? <Skeleton className="h-64" /> : <ExamResultsTable data={resultReport.data} />}
        </div>
      )}
    </div>
  );
}

// ── Sub-tables ──────────────────────────────────────────────────────────────

function AttendanceReportTable({ data }: { data: any }) {
  const d = asObj<any>(data);
  const byStudent = asList<any>(d.byStudent);
  if (!byStudent.length) return <EmptyState icon={CalendarCheck} title="No attendance data for this period" />;
  return (
    <Card>
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <h3 className="font-semibold">Attendance Report ({d.startDate} → {d.endDate})</h3>
        <div className="flex gap-4 text-sm items-center flex-wrap">
          <span>Present: <strong>{d.summary?.present}</strong></span>
          <span>Absent: <strong>{d.summary?.absent}</strong></span>
          <span>Rate: <strong>{d.summary?.attendanceRate}%</strong></span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead><tr className="bg-muted/50 text-xs">
            {["Student", "Class", "Section", "Present", "Absent", "Late", "Leave", "Total Days", "PDF"].map((h) => (
              <th key={h} className="border px-3 py-2 text-left font-medium">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {byStudent.map((r: any, i: number) => (
              <tr key={i} className="hover:bg-muted/30">
                <td className="border px-3 py-2 font-medium">{r.student?.fullName}</td>
                <td className="border px-3 py-2 text-muted-foreground">{r.student?.class?.name}</td>
                <td className="border px-3 py-2 text-muted-foreground">{r.student?.section?.name}</td>
                <td className="border px-3 py-2 text-green-600 font-medium">{r.present}</td>
                <td className="border px-3 py-2 text-destructive font-medium">{r.absent}</td>
                <td className="border px-3 py-2 text-amber-500">{r.late}</td>
                <td className="border px-3 py-2 text-blue-500">{r.leave}</td>
                <td className="border px-3 py-2 font-medium">{r.totalDays}</td>
                <td className="border px-3 py-2">
                  {r.student?.id && (
                    <div className="flex gap-1">
                      <button title="Download PDF" onClick={() => pdfApi.studentAttendance(r.student.id, { startDate: d.startDate, endDate: d.endDate }, r.student.admissionNo).catch((e) => toast.error(e.message))}
                        className="p-1 rounded hover:bg-muted"><Download className="size-3.5" /></button>
                      <button title="Print PDF" onClick={() => pdfApi.printStudentAttendance(r.student.id, { startDate: d.startDate, endDate: d.endDate }).catch((e) => toast.error(e.message))}
                        className="p-1 rounded hover:bg-muted"><Printer className="size-3.5" /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function FeeReportTable({ data }: { data: any }) {
  const d = asObj<any>(data);
  const invoices = asList<any>(d.invoices);
  if (!invoices.length) return <EmptyState icon={Receipt} title="No fee data for this period" />;
  return (
    <Card>
      <div className="flex flex-wrap gap-4 mb-4 text-sm">
        <span>Total: <strong>{d.summary?.totalAmount?.toLocaleString()}</strong></span>
        <span className="text-green-600">Paid: <strong>{d.summary?.totalPaid?.toLocaleString()}</strong></span>
        <span className="text-destructive">Pending: <strong>{d.summary?.totalPending?.toLocaleString()}</strong></span>
        <span>Invoices: <strong>{d.summary?.totalInvoices}</strong></span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead><tr className="bg-muted/50 text-xs">
            {["Student", "Class", "Section", "Invoice No", "Total", "Paid", "Pending", "Status"].map((h) => (
              <th key={h} className="border px-3 py-2 text-left font-medium">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {invoices.map((inv: any, i: number) => (
              <tr key={i} className="hover:bg-muted/30">
                <td className="border px-3 py-2 font-medium">{inv.student?.fullName}</td>
                <td className="border px-3 py-2 text-muted-foreground">{inv.student?.class?.name}</td>
                <td className="border px-3 py-2 text-muted-foreground">{inv.student?.section?.name}</td>
                <td className="border px-3 py-2 text-muted-foreground">{inv.invoiceNo}</td>
                <td className="border px-3 py-2">{inv.totalAmount?.toLocaleString()}</td>
                <td className="border px-3 py-2 text-green-600">{inv.paidAmount?.toLocaleString()}</td>
                <td className="border px-3 py-2 text-destructive">{Math.max(inv.totalAmount - inv.paidAmount, 0).toLocaleString()}</td>
                <td className="border px-3 py-2"><StatusBadge status={inv.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ExpenseReportTable({ data }: { data: any }) {
  const d = asObj<any>(data);
  const expenses = asList<any>(d.expenses);
  const byCategory = asList<any>(d.byCategory);
  if (!expenses.length) return <EmptyState icon={TrendingDown} title="No expenses for this period" />;
  return (
    <div className="space-y-4">
      {byCategory.length > 0 && (
        <div className="grid sm:grid-cols-3 gap-3">
          {byCategory.map((c: any, i: number) => (
            <Card key={i} hover>
              <div className="text-xs text-muted-foreground">{c.categoryName}</div>
              <div className="text-xl font-bold mt-1">{c.total?.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">{c.count} entries</div>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-muted/50 text-xs">
              {["Description", "Category", "Amount", "Date"].map((h) => (
                <th key={h} className="border px-3 py-2 text-left font-medium">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {expenses.map((e: any, i: number) => (
                <tr key={i} className="hover:bg-muted/30">
                  <td className="border px-3 py-2 font-medium">{e.description}</td>
                  <td className="border px-3 py-2 text-muted-foreground">{e.category?.name}</td>
                  <td className="border px-3 py-2 font-semibold">{e.amount?.toLocaleString()}</td>
                  <td className="border px-3 py-2 text-muted-foreground">{e.date?.slice(0,10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function SalaryReportTable({ data }: { data: any }) {
  const d = asObj<any>(data);
  const payrolls = asList<any>(d.payrolls);
  if (!payrolls.length) return <EmptyState icon={Wallet} title="No salary data for this period" />;
  return (
    <Card>
      <div className="flex flex-wrap gap-4 mb-4 text-sm">
        <span>Total Net: <strong>{d.summary?.totalNetSalary?.toLocaleString()}</strong></span>
        <span className="text-green-600">Paid: <strong>{d.summary?.totalPaid?.toLocaleString()}</strong></span>
        <span className="text-amber-500">Pending: <strong>{d.summary?.totalPending?.toLocaleString()}</strong></span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead><tr className="bg-muted/50 text-xs">
            {["Name", "Type", "Gross", "Deductions", "Net Salary", "Status"].map((h) => (
              <th key={h} className="border px-3 py-2 text-left font-medium">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {payrolls.map((p: any, i: number) => (
              <tr key={i} className="hover:bg-muted/30">
                <td className="border px-3 py-2 font-medium">{p.staffName}</td>
                <td className="border px-3 py-2 text-muted-foreground">{p.staffType}</td>
                <td className="border px-3 py-2">{p.grossSalary?.toLocaleString()}</td>
                <td className="border px-3 py-2 text-destructive">{p.deductions?.toLocaleString() ?? 0}</td>
                <td className="border px-3 py-2 font-bold">{p.netSalary?.toLocaleString()}</td>
                <td className="border px-3 py-2"><StatusBadge status={p.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PLReportTable({ data }: { data: any }) {
  const d = asObj<any>(data);
  const months = asList<any>(d.months);
  const totals = d.totals ?? {};
  if (!months.length) return <EmptyState icon={TrendingUp} title="No P&L data for this year" />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total Revenue",    v: totals.revenue,       color: "text-green-600" },
          { label: "Salary Expenses",  v: totals.salary,        color: "text-destructive" },
          { label: "Other Expenses",   v: totals.expenses,      color: "text-amber-500" },
          { label: "Total Expenses",   v: totals.totalExpenses, color: "text-destructive" },
          { label: "Net Profit",       v: totals.profit,        color: totals.profit >= 0 ? "text-green-600" : "text-destructive" },
        ].map((c) => (
          <Card key={c.label} hover>
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className={`text-xl font-bold mt-1 ${c.color}`}>{c.v?.toLocaleString()}</div>
          </Card>
        ))}
      </div>
      <Card>
        <div className="h-64 mb-4">
          <ResponsiveContainer>
            <LineChart data={months.map((m: any) => ({ ...m, label: MONTHS[m.month - 1] }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 250)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="revenue"       stroke={COLORS[1]} strokeWidth={2} name="Revenue" />
              <Line type="monotone" dataKey="totalExpenses" stroke={COLORS[4]} strokeWidth={2} name="Expenses" strokeDasharray="4 2" />
              <Line type="monotone" dataKey="profit"        stroke={COLORS[0]} strokeWidth={2} name="Net Profit" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead><tr className="bg-muted/50 text-xs">
              {["Month", "Revenue", "Salaries", "Other Exp.", "Total Exp.", "Net Profit"].map((h) => (
                <th key={h} className="border px-3 py-2 text-left font-medium">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {months.map((m: any, i: number) => (
                <tr key={i} className={`hover:bg-muted/30 ${m.profit < 0 ? "bg-destructive/5" : ""}`}>
                  <td className="border px-3 py-2 font-medium">{MONTHS[m.month - 1]}</td>
                  <td className="border px-3 py-2 text-green-600">{m.revenue?.toLocaleString()}</td>
                  <td className="border px-3 py-2">{m.salary?.toLocaleString()}</td>
                  <td className="border px-3 py-2">{m.expenses?.toLocaleString()}</td>
                  <td className="border px-3 py-2">{m.totalExpenses?.toLocaleString()}</td>
                  <td className={`border px-3 py-2 font-bold ${m.profit >= 0 ? "text-green-600" : "text-destructive"}`}>{m.profit?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StudentReportTable({ data }: { data: any }) {
  const d = asObj<any>(data);
  const students = asList<any>(d.students);
  if (!students.length) return <EmptyState icon={Users} title="No student data" />;
  return (
    <Card>
      <div className="flex gap-4 mb-3 text-sm">
        <span>Total: <strong>{d.totalStudents}</strong></span>
        <span className="text-green-600">Active: <strong>{d.active}</strong></span>
        <span className="text-muted-foreground">Inactive: <strong>{d.inactive}</strong></span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead><tr className="bg-muted/50 text-xs">
            {["Student", "Adm. No", "Class", "Section", "Status", "P", "A", "L", "Fee Status"].map((h) => (
              <th key={h} className="border px-2 py-2 text-left font-medium">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {students.map((s: any, i: number) => (
              <tr key={i} className="hover:bg-muted/30">
                <td className="border px-2 py-2 font-medium">{s.fullName}</td>
                <td className="border px-2 py-2 text-muted-foreground">{s.admissionNo}</td>
                <td className="border px-2 py-2">{s.class}</td>
                <td className="border px-2 py-2">{s.section}</td>
                <td className="border px-2 py-2"><StatusBadge status={s.status} /></td>
                <td className="border px-2 py-2 text-green-600">{s.attendance?.present}</td>
                <td className="border px-2 py-2 text-destructive">{s.attendance?.absent}</td>
                <td className="border px-2 py-2 text-amber-500">{s.attendance?.late}</td>
                <td className="border px-2 py-2">{s.fee ? <StatusBadge status={s.fee.status} /> : <span className="text-muted-foreground">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ExamResultsTable({ data }: { data: any }) {
  const exams = asList<any>(data);
  if (!exams.length) return <EmptyState icon={ClipboardList} title="No completed exams found" />;
  return (
    <div className="space-y-6">
      {exams.map((exam: any, ei: number) => (
        <Card key={ei}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold">{exam.examName}</h3>
              <div className="text-xs text-muted-foreground">{exam.class} {exam.section} · {exam.startDate?.slice(0,10)}</div>
            </div>
            <div className="text-right text-sm">
              <div>Students: <strong>{exam.totalStudents}</strong></div>
            </div>
          </div>
          {asList<any>(exam.subjects).map((sub: any, si: number) => (
            <div key={si} className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-primary">{sub.subject}</h4>
                <span className="text-xs text-muted-foreground">Pass Rate: {sub.passRate}% · Max: {sub.totalMarks} · Pass: {sub.passingMarks}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead><tr className="bg-muted/50">
                    {["Student", "Adm. No", "Marks", "Result"].map((h) => (
                      <th key={h} className="border px-2 py-1.5 text-left font-medium">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {asList<any>(sub.results).map((r: any, ri: number) => (
                      <tr key={ri} className="hover:bg-muted/30">
                        <td className="border px-2 py-1.5">{r.student}</td>
                        <td className="border px-2 py-1.5 text-muted-foreground">{r.admissionNo}</td>
                        <td className="border px-2 py-1.5 font-bold">{r.marksObtained}/{sub.totalMarks}</td>
                        <td className={`border px-2 py-1.5 font-semibold ${r.passed ? "text-green-600" : "text-destructive"}`}>
                          {r.passed ? "Pass" : "Fail"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}
