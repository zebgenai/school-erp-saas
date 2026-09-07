import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { homeRouteForRole } from "@/lib/permissions";
import { motion } from "framer-motion";
import {
  Users, UserCheck, UserX, Wallet, TrendingUp, ClipboardList,
  Plus, CalendarCheck, Receipt, GraduationCap, ArrowUpRight,
  UserCog, Briefcase, Building, TrendingDown, BookOpen,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend,
  ChartSuspense,
} from "@/components/charts/LazyCharts";
import { AppShell } from "@/components/layout/AppShell";
import { RecentActivityWidget } from "@/components/ActivityTimeline";
import { UpcomingEventsWidget } from "@/components/UpcomingEventsWidget";
import { Card, PageHeader, StaggerItem, StaggerList, Skeleton, EmptyState, StatusBadge, ErrorState } from "@/components/ui-kit";
import { useApiQuery, asList, asObj } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — School ERP" }] }),
  component: () => <AppShell><DashboardGuard /></AppShell>,
});

/** Redirects role-specific users to their dedicated dashboards */
function DashboardGuard() {
  const { user } = useAuth();
  const router = useRouter();
  const needsRedirect = user?.role === "SUPER_ADMIN" || user?.role === "PLATFORM_MANAGER" || user?.role === "TEACHER" || user?.role === "PARENT" || user?.role === "STUDENT";
  useEffect(() => {
    if (needsRedirect) router.navigate({ to: homeRouteForRole(user?.role) });
  }, [needsRedirect, user, router]);
  if (needsRedirect) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
  return <Dashboard />;
}

function Dashboard() {
  const { user } = useAuth();
  const { role, can } = usePermissions();
  const isAccountant = role === "ACCOUNTANT";
  const isReceptionist = role === "RECEPTIONIST";
  const showFinance = can("fees.manage") || isAccountant;
  const showFeeView = can("fees.view");
  const showAttendanceCharts = can("attendance.view");
  const showExams = can("exams.view");

  const summary = useApiQuery<any>("/reports/dashboard-summary");
  const recent = useApiQuery<any>("/reports/recent-admissions");
  const defaulters = useApiQuery<any>(showFeeView ? "/reports/fee-defaulters" : null);
  const feeChart = useApiQuery<any>(showFeeView ? "/reports/monthly-fee-chart" : null);
  const attChart = useApiQuery<any>(showAttendanceCharts ? "/reports/attendance-chart" : null);
  const exams = useApiQuery<any>(showExams ? "/reports/upcoming-exams" : null);
  const recentPayments = useApiQuery<any>(showFinance ? "/reports/recent-fee-payments" : null);
  const profitLoss = useApiQuery<any>(showFinance ? "/reports/profit-loss" : null);

  const s = asObj<any>(summary.data);
  const numOrDash = (v: any) => (v === 0 ? 0 : (v ?? "—"));
  const collected = Number(s.finance?.feeCollected ?? s.fees?.totalPaid ?? 0);
  const expenses = Number(s.finance?.otherExpenses ?? s.expenses?.totalAmount ?? 0);
  const salaries = Number(s.finance?.salaryExpenses ?? s.payroll?.paid?.totalNet ?? 0);
  const profit = s.finance?.netProfit ?? (collected - expenses - salaries);

  const cards = [
    { label: "Total Students", value: numOrDash(s.totalStudents ?? s.activeStudents ?? 0), icon: Users, tone: "from-blue-500/15 to-blue-500/5", color: "text-blue-600", show: true },
    { label: "Total Teachers", value: numOrDash(s.totalTeachers ?? 0), icon: UserCog, tone: "from-indigo-500/15 to-indigo-500/5", color: "text-indigo-600", show: !isReceptionist },
    { label: "Total Staff", value: numOrDash(s.totalStaff ?? 0), icon: Briefcase, tone: "from-slate-500/15 to-slate-500/5", color: "text-slate-600", show: !isReceptionist },
    { label: "Total Classes", value: numOrDash(s.totalClasses ?? 0), icon: BookOpen, tone: "from-cyan-500/15 to-cyan-500/5", color: "text-cyan-600", show: true },
    { label: "New Admissions", value: numOrDash(s.newAdmissions ?? 0), icon: GraduationCap, tone: "from-fuchsia-500/15 to-fuchsia-500/5", color: "text-fuchsia-600", show: true },
    { label: "Present Today", value: numOrDash(s.todayAttendance?.present ?? s.presentToday ?? 0), icon: UserCheck, tone: "from-emerald-500/15 to-emerald-500/5", color: "text-emerald-600", show: showAttendanceCharts },
    { label: "Absent Today", value: numOrDash(s.todayAttendance?.absent ?? s.absentToday ?? 0), icon: UserX, tone: "from-rose-500/15 to-rose-500/5", color: "text-rose-600", show: showAttendanceCharts },
    { label: "Fees Collected", value: formatMoney(collected), icon: TrendingUp, tone: "from-violet-500/15 to-violet-500/5", color: "text-violet-600", show: showFinance },
    { label: "Pending Fees", value: formatMoney(s.fees?.totalPending ?? s.pendingFees ?? 0), icon: Wallet, tone: "from-amber-500/15 to-amber-500/5", color: "text-amber-600", show: showFinance || showFeeView },
    { label: "Monthly Expenses", value: formatMoney(expenses), icon: TrendingDown, tone: "from-orange-500/15 to-orange-500/5", color: "text-orange-600", show: showFinance },
    { label: "Salary Expenses", value: formatMoney(salaries), icon: Building, tone: "from-pink-500/15 to-pink-500/5", color: "text-pink-600", show: showFinance },
    { label: profit >= 0 ? "Profit" : "Loss", value: formatMoney(Math.abs(profit)),
      icon: profit >= 0 ? TrendingUp : TrendingDown,
      tone: profit >= 0 ? "from-emerald-500/15 to-emerald-500/5" : "from-rose-500/15 to-rose-500/5",
      color: profit >= 0 ? "text-emerald-600" : "text-rose-600", show: showFinance },
  ].filter((c) => c.show);

  const quickActions = [
    ...(can("students.create") ? [{ label: "Add Student", to: "/students", icon: Plus }] : []),
    ...(can("attendance.mark") ? [{ label: "Mark Attendance", to: "/attendance", icon: CalendarCheck }] : []),
    ...(can("fees.manage") ? [{ label: "Collect Fee", to: "/fees", icon: Receipt }] : []),
    ...(can("payroll.manage") ? [{ label: "Run Payroll", to: "/payroll", icon: Wallet }] : []),
  ];


  return (
    <div>
      {summary.error && (
        <div className="mb-4">
          <ErrorState message={summary.error} onRetry={summary.refetch} />
        </div>
      )}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-primary text-primary-foreground p-6 sm:p-8 mb-6 shadow-card"
      >
        <div className="absolute -right-12 -top-12 size-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -right-6 -bottom-10 size-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <p className="text-sm opacity-90">Welcome back</p>
          <h1 className="text-2xl sm:text-3xl font-semibold mt-1">{user?.name || "Administrator"}</h1>
          <p className="opacity-90 mt-1 text-sm">{user?.school?.name || user?.schoolName || "Your School"} — here's what's happening today.</p>
          <div className="flex flex-wrap gap-2 mt-5">
            {quickActions.map((a) => (
              <Link key={a.label} to={a.to}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur text-sm font-medium transition">
                <a.icon className="size-4" /> {a.label}
              </Link>
            ))}
          </div>
        </div>
      </motion.div>

      <StaggerList>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          {cards.map((c) => (
            <StaggerItem key={c.label}>
              <Card hover className={`bg-gradient-to-br ${c.tone}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground font-medium">{c.label}</div>
                    <div className="text-2xl font-bold mt-1.5">
                      {summary.loading ? <Skeleton className="h-7 w-16" /> : summary.error ? "—" : c.value}
                    </div>
                  </div>
                  <div className={`size-10 rounded-xl bg-card ${c.color} grid place-items-center shadow-soft`}>
                    <c.icon className="size-5" />
                  </div>
                </div>
              </Card>
            </StaggerItem>
          ))}
        </div>
      </StaggerList>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {showFeeView && (
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Monthly Fee Collection</h3>
              <p className="text-xs text-muted-foreground">Revenue trend across months</p>
            </div>
          </div>
          <div className="h-72">
            {feeChart.loading ? <Skeleton className="h-full w-full" /> :
              feeChart.error ? <ErrorState message={feeChart.error} onRetry={feeChart.refetch} /> :
              normalizeChart(feeChart.data, ["month", "amount"]).length === 0 ? (
                <EmptyState icon={Receipt} title="No fee data yet" description="Fee collection data will appear here once invoices are recorded." />
              ) : (
              <ChartSuspense height="18rem">
              <ResponsiveContainer>
                <AreaChart data={normalizeChart(feeChart.data, ["month", "amount"])}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.55 0.18 258)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="oklch(0.55 0.18 258)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 250)" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="value" stroke="oklch(0.55 0.18 258)" strokeWidth={2} fill="url(#g1)" />
                </AreaChart>
              </ResponsiveContainer>
              </ChartSuspense>
              )}
          </div>
        </Card>
        )}

        {showAttendanceCharts && (
        <Card className={showFeeView ? "" : "lg:col-span-3"}>
          <div className="mb-4">
            <h3 className="font-semibold">Attendance Overview</h3>
            <p className="text-xs text-muted-foreground">Last days at a glance</p>
          </div>
          <div className="h-72">
            {attChart.loading ? <Skeleton className="h-full w-full" /> :
              attChart.error ? <ErrorState message={attChart.error} onRetry={attChart.refetch} /> :
              normalizeChart(attChart.data, ["date", "present"]).length === 0 ? (
                <EmptyState icon={CalendarCheck} title="No attendance data yet" description="Attendance trends will appear once daily attendance is marked." />
              ) : (
              <ResponsiveContainer>
                <BarChart data={normalizeChart(attChart.data, ["date", "present"])}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 250)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="oklch(0.65 0.16 155)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        )}
      </div>

      {showFinance && (
      <Card className="mb-6">
        <div className="mb-4">
          <h3 className="font-semibold">Expense vs Salary Trend</h3>
          <p className="text-xs text-muted-foreground">Operational expenses and payroll over months</p>
        </div>
        <div className="h-72">
          {profitLoss.loading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer>
              <LineChart data={normalizeProfitLoss(profitLoss.data)}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 250)" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="expense" stroke="oklch(0.65 0.18 30)" strokeWidth={2} name="Expenses" />
                <Line type="monotone" dataKey="salary" stroke="oklch(0.55 0.18 320)" strokeWidth={2} name="Salary" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
      )}


      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <UpcomingEventsWidget limit={6} />

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Recent Admissions</h3>
            <Link to="/students" className="text-xs text-primary inline-flex items-center gap-1">View all <ArrowUpRight className="size-3" /></Link>
          </div>
          {recent.loading ? <Skeleton className="h-40" /> :
            asList(recent.data).length === 0 ? <EmptyState icon={Users} title="No recent admissions" /> : (
              <ul className="divide-y">
                {asList<any>(recent.data).slice(0, 6).map((st: any, i: number) => (
                  <li key={st.id || i} className="py-3 flex items-center gap-3">
                    <div className="size-9 rounded-full bg-primary/10 text-primary grid place-items-center text-sm font-semibold">
                      {(st.fullName || st.name || "?").charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{st.fullName || st.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {(st.class?.name || st.className || "—")} {st.section?.name ? `• ${st.section.name}` : ""}
                      </div>
                    </div>
                    <StatusBadge status={st.status || "ACTIVE"} />
                  </li>
                ))}
              </ul>
            )}
        </Card>

        {showFeeView && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Fee Defaulters</h3>
            <Link to="/fees" className="text-xs text-primary inline-flex items-center gap-1">Manage <ArrowUpRight className="size-3" /></Link>
          </div>
          {defaulters.loading ? <Skeleton className="h-40" /> :
            asList(defaulters.data).length === 0 ? <EmptyState icon={Wallet} title="No defaulters" description="Everyone's up to date." /> : (
              <ul className="divide-y">
                {asList<any>(defaulters.data).slice(0, 6).map((d: any, i: number) => (
                  <li key={d.id || i} className="py-3 flex items-center gap-3">
                    <div className="size-9 rounded-full bg-destructive/10 text-destructive grid place-items-center text-sm font-semibold">
                      {(d.fullName || d.studentName || "?").charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{d.fullName || d.studentName}</div>
                      <div className="text-xs text-muted-foreground">Due {formatMoney(d.pending || d.amount)}</div>
                    </div>
                    <StatusBadge status="UNPAID" />
                  </li>
                ))}
              </ul>
            )}
        </Card>
        )}
      </div>

      {showExams && (
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Upcoming Exams</h3>
          <Link to="/exams" className="text-xs text-primary inline-flex items-center gap-1">All exams <ArrowUpRight className="size-3" /></Link>
        </div>
        {exams.loading ? <Skeleton className="h-32" /> :
          asList(exams.data).length === 0 ? <EmptyState icon={ClipboardList} title="No upcoming exams" /> : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {asList<any>(exams.data).slice(0, 6).map((ex: any, i: number) => (
                <div key={ex.id || i} className="p-4 rounded-xl border bg-muted/30 hover:bg-muted/60 transition">
                  <div className="font-medium">{ex.name || ex.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {ex.class?.name || ex.className || "All classes"} • {formatDate(ex.startDate || ex.date)}
                  </div>
                </div>
              ))}
            </div>
          )}
      </Card>
      )}

      {showFinance && (
      <Card className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Recent Payments</h3>
          <Link to="/fees" className="text-xs text-primary inline-flex items-center gap-1">All payments <ArrowUpRight className="size-3" /></Link>
        </div>
        {recentPayments.loading ? <Skeleton className="h-32" /> :
          asList(recentPayments.data).length === 0 ? <EmptyState icon={Receipt} title="No payments yet" /> : (
            <ul className="divide-y">
              {asList<any>(recentPayments.data).slice(0, 6).map((p: any, i: number) => (
                <li key={p.id || i} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.student?.fullName || p.studentName || "—"}</div>
                    <div className="text-xs text-muted-foreground">{p.method || "—"} • {formatDate(p.date || p.paidOn || p.createdAt)}</div>
                  </div>
                  <div className="font-semibold text-emerald-600">{formatMoney(p.amount)}</div>
                </li>
              ))}
            </ul>
          )}
      </Card>
      )}

      <Card className="mt-6">
        <RecentActivityWidget />
      </Card>
    </div>
  );
}

function normalizeProfitLoss(data: any) {
  const rows = asList<any>((data as any)?.months ?? data);
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return rows.map((row: any) => ({
    label: MONTHS[(row.month ?? 1) - 1] ?? String(row.month),
    expense: Number(row.expenses ?? 0),
    salary: Number(row.salary ?? 0),
  }));
}

function normalizeMulti(data: any, keys: [string, string, string]) {
  const list = asList<any>(data);
  return list.map((row) => ({
    label: row[keys[0]] ?? row.label ?? row.name ?? "",
    expense: Number(row[keys[1]] ?? row.expense ?? 0),
    salary: Number(row[keys[2]] ?? row.salary ?? 0),
  }));
}


function formatMoney(v: any) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(n);
}
function formatDate(v: any) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
function normalizeChart(data: any, keys: [string, string]) {
  const list = asList<any>(data);
  return list.map((row) => ({
    label: row[keys[0]] ?? row.label ?? row.name ?? "",
    value: Number(row[keys[1]] ?? row.value ?? row.total ?? 0),
  }));
}
