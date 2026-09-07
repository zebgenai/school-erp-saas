import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Building2, CheckCircle2, Edit2, KeyRound, Lock, Plus,
  RotateCcw, Save, Search, ShieldCheck, Trash2, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, EmptyState, Skeleton, StatusBadge } from "@/components/ui-kit";
import { Button, Field, Select, TextInput, Textarea } from "@/components/form";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { useApiQuery, asList } from "@/lib/hooks";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const MODULE_LABELS: Record<string, string> = {
  students: "Students",
  parents: "Parents",
  teachers: "Teachers",
  staff: "Staff",
  classes: "Classes",
  subjects: "Subjects",
  attendance: "Attendance",
  exams: "Exams",
  results: "Results",
  fees: "Fees",
  payroll: "Payroll",
  expenses: "Expenses",
  library: "Library",
  transport: "Transport",
  communication: "Communication",
  notifications: "Notifications",
  homework: "Homework",
  "online-classes": "Online Classes",
  "academic-calendar": "Academic Calendar",
  timetable: "Timetable",
  reports: "Reports",
  settings: "Settings",
};

const ACTION_LABELS: Record<string, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  export: "Export",
};

type RoleChip = {
  key: string;
  label: string;
  type: "system" | "custom";
  userCount: number;
  baseRole?: string;
  isActive?: boolean;
};

type SchoolRoleRow = {
  schoolId: string;
  schoolName: string;
  status: string;
  systemRoleCount: number;
  customRoleCount: number;
  totalRoles: number;
  totalUsers: number;
  roles: RoleChip[];
};

type SystemRole = {
  role: string;
  label: string;
  type: "system";
  editable: boolean;
  fixedFullAccess: boolean;
  customized: boolean;
  removed?: boolean;
  removable?: boolean;
  userCount: number;
  permissionCount: number;
  permissionTotal: number;
  permissions: Record<string, boolean>;
};

type CustomRole = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  baseRole: string;
  baseRoleLabel: string;
  type: "custom";
  isActive: boolean;
  userCount: number;
  permissionCount: number;
  permissionTotal: number;
  permissions: Record<string, boolean>;
};

type SchoolRolesPayload = {
  school: { id: string; name: string; status: string };
  modules: string[];
  actions: string[];
  systemRoles: SystemRole[];
  customRoles: CustomRole[];
  baseRoles: { role: string; label: string }[];
};

type PendingRemove =
  | { kind: "custom"; role: CustomRole }
  | { kind: "system"; role: SystemRole };

type EditorTarget =
  | { kind: "create" }
  | { kind: "custom"; role: CustomRole }
  | { kind: "system"; role: SystemRole };

export function RolesManagementTab() {
  const [search, setSearch] = useState("");
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const overview = useApiQuery<{ totalSchools: number; totalCustomRoles: number; data: SchoolRoleRow[] }>(
    "/super-admin/roles/overview",
  );
  const allRows = asList<SchoolRoleRow>(overview.data?.data ?? overview.data);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter((r) => r.schoolName.toLowerCase().includes(q));
  }, [allRows, search]);

  if (schoolId) {
    return (
      <SchoolRolesDetail
        schoolId={schoolId}
        onBack={() => setSchoolId(null)}
        onChanged={() => overview.refetch()}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-3 gap-4">
        <SummaryCard icon={Building2} label="Schools" value={overview.data?.totalSchools ?? rows.length} loading={overview.loading} />
        <SummaryCard icon={ShieldCheck} label="System roles / school" value={6} loading={overview.loading} />
        <SummaryCard icon={KeyRound} label="Custom roles (all schools)" value={overview.data?.totalCustomRoles ?? 0} loading={overview.loading} />
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <TextInput
          className="pl-9"
          placeholder="Search schools…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {overview.loading ? (
        <Skeleton className="h-72" />
      ) : allRows.length === 0 ? (
        <EmptyState icon={KeyRound} title="No schools found" description="Create a school first, then manage its roles here." />
      ) : rows.length === 0 ? (
        <EmptyState icon={Search} title="No matching schools" description="Try a different search." />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground bg-muted/40">
                  <th className="px-4 py-3 font-semibold">School</th>
                  <th className="px-4 py-3 font-semibold">Roles</th>
                  <th className="px-4 py-3 font-semibold">Which roles</th>
                  <th className="px-4 py-3 font-semibold text-right">Users</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.schoolId} className="border-t border-border/70 hover:bg-muted/30">
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium">{row.schoolName}</div>
                      <div className="mt-1"><StatusBadge status={row.status} /></div>
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <div className="font-semibold">{row.totalRoles}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.systemRoleCount} system · {row.customRoleCount} custom
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5 max-w-xl">
                        {row.roles.map((role) => (
                          <span
                            key={role.key}
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border",
                              role.type === "custom"
                                ? "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20"
                                : "bg-muted text-foreground/80 border-border",
                            )}
                            title={`${role.userCount} user(s)`}
                          >
                            {role.label}
                            <span className="opacity-60">{role.userCount}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right align-top font-medium">{row.totalUsers}</td>
                    <td className="px-4 py-3 text-right align-top">
                      <Button size="sm" variant="outline" onClick={() => setSchoolId(row.schoolId)}>
                        Manage
                      </Button>
                    </td>
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

function SummaryCard({ icon: Icon, label, value, loading }: { icon: any; label: string; value: number; loading: boolean }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className="size-11 rounded-2xl grid place-items-center bg-primary/10 text-primary">
        <Icon className="size-5" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground font-medium">{label}</div>
        <div className="text-2xl font-bold mt-0.5">{loading ? <Skeleton className="h-7 w-12" /> : value}</div>
      </div>
    </Card>
  );
}

function SchoolRolesDetail({
  schoolId,
  onBack,
  onChanged,
}: {
  schoolId: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const detail = useApiQuery<SchoolRolesPayload>(`/super-admin/schools/${schoolId}/roles`);
  const data = detail.data;
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [pendingRemove, setPendingRemove] = useState<PendingRemove | null>(null);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    if (!pendingRemove) return;
    setDeleting(true);
    try {
      if (pendingRemove.kind === "custom") {
        const res = await api.delete<{ message?: string }>(
          `/super-admin/schools/${schoolId}/roles/${pendingRemove.role.id}`,
        );
        toast.success(res?.message || "Role removed");
      } else {
        const res = await api.delete<{ message?: string }>(
          `/super-admin/schools/${schoolId}/system-roles/${pendingRemove.role.role}`,
        );
        toast.success(res?.message || "Role removed from this school");
      }
      setPendingRemove(null);
      setEditor(null);
      detail.refetch();
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Could not remove role");
    } finally {
      setDeleting(false);
    }
  };

  const restoreSystem = async (role: SystemRole) => {
    try {
      const res = await api.post<{ message?: string }>(
        `/super-admin/schools/${schoolId}/system-roles/${role.role}/restore`,
      );
      toast.success(res?.message || "Role restored");
      detail.refetch();
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Could not restore role");
    }
  };

  if (detail.loading && !data) return <Skeleton className="h-96" />;
  if (!data) {
    return (
      <EmptyState
        icon={KeyRound}
        title="Could not load roles"
        description={detail.error || "Try again."}
        action={<Button variant="outline" onClick={onBack}>Back</Button>}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-1">
            <ArrowLeft className="size-4" /> All schools
          </button>
          <h2 className="text-xl font-semibold">{data.school.name}</h2>
          <p className="text-sm text-muted-foreground">
            {data.systemRoles.filter((r) => !r.removed).length} system roles · {data.customRoles.length} custom roles
          </p>
        </div>
        <Button onClick={() => setEditor({ kind: "create" })}>
          <Plus className="size-4" /> Create Role
        </Button>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">System roles</h3>
        <RoleTable
          rows={data.systemRoles.filter((r) => !r.removed).map((r) => ({
            id: r.role,
            name: r.label,
            typeLabel: "System",
            meta: r.fixedFullAccess ? "Full access" : r.customized ? "Customized" : "Default",
            userCount: r.userCount,
            permissionCount: r.permissionCount,
            permissionTotal: r.permissionTotal,
            locked: r.fixedFullAccess,
            onEdit: () => setEditor({ kind: "system", role: r }),
            onDelete: r.removable ? () => setPendingRemove({ kind: "system", role: r }) : undefined,
          }))}
        />
      </section>

      {data.systemRoles.some((r) => r.removed) && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Removed from this school</h3>
          <RoleTable
            rows={data.systemRoles.filter((r) => r.removed).map((r) => ({
              id: r.role,
              name: r.label,
              typeLabel: "Removed",
              meta: "Not available to assign",
              userCount: r.userCount,
              permissionCount: r.permissionCount,
              permissionTotal: r.permissionTotal,
              locked: true,
              onEdit: () => setEditor({ kind: "system", role: r }),
              onRestore: () => restoreSystem(r),
            }))}
          />
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Custom roles</h3>
        {data.customRoles.length === 0 ? (
          <Card>
            <EmptyState
              icon={KeyRound}
              title="No custom roles yet"
              description="Create a school-specific role with its own name and permissions. Only Super Admin can do this."
              action={<Button onClick={() => setEditor({ kind: "create" })}><Plus className="size-4" /> Create Role</Button>}
            />
          </Card>
        ) : (
          <RoleTable
            rows={data.customRoles.map((r) => ({
              id: r.id,
              name: r.name,
              typeLabel: r.isActive ? "Custom" : "Inactive",
              meta: `Based on ${r.baseRoleLabel}`,
              userCount: r.userCount,
              permissionCount: r.permissionCount,
              permissionTotal: r.permissionTotal,
              onEdit: () => setEditor({ kind: "custom", role: r }),
              onDelete: () => setPendingRemove({ kind: "custom", role: r }),
            }))}
          />
        )}
      </section>

      {editor && (
        <RoleEditorModal
          schoolId={schoolId}
          data={data}
          target={editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            detail.refetch();
            onChanged();
          }}
          onRemove={
            editor.kind === "custom"
              ? () => {
                  setPendingRemove({ kind: "custom", role: editor.role });
                  setEditor(null);
                }
              : editor.kind === "system" && editor.role.removable && !editor.role.removed
                ? () => {
                    setPendingRemove({ kind: "system", role: editor.role });
                    setEditor(null);
                  }
                : undefined
          }
        />
      )}

      <ConfirmDialog
        open={!!pendingRemove}
        onClose={() => setPendingRemove(null)}
        onConfirm={remove}
        title="Remove this role?"
        message={
          pendingRemove?.kind === "custom"
            ? pendingRemove.role.userCount > 0
              ? `Remove "${pendingRemove.role.name}" from ${data.school.name}? ${pendingRemove.role.userCount} user(s) will be moved back to ${pendingRemove.role.baseRoleLabel}.`
              : `Remove "${pendingRemove.role.name}" from ${data.school.name}? This cannot be undone.`
            : pendingRemove?.kind === "system"
              ? `Remove ${pendingRemove.role.label} from ${data.school.name}? ${
                  pendingRemove.role.userCount > 0
                    ? `${pendingRemove.role.userCount} user(s) will keep this role until you change them. `
                    : ""
                }It will no longer be available to assign at this school. You can restore it later.`
              : ""
        }
        confirmText="Remove role"
        loading={deleting}
      />
    </div>
  );
}

function RoleTable({
  rows,
}: {
  rows: {
    id: string;
    name: string;
    typeLabel: string;
    meta: string;
    userCount: number;
    permissionCount: number;
    permissionTotal: number;
    locked?: boolean;
    onEdit: () => void;
    onDelete?: () => void;
    onRestore?: () => void;
  }[];
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground bg-muted/40">
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Users</th>
              <th className="px-4 py-3 font-semibold">Permissions</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border/70">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-medium">
                    {row.locked ? <Lock className="size-3.5 text-muted-foreground" /> : <ShieldCheck className="size-3.5 text-muted-foreground" />}
                    {row.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {row.typeLabel} · {row.meta}
                  </div>
                </td>
                <td className="px-4 py-3">{row.userCount}</td>
                <td className="px-4 py-3">
                  {row.permissionCount}/{row.permissionTotal}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={row.onEdit}>
                      {row.locked && !row.onRestore ? <><Lock className="size-3.5" /> View</> : <><Edit2 className="size-3.5" /> Edit</>}
                    </Button>
                    {row.onRestore && (
                      <Button size="sm" variant="outline" onClick={row.onRestore}>
                        <RotateCcw className="size-3.5" /> Restore
                      </Button>
                    )}
                    {row.onDelete && (
                      <Button size="sm" variant="outline" onClick={row.onDelete} className="text-destructive hover:bg-destructive/10">
                        <Trash2 className="size-3.5" /> Remove
                      </Button>
                    )}
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

function RoleEditorModal({
  schoolId,
  data,
  target,
  onClose,
  onSaved,
  onRemove,
}: {
  schoolId: string;
  data: SchoolRolesPayload;
  target: EditorTarget;
  onClose: () => void;
  onSaved: () => void;
  onRemove?: () => void;
}) {
  const isCreate = target.kind === "create";
  const isCustom = target.kind === "custom" || isCreate;
  const systemRole = target.kind === "system" ? target.role : null;
  const customRole = target.kind === "custom" ? target.role : null;
  const readOnly = Boolean(systemRole?.fixedFullAccess);

  const modules = data.modules ?? [];
  const actions = data.actions ?? [];

  const [name, setName] = useState(customRole?.name ?? "");
  const [description, setDescription] = useState(customRole?.description ?? "");
  const [baseRole, setBaseRole] = useState(customRole?.baseRole ?? data.baseRoles[0]?.role ?? "TEACHER");
  const [isActive, setIsActive] = useState(customRole?.isActive ?? true);
  const [perms, setPerms] = useState<Record<string, boolean>>(
    customRole?.permissions ?? systemRole?.permissions ?? {},
  );
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!isCreate) return;
    const match = data.systemRoles.find((r) => r.role === baseRole);
    if (match) setPerms({ ...match.permissions });
  }, [baseRole, isCreate, data.systemRoles]);

  const title = isCreate
    ? `Create role — ${data.school.name}`
    : systemRole
      ? `Edit ${systemRole.label}`
      : `Edit ${customRole?.name}`;

  const togglePerm = useCallback((key: string) => {
    if (readOnly) return;
    setPerms((prev) => ({ ...prev, [key]: !prev[key] }));
  }, [readOnly]);

  const toggleModule = useCallback((mod: string) => {
    if (readOnly) return;
    const keys = actions.map((a) => `${mod}.${a}`);
    const allOn = keys.every((k) => perms[k]);
    setPerms((prev) => {
      const next = { ...prev };
      keys.forEach((k) => { next[k] = !allOn; });
      return next;
    });
  }, [actions, perms, readOnly]);

  const toggleAction = useCallback((action: string) => {
    if (readOnly) return;
    const keys = modules.map((m) => `${m}.${action}`);
    const allOn = keys.every((k) => perms[k]);
    setPerms((prev) => {
      const next = { ...prev };
      keys.forEach((k) => { next[k] = !allOn; });
      return next;
    });
  }, [modules, perms, readOnly]);

  const save = async () => {
    if (readOnly) return;
    if (isCustom && name.trim().length < 2) return toast.error("Role name is required");
    setSaving(true);
    try {
      if (isCreate) {
        await api.post(`/super-admin/schools/${schoolId}/roles`, {
          name: name.trim(),
          description: description.trim() || undefined,
          baseRole,
          permissions: perms,
        });
        toast.success("Role created");
      } else if (customRole) {
        await api.patch(`/super-admin/schools/${schoolId}/roles/${customRole.id}`, {
          name: name.trim(),
          description: description.trim(),
          baseRole,
          permissions: perms,
          isActive,
        });
        toast.success("Role updated");
      } else if (systemRole) {
        await api.put(`/super-admin/schools/${schoolId}/system-roles/${systemRole.role}/permissions`, {
          permissions: perms,
        });
        toast.success("Permissions saved");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!systemRole) return;
    setResetting(true);
    try {
      await api.delete(`/super-admin/schools/${schoolId}/system-roles/${systemRole.role}/permissions`);
      toast.success("Reset to defaults");
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  const granted = useMemo(() => Object.values(perms).filter(Boolean).length, [perms]);

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={readOnly ? "This role always has full access and cannot be changed." : "Super Admin only — changes apply to this school."}
      size="xl"
      footer={
        <>
          {onRemove && (
            <Button variant="outline" onClick={onRemove} className="mr-auto text-destructive hover:bg-destructive/10">
              <Trash2 className="size-3.5" /> Remove role
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {systemRole && systemRole.editable && (
            <Button variant="outline" onClick={reset} loading={resetting}>
              <RotateCcw className="size-3.5" /> Reset defaults
            </Button>
          )}
          {!readOnly && (
            <Button onClick={save} loading={saving}>
              <Save className="size-3.5" /> {isCreate ? "Create Role" : "Save"}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {isCustom && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Role name *">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Librarian" />
            </Field>
            <Field label="Inherits from">
              <Select value={baseRole} onChange={(e) => setBaseRole(e.target.value)}>
                {data.baseRoles.map((r) => (
                  <option key={r.role} value={r.role}>{r.label}</option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description">
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this role is for…" />
              </Field>
            </div>
            {!isCreate && (
              <Field label="Status">
                <Select value={isActive ? "active" : "inactive"} onChange={(e) => setIsActive(e.target.value === "active")}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </Field>
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Permission matrix</span>
          <span className="text-muted-foreground">{granted} granted</span>
        </div>

        <PermissionMatrix
          modules={modules}
          actions={actions}
          perms={perms}
          editable={!readOnly}
          onTogglePerm={togglePerm}
          onToggleModule={toggleModule}
          onToggleAction={toggleAction}
        />
      </div>
    </Modal>
  );
}

function PermissionMatrix({
  modules,
  actions,
  perms,
  editable,
  onTogglePerm,
  onToggleModule,
  onToggleAction,
}: {
  modules: string[];
  actions: string[];
  perms: Record<string, boolean>;
  editable: boolean;
  onTogglePerm: (key: string) => void;
  onToggleModule: (mod: string) => void;
  onToggleAction: (action: string) => void;
}) {
  return (
    <div className="overflow-x-auto border border-border rounded-xl">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted/50">
            <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-muted/50 z-10">Module</th>
            {actions.map((action) => {
              const keys = modules.map((m) => `${m}.${action}`);
              const allOn = keys.length > 0 && keys.every((k) => perms[k]);
              const someOn = keys.some((k) => perms[k]);
              return (
                <th key={action} className="px-2 py-2 text-center font-semibold min-w-[76px]">
                  <div className="flex flex-col items-center gap-1">
                    <span>{ACTION_LABELS[action] ?? action}</span>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => onToggleAction(action)}
                        className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center",
                          allOn ? "bg-primary border-primary text-primary-foreground" : someOn ? "bg-primary/30 border-primary/50" : "bg-background border-muted-foreground/40",
                        )}
                      >
                        {allOn && <CheckCircle2 className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {modules.map((mod, i) => {
            const keys = actions.map((a) => `${mod}.${a}`);
            const onCount = keys.filter((k) => perms[k]).length;
            const allOn = onCount === actions.length && actions.length > 0;
            const noneOn = onCount === 0;
            return (
              <tr key={mod} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                <td className="px-3 py-2 sticky left-0 bg-inherit border-r border-border">
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => onToggleModule(mod)}
                    className={cn(
                      "flex items-center gap-2 font-medium text-left",
                      editable ? "hover:text-primary" : "cursor-default",
                      noneOn && "text-muted-foreground",
                    )}
                  >
                    <span className={cn("w-2 h-2 rounded-full", allOn ? "bg-green-500" : noneOn ? "bg-muted-foreground/30" : "bg-amber-400")} />
                    {MODULE_LABELS[mod] ?? mod}
                  </button>
                </td>
                {actions.map((action) => {
                  const key = `${mod}.${action}`;
                  const on = perms[key] ?? false;
                  return (
                    <td key={action} className="px-2 py-2 text-center">
                      {editable ? (
                        <button
                          type="button"
                          onClick={() => onTogglePerm(key)}
                          className={cn(
                            "w-6 h-6 rounded-md border-2 mx-auto flex items-center justify-center",
                            on ? "bg-primary border-primary text-primary-foreground" : "bg-background border-muted-foreground/30",
                          )}
                        >
                          {on ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-20" />}
                        </button>
                      ) : (
                        <span className="flex justify-center">
                          {on ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-muted-foreground/30" />}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
