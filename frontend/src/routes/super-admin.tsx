import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2, Users, GraduationCap, Briefcase, TrendingUp, Receipt,
  BarChart3, Settings, ShieldCheck, AlertTriangle, CheckCircle, XCircle,
  Plus, Edit2, Trash2, Eye, Play, Pause, RefreshCw, LogIn, Search,
  ChevronDown, X, DollarSign, Clock, Activity, HeartHandshake,
  UserPlus, KeyRound, UserCog, Lock, Unlock, Ban, UserCheck, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PageHeader, Skeleton, EmptyState, StatusBadge } from "@/components/ui-kit";
import { Button, Field, Select, TextInput, Textarea } from "@/components/form";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { useApiQuery, asList } from "@/lib/hooks";
import { api, tokenStore } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { RolesManagementTab } from "@/components/super-admin/RolesManagementTab";
import { PlatformTeamTab } from "@/components/super-admin/PlatformTeamTab";
import { isPlatformStaff } from "@/lib/permissions";

export const Route = createFileRoute("/super-admin")({
  head: () => ({ meta: [{ title: "Super Admin — Clever Campus" }] }),
  component: () => <AppShell><SuperAdminPage /></AppShell>,
});

type Tab = "dashboard" | "schools" | "roles" | "team" | "plans" | "billing" | "audit" | "settings";

// ─── Root ─────────────────────────────────────────────────────────────────────

function SuperAdminPage() {
  const { user } = useAuth();
  const initialTab = (): Tab => {
    if (typeof window === "undefined") return "dashboard";
    const t = new URLSearchParams(window.location.search).get("tab");
    const valid: Tab[] = ["dashboard", "schools", "roles", "team", "plans", "billing", "audit", "settings"];
    const chosen = (valid.includes(t as Tab) ? t : "dashboard") as Tab;
    const ownerOnly = chosen === "team" || chosen === "settings";
    if (ownerOnly && user?.role !== "SUPER_ADMIN") return "dashboard";
    return chosen;
  };
  const [tab, setTab] = useState<Tab>(initialTab);

  const changeTab = (t: Tab) => {
    setTab(t);
    const url = t === "dashboard" ? "/super-admin" : `/super-admin?tab=${t}`;
    window.history.pushState(null, "", url);
  };

  if (!isPlatformStaff(user?.role)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <ShieldCheck className="size-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
          <p className="text-muted-foreground">Only platform Super Admins and Managers can access this area.</p>
        </div>
      </div>
    );
  }

  const isOwner = user?.role === "SUPER_ADMIN";

  const tabs: { id: Tab; label: string; icon: any; ownerOnly?: boolean }[] = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "schools", label: "Schools", icon: Building2 },
    { id: "roles", label: "Role Management", icon: KeyRound },
    { id: "team", label: "Platform Team", icon: UserCog, ownerOnly: true },
    { id: "plans", label: "Plans", icon: Receipt },
    { id: "billing", label: "Billing", icon: DollarSign },
    { id: "audit", label: "Audit Logs", icon: Activity },
    { id: "settings", label: "Platform Settings", icon: Settings, ownerOnly: true },
  ].filter((t) => isOwner || !t.ownerOnly) as { id: Tab; label: string; icon: any; ownerOnly?: boolean }[];

  return (
    <div>
      <PageHeader
        title={isOwner ? "Super Admin" : "Platform Manager"}
        description={isOwner
          ? "Platform-wide SaaS management, team, and analytics."
          : "Operate schools, billing, plans, and school roles. Team and platform settings are Super Admin only."}
      />

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto mb-6 p-1 bg-muted/40 rounded-xl w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => changeTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
              tab === t.id
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <DashboardTab />}
      {tab === "schools" && <SchoolsTab />}
      {tab === "roles" && <RolesManagementTab />}
      {tab === "team" && isOwner && <PlatformTeamTab />}
      {tab === "plans" && <PlansTab />}
      {tab === "billing" && <BillingTab />}
      {tab === "audit" && <AuditTab />}
      {tab === "settings" && isOwner && <PlatformSettingsTab />}
    </div>
  );
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab() {
  const stats = useApiQuery<any>("/super-admin/dashboard");
  const revenue = useApiQuery<any>("/super-admin/revenue-chart");
  const growth = useApiQuery<any>("/super-admin/school-growth");

  const s = (stats.data as any) || {};

  const summaryCards = [
    { label: "Total Schools", value: s.totalSchools ?? 0, icon: Building2, color: "text-blue-600 bg-blue-500/10" },
    { label: "Active Schools", value: s.activeSchools ?? 0, icon: CheckCircle, color: "text-emerald-600 bg-emerald-500/10" },
    { label: "Suspended", value: s.suspendedSchools ?? 0, icon: XCircle, color: "text-rose-600 bg-rose-500/10" },
    { label: "Trial", value: s.trialSchools ?? 0, icon: Clock, color: "text-amber-600 bg-amber-500/10" },
    { label: "Expiring (30d)", value: s.expiringSchools ?? 0, icon: AlertTriangle, color: "text-orange-600 bg-orange-500/10" },
    { label: "Total Students", value: s.totalStudents ?? 0, icon: Users, color: "text-indigo-600 bg-indigo-500/10" },
    { label: "Total Teachers", value: s.totalTeachers ?? 0, icon: GraduationCap, color: "text-violet-600 bg-violet-500/10" },
    { label: "Total Staff", value: s.totalStaff ?? 0, icon: Briefcase, color: "text-pink-600 bg-pink-500/10" },
    { label: "Total Parents", value: s.totalParents ?? 0, icon: HeartHandshake, color: "text-cyan-600 bg-cyan-500/10" },
    { label: "Active Subscriptions", value: s.activeSubscriptions ?? 0, icon: ShieldCheck, color: "text-teal-600 bg-teal-500/10" },
    { label: "Pending Renewals", value: s.pendingRenewals ?? 0, icon: RefreshCw, color: "text-yellow-600 bg-yellow-500/10" },
    { label: "New Schools (mo)", value: s.newSchoolsThisMonth ?? 0, icon: Plus, color: "text-green-600 bg-green-500/10" },
  ];

  const revenueCards = [
    { label: "MRR", value: formatMoney(s.mrr ?? 0), icon: TrendingUp, color: "text-violet-600 bg-violet-500/10" },
    { label: "ARR", value: formatMoney(s.arr ?? 0), icon: BarChart3, color: "text-blue-600 bg-blue-500/10" },
  ];

  return (
    <div className="space-y-6">
      {/* Revenue highlight */}
      <div className="grid sm:grid-cols-2 gap-4">
        {revenueCards.map((c) => (
          <Card key={c.label} className="flex items-center gap-4 p-5">
            <div className={`size-12 rounded-2xl grid place-items-center ${c.color}`}>
              <c.icon className="size-6" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-medium">{c.label}</div>
              <div className="text-3xl font-bold mt-0.5">
                {stats.loading ? <Skeleton className="h-8 w-28" /> : c.value}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {summaryCards.map((c) => (
          <Card key={c.label} hover>
            <div className={`size-9 rounded-xl grid place-items-center mb-2.5 ${c.color}`}>
              <c.icon className="size-4" />
            </div>
            <div className="text-2xl font-bold">
              {stats.loading ? <Skeleton className="h-6 w-10" /> : c.value.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{c.label}</div>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-semibold mb-1">Monthly Revenue Trend</h3>
          <p className="text-xs text-muted-foreground mb-4">Last 12 months</p>
          <div className="h-64">
            {revenue.loading ? <Skeleton className="h-full" /> : (
              <ResponsiveContainer>
                <AreaChart data={asList<any>(revenue.data)}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.55 0.18 258)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="oklch(0.55 0.18 258)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 250)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => formatMoney(v)} />
                  <Area type="monotone" dataKey="revenue" stroke="oklch(0.55 0.18 258)" strokeWidth={2} fill="url(#revGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold mb-1">School Growth</h3>
          <p className="text-xs text-muted-foreground mb-4">New schools vs cumulative</p>
          <div className="h-64">
            {growth.loading ? <Skeleton className="h-full" /> : (
              <ResponsiveContainer>
                <LineChart data={asList<any>(growth.data)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 250)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="newSchools" stroke="oklch(0.65 0.16 155)" strokeWidth={2} name="New" />
                  <Line type="monotone" dataKey="total" stroke="oklch(0.55 0.18 258)" strokeWidth={2} name="Total" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Schools Tab ──────────────────────────────────────────────────────────────

function SchoolsTab() {
  const { user } = useAuth();
  const isOwner = user?.role === "SUPER_ADMIN";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const plans = useApiQuery<any>("/plans");
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const schools = useApiQuery<any>("/super-admin/schools", {
    search: search || undefined,
    status: statusFilter || undefined,
    limit: 100,
  });

  const [createModal, setCreateModal]   = useState(false);
  const [detailSchool, setDetailSchool] = useState<any | null>(null);
  const [editModal, setEditModal]   = useState<any | null>(null);
  const [planModal, setPlanModal]   = useState<any | null>(null);
  const [extendModal, setExtendModal] = useState<any | null>(null);
  const [suspendModal, setSuspendModal] = useState<any | null>(null);
  const [delModal, setDelModal] = useState<any | null>(null);

  const rows = asList<any>((schools.data as any)?.data ?? schools.data);

  const act = async (
    action: string,
    schoolId: string,
    body?: any,
    method: "PATCH" | "POST" = "PATCH",
  ) => {
    setBusy((p) => ({ ...p, [schoolId]: true }));
    try {
      if (method === "POST") await api.post(action, body ?? {});
      else await api.patch(action, body ?? {});
      toast.success("Done");
      schools.refetch();
    } catch (e: any) {
      toast.error(e.message || "Action failed");
    } finally {
      setBusy((p) => ({ ...p, [schoolId]: false }));
    }
  };

  const impersonate = async (schoolId: string) => {
    setBusy((p) => ({ ...p, [schoolId]: true }));
    try {
      const res: any = await api.post(`/super-admin/schools/${schoolId}/impersonate`, {});
      tokenStore.set(res.accessToken);
      window.location.href = "/dashboard";
    } catch (e: any) {
      toast.error(e.message || "Impersonation failed");
    } finally {
      setBusy((p) => ({ ...p, [schoolId]: false }));
    }
  };

  if (detailSchool) {
    return <SchoolDetailsView school={detailSchool} onBack={() => { setDetailSchool(null); schools.refetch(); }} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="grid sm:grid-cols-3 gap-3 flex-1">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <TextInput
              placeholder="Search schools, email, owner…"
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="SUSPENDED">Suspended</option>
          </Select>
        </div>
        <Button onClick={() => setCreateModal(true)}>
          <Plus className="size-4" /> Create School
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {schools.loading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Building2} title="No schools found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted-foreground">School</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Owner</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Plan</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Students</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Expiry</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30 transition cursor-pointer"
                    onClick={() => setDetailSchool(r)}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-primary hover:underline">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.email || r.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.ownerName || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${planBadge(r.subscription?.plan?.tier)}`}>
                        {r.subscription?.plan?.name || "No Plan"}
                      </span>
                    </td>
                    <td className="px-4 py-3">{r._count?.students ?? 0}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {r.subscription?.endDate ? new Date(r.subscription.endDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <ActionMenu
                        school={r}
                        loading={!!busy[r.id]}
                        onActivate={() => act(`/super-admin/schools/${r.id}/activate`, r.id)}
                        onSuspend={() => setSuspendModal(r)}
                        onAssignPlan={() => setPlanModal(r)}
                        onExtend={() => setExtendModal(r)}
                        onView={() => setDetailSchool(r)}
                        onImpersonate={() => impersonate(r.id)}
                        onEdit={() => setEditModal(r)}
                        onDelete={() => setDelModal(r)}
                        isOwner={isOwner}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Edit School */}
      {editModal && (
        <EditSchoolModal
          school={editModal}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); schools.refetch(); }}
        />
      )}

      {/* Assign Plan */}
      {planModal && (
        <AssignPlanModal
          school={planModal}
          plans={asList<any>(plans.data)}
          onClose={() => setPlanModal(null)}
          onSaved={() => { setPlanModal(null); schools.refetch(); }}
        />
      )}

      {/* Extend */}
      {extendModal && (
        <ExtendModal
          school={extendModal}
          onClose={() => setExtendModal(null)}
          onSaved={() => { setExtendModal(null); schools.refetch(); }}
        />
      )}

      {/* Suspend */}
      {suspendModal && (
        <SuspendModal
          school={suspendModal}
          onClose={() => setSuspendModal(null)}
          onSaved={() => { setSuspendModal(null); schools.refetch(); }}
        />
      )}

      {/* Create School */}
      {createModal && (
        <CreateSchoolModal
          onClose={() => setCreateModal(false)}
          onSaved={() => { setCreateModal(false); schools.refetch(); }}
        />
      )}

      {/* Delete */}
      <ConfirmDialog
        open={!!delModal}
        onClose={() => setDelModal(null)}
        onConfirm={async () => {
          try {
            await api.delete(`/super-admin/schools/${delModal.id}`);
            toast.success("School deleted");
            setDelModal(null);
            schools.refetch();
          } catch (e: any) { toast.error(e.message); }
        }}
        title="Delete school?"
        message={`This permanently deletes "${delModal?.name}" and all its data. This cannot be undone.`}
      />
    </div>
  );
}

function ActionMenu({ school, loading, onView, onActivate, onSuspend, onAssignPlan, onExtend, onImpersonate, onEdit, onDelete, isOwner }: any) {
  const [open, setOpen] = useState(false);
  const items = [
    { label: "View Details / Users", icon: Eye, action: onView },
    { label: "Edit School", icon: Edit2, action: onEdit },
    { label: "Assign Plan", icon: Receipt, action: onAssignPlan },
    { label: "Extend Subscription", icon: RefreshCw, action: onExtend },
    school.status === "ACTIVE"
      ? { label: "Suspend", icon: Pause, action: onSuspend }
      : { label: "Activate", icon: Play, action: onActivate },
    ...(isOwner ? [
      { label: "Login As Admin", icon: LogIn, action: onImpersonate },
      { label: "Delete School", icon: Trash2, action: onDelete, danger: true },
    ] : []),
  ];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-muted hover:bg-muted/70"
        disabled={loading}
      >
        Actions <ChevronDown className="size-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-20 w-52 rounded-xl border bg-card shadow-lg overflow-hidden">
            {items.map((item: any) => (
              <button
                key={item.label}
                onClick={() => { setOpen(false); item.action(); }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-muted text-left transition ${item.danger ? "text-destructive hover:bg-destructive/10" : ""}`}
              >
                <item.icon className="size-4" /> {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EditSchoolModal({ school, onClose, onSaved }: any) {
  const [f, setF] = useState({
    name:      school.name      || "",
    ownerName: school.ownerName || "",
    email:     school.email     || "",
    phone:     school.phone     || "",
    address:   school.address   || "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.name.trim()) return toast.error("School name is required");
    setSaving(true);
    try {
      await api.patch(`/super-admin/schools/${school.id}`, f);
      toast.success("School updated");
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Edit School — ${school.name}`} size="lg"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}><Edit2 className="w-4 h-4" /> Save Changes</Button></>}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="School Name *"><TextInput value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Owner / Admin Name"><TextInput value={f.ownerName} onChange={(e) => set("ownerName", e.target.value)} /></Field>
        <Field label="Email"><TextInput type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Phone"><TextInput value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="Address"><Textarea value={f.address} onChange={(e) => set("address", e.target.value)} /></Field></div>
      </div>
    </Modal>
  );
}

function AssignPlanModal({ school, plans, onClose, onSaved }: any) {
  const [planId, setPlanId] = useState(school.subscription?.planId || "");
  const [endDate, setEndDate] = useState(school.subscription?.endDate?.slice(0, 10) || "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!planId) return toast.error("Select a plan");
    setSaving(true);
    try {
      await api.post(`/super-admin/schools/${school.id}/assign-plan`, { planId, endDate: endDate || undefined });
      toast.success("Plan assigned");
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Assign Plan — ${school.name}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>Assign</Button></>}>
      <div className="space-y-4">
        <Field label="Plan">
          <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">Select plan…</option>
            {plans.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name} — {formatMoney(Number(p.priceMonthly))}/mo</option>
            ))}
          </Select>
        </Field>
        <Field label="End Date (optional)">
          <TextInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function ExtendModal({ school, onClose, onSaved }: any) {
  const [days, setDays] = useState(30);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api.post(`/super-admin/schools/${school.id}/extend`, { days });
      toast.success(`Subscription extended by ${days} days`);
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Extend Subscription — ${school.name}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>Extend</Button></>}>
      <Field label="Extend by (days)">
        <TextInput type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} />
      </Field>
      {school.subscription?.endDate && (
        <p className="text-xs text-muted-foreground mt-2">
          Current expiry: {new Date(school.subscription.endDate).toLocaleDateString()}
        </p>
      )}
    </Modal>
  );
}

function SuspendModal({ school, onClose, onSaved }: any) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/super-admin/schools/${school.id}/suspend`, { reason });
      toast.success("School suspended");
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Suspend — ${school.name}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving} variant="outline">Suspend</Button></>}>
      <Field label="Reason (optional)">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for suspension…" />
      </Field>
    </Modal>
  );
}

// ─── Plans Tab ────────────────────────────────────────────────────────────────

function PlansTab() {
  const { user } = useAuth();
  const canDelete = user?.role === "SUPER_ADMIN";
  const list = useApiQuery<any>("/plans");
  const [modal, setModal] = useState<{ open: boolean; data: any | null }>({ open: false, data: null });
  const [del, setDel] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const plans = asList<any>(list.data);

  const emptyForm = { name: "", tier: "BASIC", priceMonthly: 0, priceAnnually: 0, maxStudents: 0, maxTeachers: 0, features: "", isActive: true };
  const [form, setForm] = useState<any>(emptyForm);

  const openCreate = () => { setForm(emptyForm); setModal({ open: true, data: null }); };
  const openEdit = (p: any) => {
    setForm({ ...p, features: Array.isArray(p.features) ? p.features.join("\n") : "" });
    setModal({ open: true, data: p });
  };

  const save = async () => {
    if (!form.name?.trim()) return toast.error("Plan name is required");
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        tier: form.tier,
        priceMonthly: Number(form.priceMonthly) || 0,
        priceAnnually: Number(form.priceAnnually) || 0,
        maxStudents: Number(form.maxStudents) || 0,
        maxTeachers: Number(form.maxTeachers) || 0,
        features: String(form.features || "").split("\n").filter(Boolean),
        isActive: form.isActive !== false,
      };
      if (modal.data?.id) await api.patch(`/plans/${modal.data.id}`, payload);
      else await api.post("/plans", payload);
      toast.success("Saved");
      setModal({ open: false, data: null });
      list.refetch();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const remove = async () => {
    try {
      await api.delete(`/plans/${del.id}`);
      toast.success("Plan deleted");
      setDel(null);
      list.refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}><Plus className="size-4" /> Create Plan</Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {list.loading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />) :
          plans.length === 0 ? <EmptyState icon={Receipt} title="No plans yet" /> :
          plans.map((p: any) => (
            <Card key={p.id} className={`relative ${!p.isActive ? "opacity-60" : ""}`}>
              <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold mb-3 ${planBadge(p.tier)}`}>
                {p.tier}
              </div>
              <div className="font-bold text-lg">{p.name}</div>
              <div className="text-2xl font-extrabold mt-1">{formatMoney(Number(p.priceMonthly))}<span className="text-xs font-normal text-muted-foreground">/mo</span></div>
              <div className="text-xs text-muted-foreground">{formatMoney(Number(p.priceAnnually))}/yr</div>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                <li>Students: {p.maxStudents === 0 ? "Unlimited" : p.maxStudents}</li>
                <li>Teachers: {p.maxTeachers === 0 ? "Unlimited" : p.maxTeachers}</li>
                {(Array.isArray(p.features) ? p.features : []).slice(0, 3).map((f: string, i: number) => (
                  <li key={i} className="truncate">• {f}</li>
                ))}
              </ul>
              <div className="absolute top-3 right-3 flex gap-1">
                <button onClick={() => openEdit(p)} className="size-7 grid place-items-center rounded-lg hover:bg-muted"><Edit2 className="size-3.5" /></button>
                {canDelete && (
                  <button onClick={() => setDel(p)} className="size-7 grid place-items-center rounded-lg hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3.5" /></button>
                )}
              </div>
              {p._count?.subscriptions > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">{p._count.subscriptions} school(s)</div>
              )}
            </Card>
          ))}
      </div>

      <Modal open={modal.open} onClose={() => setModal({ open: false, data: null })} title={modal.data ? "Edit Plan" : "Create Plan"} size="lg"
        footer={<><Button variant="outline" onClick={() => setModal({ open: false, data: null })}>Cancel</Button><Button onClick={save} loading={saving}>Save</Button></>}>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Plan Name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Tier">
            <Select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
              <option value="TRIAL">Trial</option>
              <option value="BASIC">Basic</option>
              <option value="PROFESSIONAL">Professional</option>
              <option value="ENTERPRISE">Enterprise</option>
            </Select>
          </Field>
          <Field label="Price/Month (PKR)"><TextInput type="number" min={0} value={form.priceMonthly} onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })} /></Field>
          <Field label="Price/Year (PKR)"><TextInput type="number" min={0} value={form.priceAnnually} onChange={(e) => setForm({ ...form, priceAnnually: e.target.value })} /></Field>
          <Field label="Max Students (0=unlimited)"><TextInput type="number" min={0} value={form.maxStudents} onChange={(e) => setForm({ ...form, maxStudents: e.target.value })} /></Field>
          <Field label="Max Teachers (0=unlimited)"><TextInput type="number" min={0} value={form.maxTeachers} onChange={(e) => setForm({ ...form, maxTeachers: e.target.value })} /></Field>
          <div className="sm:col-span-2">
            <Field label="Features (one per line)">
              <Textarea rows={4} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} placeholder="Unlimited Students&#10;Fee Management&#10;Payroll&#10;Reports" />
            </Field>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} title="Delete plan?" message={`Delete "${del?.name}"? Schools using this plan will be unaffected.`} />
    </div>
  );
}

// ─── Billing Tab ──────────────────────────────────────────────────────────────

function BillingTab() {
  const [statusFilter, setStatusFilter] = useState("");
  const invoices = useApiQuery<any>("/super-admin/billing", { status: statusFilter || undefined });
  const schools = useApiQuery<any>("/super-admin/schools", { limit: 200 });
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ schoolId: "", amount: 0, period: new Date().toISOString().slice(0, 7), dueDate: "", notes: "" });

  const rows = asList<any>(invoices.data);
  const schoolList = asList<any>((schools.data as any)?.data ?? schools.data);

  const createInvoice = async () => {
    if (!form.schoolId || !form.amount || !form.dueDate) return toast.error("Fill all required fields");
    setBusy(true);
    try {
      await api.post("/super-admin/billing/invoices", { ...form, amount: Number(form.amount) });
      toast.success("Invoice created");
      setInvoiceModal(false);
      invoices.refetch();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const markPaid = async (id: string) => {
    try {
      await api.patch(`/super-admin/billing/invoices/${id}/mark-paid`, {});
      toast.success("Invoice marked as paid");
      invoices.refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="max-w-xs">
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
          <option value="FAILED">Failed</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
        <Button onClick={() => setInvoiceModal(true)}><Plus className="size-4" /> Create Invoice</Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {invoices.loading ? <div className="p-6 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div> :
          rows.length === 0 ? <EmptyState icon={Receipt} title="No invoices" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Invoice</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">School</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Period</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Due Date</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((inv: any) => (
                    <tr key={inv.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{inv.invoiceNo}</td>
                      <td className="px-4 py-3 font-medium">{inv.school?.name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{inv.period}</td>
                      <td className="px-4 py-3 font-semibold">{formatMoney(Number(inv.amount))}</td>
                      <td className="px-4 py-3 text-xs">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}</td>
                      <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                      <td className="px-4 py-3 text-right">
                        {inv.status === "PENDING" && (
                          <Button size="sm" variant="outline" onClick={() => markPaid(inv.id)}>Mark Paid</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      <Modal open={invoiceModal} onClose={() => setInvoiceModal(false)} title="Create Invoice"
        footer={<><Button variant="outline" onClick={() => setInvoiceModal(false)}>Cancel</Button><Button onClick={createInvoice} loading={busy}>Create</Button></>}>
        <div className="space-y-4">
          <Field label="School">
            <Select value={form.schoolId} onChange={(e) => setForm({ ...form, schoolId: e.target.value })}>
              <option value="">Select school…</option>
              {schoolList.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Amount (PKR)"><TextInput type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field>
          <Field label="Period (YYYY-MM)"><TextInput type="month" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} /></Field>
          <Field label="Due Date"><TextInput type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
          <Field label="Notes"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────

function AuditTab() {
  const logs = useApiQuery<any>("/audit-logs", { limit: 100 });
  const rows = asList<any>((logs.data as any)?.data ?? logs.data);

  const actionColor: Record<string, string> = {
    SCHOOL_CREATED: "text-emerald-600 bg-emerald-500/10",
    SCHOOL_UPDATED: "text-blue-600 bg-blue-500/10",
    SCHOOL_ACTIVATED: "text-green-600 bg-green-500/10",
    SCHOOL_SUSPENDED: "text-rose-600 bg-rose-500/10",
    SCHOOL_DELETED: "text-red-700 bg-red-500/10",
    PLAN_ASSIGNED: "text-violet-600 bg-violet-500/10",
    PLAN_CHANGED: "text-indigo-600 bg-indigo-500/10",
    SUBSCRIPTION_EXTENDED: "text-cyan-600 bg-cyan-500/10",
    IMPERSONATION: "text-amber-600 bg-amber-500/10",
    SETTING_UPDATED: "text-slate-600 bg-slate-500/10",
  };

  return (
    <Card className="p-0 overflow-hidden">
      {logs.loading ? <div className="p-6 space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div> :
        rows.length === 0 ? <EmptyState icon={Activity} title="No audit logs yet" description="Actions you take here are recorded automatically." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Action</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Actor</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">School</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Details</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((log: any) => (
                  <tr key={log.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${actionColor[log.action] || "text-muted-foreground bg-muted"}`}>
                        {log.action?.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{log.actorName || "—"}</td>
                    <td className="px-4 py-3 font-medium">{log.schoolName || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                      {log.metadata ? JSON.stringify(log.metadata).slice(0, 80) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Card>
  );
}

// ─── Platform Settings Tab ────────────────────────────────────────────────────

const DEFAULT_SETTINGS = [
  { key: "company_name", label: "Company Name", category: "company", value: "" },
  { key: "company_email", label: "Company Email", category: "company", value: "" },
  { key: "company_phone", label: "Company Phone", category: "company", value: "" },
  { key: "company_website", label: "Company Website", category: "company", value: "" },
  { key: "resend_api_key", label: "Resend API Key", category: "email", value: "", isSecret: true },
  { key: "resend_from", label: "Resend From Address", category: "email", value: "Clever Campus <beth.t@example.com>" },
  { key: "smtp_host", label: "SMTP Host", category: "email", value: "" },
  { key: "smtp_port", label: "SMTP Port", category: "email", value: "587" },
  { key: "smtp_user", label: "SMTP Username", category: "email", value: "" },
  { key: "smtp_password", label: "SMTP Password", category: "email", value: "", isSecret: true },
  { key: "sms_api_key", label: "SMS API Key", category: "sms", value: "", isSecret: true },
  { key: "sms_sender", label: "SMS Sender ID", category: "sms", value: "" },
  { key: "whatsapp_token", label: "WhatsApp Token", category: "whatsapp", value: "", isSecret: true },
  { key: "whatsapp_phone", label: "WhatsApp Number", category: "whatsapp", value: "" },
  { key: "payment_gateway", label: "Payment Gateway", category: "billing", value: "STRIPE" },
  { key: "payment_secret", label: "Payment Secret Key", category: "billing", value: "", isSecret: true },
  { key: "trial_days", label: "Default Trial Days", category: "billing", value: "14" },
];

function PlatformSettingsTab() {
  const data = useApiQuery<any>("/platform-settings");
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loaded = asList<any>(data.data);
    const map: Record<string, string> = {};
    DEFAULT_SETTINGS.forEach((s) => {
      const found = loaded.find((l: any) => l.key === s.key);
      map[s.key] = found ? (found.isSecret ? "" : found.value) : s.value;
    });
    setValues(map);
  }, [data.data]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const settings = DEFAULT_SETTINGS.map((s) => ({
        key: s.key,
        value: values[s.key] || "",
        label: s.label,
        category: s.category,
      })).filter((s) => s.value !== "" || s.value === "");
      await api.patch("/platform-settings", { settings });
      toast.success("Platform settings saved");
      data.refetch();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const categories: Record<string, typeof DEFAULT_SETTINGS> = {};
  DEFAULT_SETTINGS.forEach((s) => {
    if (!categories[s.category]) categories[s.category] = [];
    categories[s.category].push(s);
  });

  const catLabels: Record<string, string> = {
    company: "Company Profile",
    email: "Email (Resend / SMTP)",
    sms: "SMS Settings",
    whatsapp: "WhatsApp Settings",
    billing: "Payment & Billing",
  };

  return (
    <form onSubmit={save} className="space-y-6">
      {Object.entries(categories).map(([cat, items]) => (
        <Card key={cat}>
          <h3 className="font-semibold mb-1">{catLabels[cat] || cat}</h3>
          {cat === "email" && (
            <p className="text-xs text-muted-foreground mb-4">
              <code>beth.t@example.com</code> can only send to the email on your Resend
              account. Verify a domain at resend.com/domains, then set Resend From to an
              address on that domain.
            </p>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            {items.map((s) => (
              <Field key={s.key} label={s.label}>
                <TextInput
                  type={s.isSecret ? "password" : "text"}
                  placeholder={s.isSecret ? "••••••••" : s.label}
                  value={values[s.key] ?? ""}
                  onChange={(e) => setValues((p) => ({ ...p, [s.key]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
        </Card>
      ))}
      <div className="flex justify-end">
        <Button type="submit" loading={saving}><Settings className="size-4" /> Save All Settings</Button>
      </div>
    </form>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(v: any) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `PKR ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `PKR ${(n / 1_000).toFixed(1)}K`;
  return `PKR ${n.toLocaleString()}`;
}

function planBadge(tier?: string) {
  const map: Record<string, string> = {
    TRIAL: "text-amber-700 bg-amber-500/15",
    BASIC: "text-blue-700 bg-blue-500/15",
    PROFESSIONAL: "text-violet-700 bg-violet-500/15",
    ENTERPRISE: "text-emerald-700 bg-emerald-500/15",
  };
  return map[tier ?? ""] || "text-muted-foreground bg-muted";
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE SCHOOL MODAL
// ─────────────────────────────────────────────────────────────────────────────

function CreateSchoolModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", code: "", address: "", phone: "", email: "",
    adminName: "", adminEmail: "", adminPassword: "",
  });
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/super-admin/schools", form);
      toast.success(`School "${form.name}" created with admin account`);
      onSaved();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create school");
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Create New School" size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={(e: any) => save(e)}><Plus className="w-4 h-4" /> Create School</Button>
        </>
      }>
      <form onSubmit={save} className="space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">School Information</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="School Name *"><TextInput required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Bright Future School" /></Field>
            <Field label="School Code"><TextInput value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="BFS-001" /></Field>
            <Field label="Email"><TextInput type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="info@school.com" /></Field>
            <Field label="Phone"><TextInput value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+92 300 0000000" /></Field>
            <div className="sm:col-span-2"><Field label="Address"><TextInput value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="City, Country" /></Field></div>
          </div>
        </div>
        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">School Admin Account</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Admin Full Name *"><TextInput required value={form.adminName} onChange={(e) => set("adminName", e.target.value)} placeholder="Muhammad Ali" /></Field>
            <Field label="Admin Email *"><TextInput required type="email" value={form.adminEmail} onChange={(e) => set("adminEmail", e.target.value)} placeholder="admin@school.com" /></Field>
            <Field label="Password *">
              <TextInput required type="password" value={form.adminPassword} onChange={(e) => set("adminPassword", e.target.value)} placeholder="Min. 6 characters" />
            </Field>
          </div>
        </div>
        <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
          The system will automatically create the school, set up the admin account, and link them together.
          The admin can log in immediately with these credentials.
        </p>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHOOL DETAILS VIEW (Overview + Users + Audit)
// ─────────────────────────────────────────────────────────────────────────────

type DetailTab = "overview" | "users" | "subscription" | "billing" | "audit";

function SchoolDetailsView({ school: initialSchool, onBack }: { school: any; onBack: () => void }) {
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const detail = useApiQuery<any>(`/super-admin/schools/${initialSchool.id}`);
  const school = (detail.data ?? initialSchool) as any;
  const plans  = useApiQuery<any>("/plans");
  const [editModal, setEditModal] = useState(false);
  const [suspendBusy, setSuspendBusy] = useState(false);

  const tabs: { id: DetailTab; label: string; icon: any }[] = [
    { id: "overview",     label: "Overview",     icon: Building2 },
    { id: "users",        label: "Users",        icon: Users },
    { id: "subscription", label: "Subscription", icon: Receipt },
    { id: "billing",      label: "Billing",      icon: DollarSign },
    { id: "audit",        label: "Audit Logs",   icon: Activity },
  ];

  const toggleStatus = async () => {
    setSuspendBusy(true);
    try {
      const endpoint = school.status === "ACTIVE" ? "suspend" : "activate";
      await api.patch(`/super-admin/schools/${school.id}/${endpoint}`, {});
      toast.success(school.status === "ACTIVE" ? "School suspended" : "School activated");
      detail.refetch();
    } catch (e: any) { toast.error(e.message); } finally { setSuspendBusy(false); }
  };

  return (
    <div className="space-y-5">
      {/* Breadcrumb + school name + quick actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition">
            <ArrowLeft className="w-4 h-4" /> All Schools
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="font-bold text-lg">{school.name}</span>
          <StatusBadge status={school.status} />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditModal(true)}>
            <Edit2 className="w-4 h-4" /> Edit School
          </Button>
          <Button size="sm" variant="outline" loading={suspendBusy} onClick={toggleStatus}
            className={school.status === "ACTIVE" ? "text-orange-600 border-orange-300" : "text-green-600 border-green-300"}>
            {school.status === "ACTIVE" ? <><Pause className="w-4 h-4" /> Suspend</> : <><Play className="w-4 h-4" /> Activate</>}
          </Button>
        </div>
      </div>

      {/* Quick stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Students", value: school._count?.students ?? 0, icon: GraduationCap, color: "text-blue-600" },
          { label: "Teachers", value: school._count?.teachers ?? 0, icon: Briefcase, color: "text-violet-600" },
          { label: "Staff",    value: school._count?.staff    ?? 0, icon: Users,        color: "text-amber-600" },
          { label: "Parents",  value: school._count?.parents  ?? 0, icon: HeartHandshake, color: "text-rose-600" },
        ].map((s) => (
          <Card key={s.label} className="flex items-center gap-3 p-4">
            <s.icon className={`w-8 h-8 ${s.color}`} />
            <div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap border-b border-border pb-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setDetailTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              detailTab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {detailTab === "overview"     && <SchoolOverviewTab school={school} onRefresh={() => detail.refetch()} />}
      {detailTab === "users"        && <SchoolUsersTab schoolId={initialSchool.id} schoolName={school.name} onRefresh={() => detail.refetch()} />}
      {detailTab === "subscription" && <SchoolSubscriptionTab school={school} plans={asList<any>(plans.data)} onRefresh={() => detail.refetch()} />}
      {detailTab === "billing"      && <SchoolBillingTab schoolId={initialSchool.id} schoolName={school.name} />}
      {detailTab === "audit"        && <SchoolAuditTab schoolId={initialSchool.id} />}

      {editModal && (
        <EditSchoolModal school={school} onClose={() => setEditModal(false)} onSaved={() => { setEditModal(false); detail.refetch(); }} />
      )}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function SchoolOverviewTab({ school, onRefresh }: { school: any; onRefresh: () => void }) {
  const fields = [
    { label: "School Name",   value: school.name },
    { label: "Owner / Admin", value: school.ownerName ?? "—" },
    { label: "Email",         value: school.email ?? "—" },
    { label: "Phone",         value: school.phone ?? "—" },
    { label: "Address",       value: school.address ?? "—" },
    { label: "Status",        value: <StatusBadge status={school.status} /> },
    { label: "Plan",          value: school.subscription?.plan?.name ?? "No Plan" },
    { label: "Sub. Status",   value: school.subscription?.status ?? "—" },
    { label: "Sub. Expiry",   value: school.subscription?.endDate ? new Date(school.subscription.endDate).toLocaleDateString() : "—" },
    { label: "Created",       value: school.createdAt ? new Date(school.createdAt).toLocaleDateString() : "—" },
    { label: "Slug",          value: <span className="font-mono text-xs">{school.slug}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {fields.map((f) => (
          <div key={f.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{f.label}</p>
            <div className="font-medium">{f.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

const SCHOOL_ROLES = ["SCHOOL_ADMIN","ACCOUNTANT","TEACHER","RECEPTIONIST","PARENT","STUDENT"];

function SchoolUsersTab({ schoolId, schoolName, onRefresh }: { schoolId: string; schoolName: string; onRefresh?: () => void }) {
  const [search, setSearch]       = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage]           = useState(0);
  const PAGE_SIZE = 20;

  const users = useApiQuery<any>(`/super-admin/schools/${schoolId}/users`, {
    search:  search  || undefined,
    role:    roleFilter  || undefined,
    status:  statusFilter || undefined,
    limit:   PAGE_SIZE,
    skip:    page * PAGE_SIZE,
  });

  const [createModal,       setCreateModal]       = useState(false);
  const [editModal,         setEditModal]         = useState<any | null>(null);
  const [resetPwModal,      setResetPwModal]      = useState<any | null>(null);
  const [changeRoleModal,   setChangeRoleModal]   = useState<any | null>(null);
  const [statusModal,       setStatusModal]       = useState<{ user: any; action: string } | null>(null);
  const [deleteModal,       setDeleteModal]       = useState<any | null>(null);

  const rows  = asList<any>((users.data as any)?.data ?? users.data);
  const total = (users.data as any)?.total ?? rows.length;

  const refetch = () => users.refetch();

  return (
    <div className="space-y-4">
      {/* School Admin Management Panel */}
      <SchoolAdminPanel schoolId={schoolId} onRefresh={() => { users.refetch(); onRefresh?.(); }} />

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <TextInput placeholder="Search name or email…" className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-40">
          <option value="">All Roles</option>
          {SCHOOL_ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-36">
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </Select>
        <Button onClick={() => setCreateModal(true)}>
          <UserPlus className="w-4 h-4" /> Add User
        </Button>
      </div>

      {/* Users table */}
      <Card className="p-0 overflow-hidden">
        {users.loading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title="No users found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  {["Name","Email","Role","Status","Last Login","Flags","Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((u: any) => {
                  const isLocked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
                  return (
                    <tr key={u.id} className="border-t hover:bg-muted/20 transition">
                      <td className="px-4 py-3 font-medium">{u.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {u.role?.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {isLocked && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-semibold">LOCKED</span>}
                          {u.forcePasswordChange && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">PW RESET</span>}
                          {u.loginAttempts >= 3 && !isLocked && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-semibold">{u.loginAttempts} FAILS</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <UserActionMenu
                          user={u}
                          onEdit={() => setEditModal(u)}
                          onResetPw={() => setResetPwModal(u)}
                          onChangeRole={() => setChangeRoleModal(u)}
                          onActivate={() => setStatusModal({ user: u, action: "ACTIVATE" })}
                          onDeactivate={() => setStatusModal({ user: u, action: "DEACTIVATE" })}
                          onUnlock={() => setStatusModal({ user: u, action: "UNLOCK" })}
                          onLock={() => setStatusModal({ user: u, action: "LOCK" })}
                          onDelete={() => setDeleteModal(u)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Modals */}
      {createModal && (
        <CreateUserModal schoolId={schoolId} schoolName={schoolName}
          onClose={() => setCreateModal(false)} onSaved={() => { setCreateModal(false); refetch(); }} />
      )}
      {editModal && (
        <EditUserModal user={editModal}
          onClose={() => setEditModal(null)} onSaved={() => { setEditModal(null); refetch(); }} />
      )}
      {resetPwModal && (
        <ResetPasswordModal user={resetPwModal}
          onClose={() => setResetPwModal(null)} onSaved={() => { setResetPwModal(null); refetch(); }} />
      )}
      {changeRoleModal && (
        <ChangeRoleModal user={changeRoleModal}
          onClose={() => setChangeRoleModal(null)} onSaved={() => { setChangeRoleModal(null); refetch(); }} />
      )}
      {statusModal && (
        <UserStatusModal entry={statusModal}
          onClose={() => setStatusModal(null)} onSaved={() => { setStatusModal(null); refetch(); }} />
      )}
      <ConfirmDialog
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title={`Delete user "${deleteModal?.name}"?`}
        message="This will permanently delete this user account. This cannot be undone."
        onConfirm={async () => {
          try {
            await api.delete(`/super-admin/users/${deleteModal.id}`);
            toast.success("User deleted");
            setDeleteModal(null);
            refetch();
          } catch (e: any) { toast.error(e.message); }
        }}
      />
    </div>
  );
}

// ─── Audit Tab ────────────────────────────────────────────────────────────────

function SchoolAuditTab({ schoolId }: { schoolId: string }) {
  const [search, setSearch] = useState("");
  const logs = useApiQuery<any>(`/audit-logs/school`, { schoolId, limit: 50, search: search || undefined });
  const rows = asList<any>(logs.data?.items ?? logs.data);

  if (logs.loading) return <Skeleton className="h-64" />;
  if (!rows.length) return <EmptyState icon={Activity} title="No audit logs found" />;

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b">
        <input
          type="search"
          placeholder="Search actions, entities, actors…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm px-3 py-2 text-sm rounded-lg border bg-background"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              {["Action", "Actor", "Changes", "IP / Agent", "Date"].map((h) => (
                <th key={h} className="px-4 py-3 font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((log: any) => (
              <tr key={log.id} className="border-t hover:bg-muted/20">
                <td className="px-4 py-3">
                  <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{log.action}</span>
                  {log.description && <div className="text-xs text-muted-foreground mt-1">{log.description}</div>}
                </td>
                <td className="px-4 py-3">{log.actorName ?? log.user?.name ?? "System"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs">
                  {log.changedFields?.length ? (
                    <span>Fields: {(log.changedFields as string[]).join(", ")}</span>
                  ) : log.details ? (
                    <span className="truncate block">{JSON.stringify(log.details).slice(0, 80)}</span>
                  ) : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  <div>{log.ipAddress || "—"}</div>
                  {log.userAgent && <div className="truncate max-w-[120px]" title={log.userAgent}>{log.userAgent.slice(0, 40)}…</div>}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── User Action Menu ─────────────────────────────────────────────────────────

function UserActionMenu({ user, onEdit, onResetPw, onChangeRole, onActivate, onDeactivate, onUnlock, onLock, onDelete }: any) {
  const [open, setOpen] = useState(false);
  const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();
  const isActive = user.status === "ACTIVE";

  const items = [
    { label: "Edit Details",       icon: Edit2,    action: onEdit },
    { label: "Reset Password",     icon: KeyRound, action: onResetPw },
    { label: "Change Role",        icon: UserCog,  action: onChangeRole },
    isActive
      ? { label: "Deactivate",     icon: Ban,      action: onDeactivate }
      : { label: "Activate",       icon: UserCheck, action: onActivate },
    isLocked
      ? { label: "Unlock Account", icon: Unlock,   action: onUnlock }
      : { label: "Lock Account",   icon: Lock,     action: onLock },
    { label: "Delete User",        icon: Trash2,   action: onDelete, danger: true },
  ];

  return (
    <div className="relative">
      <button onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-muted hover:bg-muted/70">
        Actions <ChevronDown className="size-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-20 w-48 rounded-xl border bg-card shadow-lg overflow-hidden">
            {items.map((item) => (
              <button key={item.label}
                onClick={() => { setOpen(false); item.action(); }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-muted text-left transition ${(item as any).danger ? "text-destructive hover:bg-destructive/10" : ""}`}>
                <item.icon className="size-4" /> {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Create User Modal ────────────────────────────────────────────────────────

function CreateUserModal({ schoolId, schoolName, onClose, onSaved }: any) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "TEACHER" });
  const set = (k: string, v: string) => setForm((p: any) => ({ ...p, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/super-admin/schools/${schoolId}/users`, form);
      toast.success(`User "${form.name}" created`);
      onSaved();
    } catch (err: any) { toast.error(err.message ?? "Failed"); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Add User — ${schoolName}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={(e: any) => save(e)}><UserPlus className="w-4 h-4" /> Create User</Button></>}>
      <form onSubmit={save} className="grid sm:grid-cols-2 gap-4">
        <Field label="Full Name *"><TextInput required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Email *"><TextInput required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Password *"><TextInput required type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Min. 6 chars" /></Field>
        <Field label="Role *">
          <Select value={form.role} onChange={(e) => set("role", e.target.value)}>
            {["SCHOOL_ADMIN","ACCOUNTANT","TEACHER","RECEPTIONIST","PARENT"].map((r) => (
              <option key={r} value={r}>{r.replace("_", " ")}</option>
            ))}
          </Select>
        </Field>
        <p className="sm:col-span-2 text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
          The user will be able to log in immediately with these credentials. Share them securely.
        </p>
      </form>
    </Modal>
  );
}

// ─── Edit User Modal ──────────────────────────────────────────────────────────

function EditUserModal({ user, onClose, onSaved }: any) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: user.name, email: user.email });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/super-admin/users/${user.id}`, form);
      toast.success("User updated");
      onSaved();
    } catch (err: any) { toast.error(err.message ?? "Failed"); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Edit User — ${user.name}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={(e: any) => save(e)}><Edit2 className="w-4 h-4" /> Save</Button></>}>
      <form onSubmit={save} className="grid sm:grid-cols-2 gap-4">
        <Field label="Full Name"><TextInput value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></Field>
        <Field label="Email"><TextInput type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></Field>
      </form>
    </Modal>
  );
}

// ─── Reset Password Modal ──────────────────────────────────────────────────────

function ResetPasswordModal({ user, onClose, onSaved }: any) {
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState("");
  const [force, setForce] = useState(true);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setSaving(true);
    try {
      await api.patch(`/super-admin/users/${user.id}/reset-password`, { newPassword: pw, forceChange: force });
      toast.success("Password reset successfully");
      onSaved();
    } catch (err: any) { toast.error(err.message ?? "Failed"); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Reset Password — ${user.name}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={(e: any) => save(e)}><KeyRound className="w-4 h-4" /> Reset Password</Button></>}>
      <form onSubmit={save} className="space-y-4">
        <Field label="New Password *">
          <TextInput required type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Min. 6 characters" />
        </Field>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-sm">Force user to change password on next login</span>
        </label>
        <p className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
          The user will be logged out and required to set a new password when they next log in.
        </p>
      </form>
    </Modal>
  );
}

// ─── Change Role Modal ─────────────────────────────────────────────────────────

function ChangeRoleModal({ user, onClose, onSaved }: any) {
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState(user.role);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/super-admin/users/${user.id}/change-role`, { role });
      toast.success(`Role changed to ${role.replace("_", " ")}`);
      onSaved();
    } catch (err: any) { toast.error(err.message ?? "Failed"); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Change Role — ${user.name}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={(e: any) => save(e)}><UserCog className="w-4 h-4" /> Change Role</Button></>}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Current Role">
          <div className="text-sm font-semibold text-primary">{user.role?.replace("_", " ")}</div>
        </Field>
        <Field label="New Role *">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            {["SCHOOL_ADMIN","ACCOUNTANT","TEACHER","RECEPTIONIST","PARENT","STUDENT"].map((r) => (
              <option key={r} value={r}>{r.replace("_", " ")}</option>
            ))}
          </Select>
        </Field>
        <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
          Changing roles will immediately update the user's access permissions across the system.
        </p>
      </form>
    </Modal>
  );
}

// ─── User Status Modal ────────────────────────────────────────────────────────

function UserStatusModal({ entry, onClose, onSaved }: { entry: { user: any; action: string }; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const { user, action } = entry;

  const labels: Record<string, { title: string; desc: string; icon: any; color: string }> = {
    ACTIVATE:   { title: "Activate Account",   desc: `${user.name} will be able to log in again.`,                    icon: UserCheck, color: "text-green-600" },
    DEACTIVATE: { title: "Deactivate Account", desc: `${user.name} will no longer be able to log in.`,               icon: Ban,       color: "text-orange-600" },
    UNLOCK:     { title: "Unlock Account",     desc: `Remove the login lock from ${user.name}'s account.`,           icon: Unlock,    color: "text-blue-600" },
    LOCK:       { title: "Lock Account",       desc: `Prevent ${user.name} from logging in indefinitely.`,           icon: Lock,      color: "text-red-600" },
  };
  const info = labels[action] ?? labels["ACTIVATE"];

  const confirm = async () => {
    setSaving(true);
    try {
      await api.patch(`/super-admin/users/${user.id}/status`, { action });
      toast.success(info.title + " successful");
      onSaved();
    } catch (err: any) { toast.error(err.message ?? "Failed"); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={info.title}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={confirm}><info.icon className="w-4 h-4" /> Confirm</Button></>}>
      <div className="flex items-start gap-3 p-4 bg-muted/40 rounded-xl">
        <info.icon className={`w-8 h-8 mt-0.5 ${info.color}`} />
        <div>
          <p className="font-semibold">{user.name} <span className="text-muted-foreground">({user.email})</span></p>
          <p className="text-sm text-muted-foreground mt-1">{info.desc}</p>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHOOL ADMIN MANAGEMENT PANEL
// ─────────────────────────────────────────────────────────────────────────────

function SchoolAdminPanel({ schoolId, onRefresh }: { schoolId: string; onRefresh: () => void }) {
  const admins = useApiQuery<any>(`/super-admin/schools/${schoolId}/users`, { role: "SCHOOL_ADMIN" });
  const allUsers = useApiQuery<any>(`/super-admin/schools/${schoolId}/users`, { limit: 200 });
  const [changeModal, setChangeModal] = useState(false);
  const [promoteModal, setPromoteModal] = useState(false);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const adminRows = asList<any>((admins.data as any)?.data ?? admins.data);
  const allRows   = asList<any>((allUsers.data as any)?.data ?? allUsers.data);
  const nonAdmins = allRows.filter((u: any) => u.role !== "SCHOOL_ADMIN");

  const demote = async (userId: string, userName: string) => {
    setSaving((p) => ({ ...p, [userId]: true }));
    try {
      await api.patch(`/super-admin/users/${userId}/change-role`, { role: "ACCOUNTANT" });
      toast.success(`${userName} demoted to Accountant`);
      onRefresh();
    } catch (e: any) { toast.error(e.message); } finally { setSaving((p) => ({ ...p, [userId]: false })); }
  };

  const promote = async (userId: string) => {
    setSaving((p) => ({ ...p, [userId]: true }));
    try {
      await api.patch(`/super-admin/users/${userId}/change-role`, { role: "SCHOOL_ADMIN" });
      toast.success("User promoted to School Admin");
      onRefresh();
    } catch (e: any) { toast.error(e.message); } finally { setSaving((p) => ({ ...p, [userId]: false })); }
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> School Admin Management</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setPromoteModal(true)}>
            <UserCog className="w-3 h-3" /> Promote User
          </Button>
        </div>
      </div>

      {admins.loading ? <Skeleton className="h-10" /> : adminRows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No School Admins found for this school.</p>
      ) : (
        <div className="space-y-2">
          {adminRows.map((admin: any) => (
            <div key={admin.id} className="flex items-center justify-between bg-background rounded-lg px-3 py-2 border border-border">
              <div>
                <span className="font-medium text-sm">{admin.name}</span>
                <span className="text-xs text-muted-foreground ml-2">{admin.email}</span>
                <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded ml-2">ADMIN</span>
              </div>
              <div className="flex gap-2">
                <StatusBadge status={admin.status} />
                {adminRows.length > 1 && (
                  <Button size="sm" variant="outline" loading={saving[admin.id]}
                    onClick={() => demote(admin.id, admin.name)}
                    className="text-orange-600 border-orange-300 text-xs">
                    Demote
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Promote User Modal */}
      {promoteModal && (
        <Modal open onClose={() => setPromoteModal(false)} title="Promote User to School Admin"
          footer={<Button variant="outline" onClick={() => setPromoteModal(false)}>Close</Button>}>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {nonAdmins.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other users to promote.</p>
            ) : nonAdmins.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30">
                <div>
                  <p className="font-medium text-sm">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email} · {u.role?.replace("_"," ")}</p>
                </div>
                <Button size="sm" loading={saving[u.id]} onClick={async () => { await promote(u.id); setPromoteModal(false); }}>
                  <UserCheck className="w-3 h-3" /> Promote
                </Button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION TAB (per-school)
// ─────────────────────────────────────────────────────────────────────────────

function SchoolSubscriptionTab({ school, plans, onRefresh }: { school: any; plans: any[]; onRefresh: () => void }) {
  const sub = school.subscription;
  const [assignModal, setAssignModal] = useState(false);
  const [extendModal, setExtendModal] = useState(false);
  const [suspendBusy, setSuspendBusy] = useState(false);

  const toggleStatus = async () => {
    setSuspendBusy(true);
    try {
      const endpoint = school.status === "ACTIVE" ? "suspend" : "activate";
      await api.patch(`/super-admin/schools/${school.id}/${endpoint}`, {});
      toast.success(school.status === "ACTIVE" ? "School suspended" : "School activated");
      onRefresh();
    } catch (e: any) { toast.error(e.message); } finally { setSuspendBusy(false); }
  };

  const subFields = [
    { label: "Current Plan",    value: sub?.plan?.name ?? "No Plan" },
    { label: "Plan Tier",       value: sub?.plan?.tier ?? "—" },
    { label: "Status",          value: sub?.status ? <StatusBadge status={sub.status} /> : "—" },
    { label: "Start Date",      value: sub?.createdAt ? new Date(sub.createdAt).toLocaleDateString() : "—" },
    { label: "Expiry Date",     value: sub?.endDate   ? new Date(sub.endDate).toLocaleDateString()   : "—" },
    { label: "Monthly Price",   value: sub?.plan?.price ? `PKR ${Number(sub.plan.price).toLocaleString()}` : "—" },
    { label: "School Status",   value: <StatusBadge status={school.status} /> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {subFields.map((f) => (
          <div key={f.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{f.label}</p>
            <div className="font-medium">{f.value}</div>
          </div>
        ))}
      </div>

      <Card>
        <h3 className="font-semibold mb-4">Subscription Actions</h3>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setAssignModal(true)}>
            <Receipt className="w-4 h-4" /> {sub ? "Change Plan" : "Assign Plan"}
          </Button>
          <Button variant="outline" onClick={() => setExtendModal(true)}>
            <RefreshCw className="w-4 h-4" /> Extend Subscription
          </Button>
          <Button variant="outline" loading={suspendBusy} onClick={toggleStatus}
            className={school.status === "ACTIVE" ? "text-orange-600 border-orange-300" : "text-green-600 border-green-300"}>
            {school.status === "ACTIVE" ? <><Pause className="w-4 h-4" /> Suspend School</> : <><Play className="w-4 h-4" /> Activate School</>}
          </Button>
        </div>
      </Card>

      {assignModal && (
        <AssignPlanModal school={school} plans={plans}
          onClose={() => setAssignModal(false)} onSaved={() => { setAssignModal(false); onRefresh(); }} />
      )}
      {extendModal && (
        <ExtendModal school={school}
          onClose={() => setExtendModal(false)} onSaved={() => { setExtendModal(false); onRefresh(); }} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BILLING TAB (per-school)
// ─────────────────────────────────────────────────────────────────────────────

function SchoolBillingTab({ schoolId, schoolName }: { schoolId: string; schoolName: string }) {
  const invoices = useApiQuery<any>("/super-admin/billing", { schoolId, limit: 50 });
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ amount: "", period: "", dueDate: "", notes: "" });
  const rows = asList<any>(invoices.data);

  const markPaid = async (id: string) => {
    try {
      await api.patch(`/super-admin/billing/invoices/${id}/mark-paid`, {});
      toast.success("Invoice marked as paid");
      invoices.refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  const createInvoice = async () => {
    if (!form.amount || !form.period || !form.dueDate) return toast.error("Fill all required fields");
    setBusy(true);
    try {
      await api.post("/super-admin/billing/invoices", { schoolId, amount: Number(form.amount), period: form.period, dueDate: form.dueDate, notes: form.notes });
      toast.success("Invoice created");
      setInvoiceModal(false);
      invoices.refetch();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Invoices for {schoolName}</h3>
        <Button onClick={() => setInvoiceModal(true)}><Plus className="w-4 h-4" /> Create Invoice</Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {invoices.loading ? (
          <div className="p-6 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices for this school" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  {["Invoice #", "Period", "Amount", "Due Date", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((inv: any) => (
                  <tr key={inv.id} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs">{inv.invoiceNo}</td>
                    <td className="px-4 py-3 text-muted-foreground">{inv.period}</td>
                    <td className="px-4 py-3 font-semibold">{formatMoney(Number(inv.amount))}</td>
                    <td className="px-4 py-3 text-xs">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                    <td className="px-4 py-3">
                      {inv.status === "PENDING" && (
                        <Button size="sm" variant="outline" onClick={() => markPaid(inv.id)}>Mark Paid</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={invoiceModal} onClose={() => setInvoiceModal(false)} title={`Create Invoice — ${schoolName}`}
        footer={<><Button variant="outline" onClick={() => setInvoiceModal(false)}>Cancel</Button><Button onClick={createInvoice} loading={busy}>Create</Button></>}>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Amount (PKR) *"><TextInput type="number" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} placeholder="5000" /></Field>
          <Field label="Period *"><TextInput value={form.period} onChange={(e) => setForm((p) => ({ ...p, period: e.target.value }))} placeholder="Jul 2026" /></Field>
          <Field label="Due Date *"><TextInput type="date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} /></Field>
          <Field label="Notes"><TextInput value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional" /></Field>
        </div>
      </Modal>
    </div>
  );
}
