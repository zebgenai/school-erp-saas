import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck, RotateCcw, Save, CheckCircle2, XCircle,
  Info, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { toastSuccess, toastError } from "@/lib/errors";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PageHeader, Skeleton } from "@/components/ui-kit";
import { Button } from "@/components/form";
import { ConfirmDialog } from "@/components/Modal";
import { useApiQuery } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/roles")({
  head: () => ({ meta: [{ title: "Roles & Permissions — School ERP" }] }),
  component: () => <AppShell><RolesPage /></AppShell>,
});

// ─── constants (mirrors backend roles.constants.ts) ───────────────────────────

const MODULES: string[] = [
  "students", "parents", "teachers", "staff",
  "classes", "subjects", "attendance", "exams",
  "results", "fees", "payroll", "expenses",
  "library", "transport", "communication", "timetable",
  "reports", "settings",
];

const ACTIONS: string[] = ["view", "create", "edit", "delete", "export"];

const MODULE_LABELS: Record<string, string> = {
  students: "Students", parents: "Parents", teachers: "Teachers",
  staff: "Staff", classes: "Classes", subjects: "Subjects",
  attendance: "Attendance", exams: "Exams", results: "Results",
  fees: "Fees", payroll: "Payroll", expenses: "Expenses",
  library: "Library", transport: "Transport", communication: "Communication",
  timetable: "Timetable", reports: "Reports", settings: "Settings",
};

const ACTION_LABELS: Record<string, string> = {
  view: "View", create: "Create", edit: "Edit", delete: "Delete", export: "Export",
};

// ─── types ────────────────────────────────────────────────────────────────────

interface RoleData {
  role: string;
  label: string;
  editable: boolean;
  fixedFullAccess: boolean;
  permissions: Record<string, boolean>;
}

interface Matrix {
  modules: string[];
  actions: string[];
  roles: RoleData[];
}

// ─── main page ────────────────────────────────────────────────────────────────

function RolesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "SCHOOL_ADMIN" || user?.role === "SUPER_ADMIN";

  const matrix = useApiQuery<Matrix>("/roles/matrix");
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const [localPerms, setLocalPerms] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  const roles = matrix.data?.roles ?? [];

  // Set default active role when data loads
  useEffect(() => {
    if (roles.length && !activeRole) {
      const firstEditable = roles.find((r) => r.editable);
      setActiveRole(firstEditable?.role ?? roles[0]?.role ?? null);
    }
  }, [roles, activeRole]);

  // Sync local permissions when active role changes
  useEffect(() => {
    if (!activeRole) return;
    const rd = roles.find((r) => r.role === activeRole);
    if (rd) { setLocalPerms({ ...rd.permissions }); setDirty(false); }
  }, [activeRole, matrix.data]);

  const togglePerm = useCallback((key: string) => {
    setLocalPerms((prev) => { const next = { ...prev, [key]: !prev[key] }; setDirty(true); return next; });
  }, []);

  const toggleModule = useCallback((mod: string) => {
    const keys = ACTIONS.map((a) => `${mod}.${a}`);
    const allOn = keys.every((k) => localPerms[k]);
    setLocalPerms((prev) => {
      const next = { ...prev };
      keys.forEach((k) => { next[k] = !allOn; });
      setDirty(true);
      return next;
    });
  }, [localPerms]);

  const toggleAction = useCallback((action: string) => {
    const keys = MODULES.map((m) => `${m}.${action}`);
    const allOn = keys.every((k) => localPerms[k]);
    setLocalPerms((prev) => {
      const next = { ...prev };
      keys.forEach((k) => { next[k] = !allOn; });
      setDirty(true);
      return next;
    });
  }, [localPerms]);

  const save = async () => {
    if (!activeRole) return;
    setSaving(true);
    try {
      await api.put(`/roles/${activeRole}/permissions`, { role: activeRole, permissions: localPerms });
      toast.success("Permissions saved");
      setDirty(false);
      matrix.refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally { setSaving(false); }
  };

  const reset = async () => {
    if (!activeRole) return;
    setResetting(true);
    try {
      await api.delete(`/roles/${activeRole}/permissions`);
      toastSuccess("Permissions reset to defaults");
      setDirty(false);
      matrix.refetch();
    } catch (e: any) {
      toastError(e, "Reset failed");
    } finally { setResetting(false); setResetConfirm(false); }
  };

  const activeRoleData = roles.find((r) => r.role === activeRole);
  const isEditable = isAdmin && (activeRoleData?.editable ?? false);

  if (matrix.loading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & Permissions"
        description="View and manage what each role can do across all modules."
      />

      {/* Role selector tabs */}
      <div className="flex gap-2 flex-wrap">
        {roles.map((r) => (
          <button
            key={r.role}
            onClick={() => { if (dirty && !confirm("Discard unsaved changes?")) return; setActiveRole(r.role); }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all",
              activeRole === r.role
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "border-border hover:border-primary/40 hover:bg-muted/50 text-muted-foreground",
            )}
          >
            {r.fixedFullAccess ? <Lock className="w-3.5 h-3.5 opacity-70" /> : <ShieldCheck className="w-3.5 h-3.5 opacity-70" />}
            {r.label}
            {r.fixedFullAccess && (
              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60 ml-1">Full</span>
            )}
          </button>
        ))}
      </div>

      {/* Fixed-access notice */}
      {activeRoleData?.fixedFullAccess && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-sm">
          <Info className="w-4 h-4 flex-shrink-0" />
          <span><strong>{activeRoleData.label}</strong> has full access to all modules and actions. These permissions cannot be modified.</span>
        </div>
      )}

      {/* Non-admin notice */}
      {!isAdmin && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-sm">
          <Info className="w-4 h-4 flex-shrink-0" />
          <span>You have read-only access to this page. Only School Admin can modify permissions.</span>
        </div>
      )}

      {/* Permission Matrix */}
      {activeRole && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
            <div>
              <h2 className="font-semibold text-foreground">{activeRoleData?.label} — Permission Matrix</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isEditable ? "Click checkboxes to toggle. Click row/column headers to toggle all." : "Read-only view."}
              </p>
            </div>
            {isEditable && (
              <div className="flex gap-2">
                {dirty && (
                  <Button size="sm" onClick={save} loading={saving}>
                    <Save className="w-3.5 h-3.5" /> Save Changes
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setResetConfirm(true)} loading={resetting}>
                  <RotateCcw className="w-3.5 h-3.5" /> Reset Defaults
                </Button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  {/* Module column header */}
                  <th className="px-5 py-3 text-left font-semibold text-foreground border-b border-border w-40 sticky left-0 bg-muted/50 z-10">
                    Module
                  </th>
                  {/* Action column headers */}
                  {ACTIONS.map((action) => {
                    const keys = MODULES.map((m) => `${m}.${action}`);
                    const allOn = keys.every((k) => localPerms[k]);
                    const someOn = keys.some((k) => localPerms[k]);
                    return (
                      <th key={action} className="px-3 py-3 text-center font-semibold text-foreground border-b border-border min-w-[90px]">
                        <div className="flex flex-col items-center gap-1">
                          <span>{ACTION_LABELS[action]}</span>
                          {isEditable && (
                            <button
                              onClick={() => toggleAction(action)}
                              title={`Toggle all ${action}`}
                              className={cn(
                                "w-5 h-5 rounded border-2 transition-all flex items-center justify-center",
                                allOn
                                  ? "bg-primary border-primary text-primary-foreground"
                                  : someOn
                                  ? "bg-primary/30 border-primary/50"
                                  : "bg-background border-muted-foreground/40 hover:border-primary/60",
                              )}
                            >
                              {allOn && <CheckCircle2 className="w-3 h-3" />}
                            </button>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  {/* Row completion summary */}
                  <th className="px-3 py-3 text-center font-medium text-muted-foreground border-b border-border w-20">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {MODULES.map((mod, i) => {
                  const keys = ACTIONS.map((a) => `${mod}.${a}`);
                  const onCount = keys.filter((k) => localPerms[k]).length;
                  const allOn = onCount === ACTIONS.length;
                  const noneOn = onCount === 0;
                  return (
                    <tr
                      key={mod}
                      className={cn(
                        "border-b border-border transition-colors",
                        i % 2 === 0 ? "bg-background" : "bg-muted/20",
                        "hover:bg-primary/5",
                      )}
                    >
                      {/* Module name (clickable to toggle row) */}
                      <td className="px-5 py-3 sticky left-0 z-10 border-r border-border bg-inherit">
                        <button
                          disabled={!isEditable}
                          onClick={() => toggleModule(mod)}
                          className={cn(
                            "flex items-center gap-2 font-medium transition-colors w-full text-left",
                            isEditable ? "hover:text-primary cursor-pointer" : "cursor-default",
                            allOn ? "text-foreground" : noneOn ? "text-muted-foreground" : "text-foreground/80",
                          )}
                        >
                          <span className={cn(
                            "w-2 h-2 rounded-full flex-shrink-0",
                            allOn ? "bg-green-500" : noneOn ? "bg-muted-foreground/30" : "bg-amber-400",
                          )} />
                          {MODULE_LABELS[mod] ?? mod}
                        </button>
                      </td>

                      {/* Per-action checkboxes */}
                      {ACTIONS.map((action) => {
                        const key = `${mod}.${action}`;
                        const on = localPerms[key] ?? false;
                        return (
                          <td key={action} className="px-3 py-3 text-center">
                            {isEditable ? (
                              <button
                                onClick={() => togglePerm(key)}
                                className={cn(
                                  "w-6 h-6 rounded-md border-2 mx-auto flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-primary/50",
                                  on
                                    ? "bg-primary border-primary text-primary-foreground shadow-sm"
                                    : "bg-background border-muted-foreground/30 hover:border-primary/60 hover:bg-primary/5",
                                )}
                                title={`${on ? "Revoke" : "Grant"} ${action} on ${mod}`}
                              >
                                {on ? (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 opacity-20" />
                                )}
                              </button>
                            ) : (
                              <span className="flex justify-center">
                                {on ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-muted-foreground/30" />
                                )}
                              </span>
                            )}
                          </td>
                        );
                      })}

                      {/* Row summary badge */}
                      <td className="px-3 py-3 text-center">
                        <span className={cn(
                          "inline-flex items-center justify-center min-w-[3rem] px-2 py-0.5 rounded-full text-xs font-semibold",
                          onCount === 0
                            ? "bg-muted text-muted-foreground"
                            : onCount === ACTIONS.length
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                        )}>
                          {onCount}/{ACTIONS.length}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals footer */}
              <tfoot>
                <tr className="bg-muted/40 border-t-2 border-border">
                  <td className="px-5 py-3 font-semibold text-foreground sticky left-0 bg-muted/40 border-r border-border z-10">
                    Column Total
                  </td>
                  {ACTIONS.map((action) => {
                    const keys = MODULES.map((m) => `${m}.${action}`);
                    const count = keys.filter((k) => localPerms[k]).length;
                    return (
                      <td key={action} className="px-3 py-3 text-center">
                        <span className={cn(
                          "inline-flex items-center justify-center min-w-[3rem] px-2 py-0.5 rounded-full text-xs font-semibold",
                          count === 0
                            ? "bg-muted text-muted-foreground"
                            : count === MODULES.length
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                        )}>
                          {count}/{MODULES.length}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-center">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {Object.values(localPerms).filter(Boolean).length}/{MODULES.length * ACTIONS.length}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Save bar (sticky bottom) */}
          {isEditable && dirty && (
            <div className="sticky bottom-0 flex items-center justify-between px-5 py-3 bg-background border-t border-border shadow-lg">
              <p className="text-sm text-muted-foreground">You have unsaved permission changes.</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                  const rd = roles.find((r) => r.role === activeRole);
                  if (rd) { setLocalPerms({ ...rd.permissions }); setDirty(false); }
                }}>Discard</Button>
                <Button size="sm" onClick={save} loading={saving}>
                  <Save className="w-3.5 h-3.5" /> Save Changes
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> Full access</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> Partial access</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-muted-foreground/30" /> No access</span>
        {isAdmin && <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border-2 border-primary bg-primary" /><CheckCircle2 className="w-3 h-3 text-primary-foreground -ml-3" /> Granted</span>}
      </div>

      <ConfirmDialog open={resetConfirm} onClose={() => setResetConfirm(false)} onConfirm={reset}
        title="Reset permissions?" message="Reset permissions to system defaults? This cannot be undone."
        confirmText="Reset" loading={resetting} />
    </div>
  );
}
