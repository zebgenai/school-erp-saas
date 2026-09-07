import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Users, Plus, Search, Edit2, Trash2, Eye, KeyRound, UserCog,
  UserCheck, Ban, Unlock, Lock, ChevronDown, UserPlus, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PageHeader, Skeleton, EmptyState, StatusBadge } from "@/components/ui-kit";
import { Button, Field, Select, TextInput } from "@/components/form";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { useApiQuery, asList } from "@/lib/hooks";
import { api } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/users")({
  head: () => ({ meta: [{ title: "User Management — School ERP" }] }),
  component: () => <AppShell><UserManagementGuard /></AppShell>,
});

const TABS = [
  { id: "SCHOOL_ADMIN", label: "School Admins" },
  { id: "TEACHER", label: "Teachers" },
  { id: "ACCOUNTANT", label: "Accountants" },
  { id: "RECEPTIONIST", label: "Receptionists" },
  { id: "PARENT", label: "Parents" },
] as const;

const CREATE_ROLES = ["SCHOOL_ADMIN", "ACCOUNTANT", "TEACHER", "RECEPTIONIST", "PARENT"];
const CHANGE_ROLES = ["SCHOOL_ADMIN", "ACCOUNTANT", "TEACHER", "RECEPTIONIST", "PARENT"];

function UserManagementGuard() {
  const { can } = usePermissions();
  if (!can("users.view")) {
    return (
      <EmptyState icon={ShieldCheck} title="Access denied"
        description="Only School Administrators can manage users." />
    );
  }
  return <UserManagement />;
}

function UserManagement() {
  const { can } = usePermissions();
  const canManage = can("users.manage");
  const [tab, setTab] = useState<string>("SCHOOL_ADMIN");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const users = useApiQuery<any>("/users", {
    role: tab,
    search: search || undefined,
    status: statusFilter || undefined,
    limit: PAGE_SIZE,
    skip: page * PAGE_SIZE,
  });

  const [createModal, setCreateModal] = useState(false);
  const [viewModal, setViewModal] = useState<any | null>(null);
  const [editModal, setEditModal] = useState<any | null>(null);
  const [resetPwModal, setResetPwModal] = useState<any | null>(null);
  const [changeRoleModal, setChangeRoleModal] = useState<any | null>(null);
  const [statusModal, setStatusModal] = useState<{ user: any; action: string } | null>(null);
  const [deleteModal, setDeleteModal] = useState<any | null>(null);

  const rows = asList<any>((users.data as any)?.data ?? users.data);
  const total = (users.data as any)?.total ?? rows.length;
  const refetch = () => users.refetch();

  return (
    <div>
      <PageHeader
        title="User Management"
        description="Create and manage login accounts for your school staff and parents."
        actions={canManage ? (
          <Button onClick={() => setCreateModal(true)}>
            <UserPlus className="size-4" /> Add User
          </Button>
        ) : undefined}
      />

      <div className="inline-flex gap-1 p-1 bg-muted rounded-xl mb-4 flex-wrap">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setPage(0); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t.id ? "bg-card shadow-soft" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <Card className="mb-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <TextInput placeholder="Search name, email or phone…" className="pl-10"
              value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          </div>
          <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {users.loading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title="No users found" description={`No ${TABS.find((t) => t.id === tab)?.label.toLowerCase()} yet.`}
            action={canManage ? (
              <Button onClick={() => setCreateModal(true)}><Plus className="size-4" /> Add User</Button>
            ) : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  {["Name", "Email", "Role", "Status", "Created", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((u: any) => (
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
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {canManage ? (
                        <UserActionMenu
                          user={u}
                          onView={() => setViewModal(u)}
                          onEdit={() => setEditModal(u)}
                          onResetPw={() => setResetPwModal(u)}
                          onChangePw={() => setResetPwModal(u)}
                          onForcePwChange={async () => {
                            try {
                              await api.patch(`/users/${u.id}`, { forcePasswordChange: true });
                              toast.success("User must change password on next login");
                              refetch();
                            } catch (e: any) { toast.error(e.message); }
                          }}
                          onChangeRole={() => setChangeRoleModal(u)}
                          onActivate={() => setStatusModal({ user: u, action: "ACTIVATE" })}
                          onDeactivate={() => setStatusModal({ user: u, action: "DEACTIVATE" })}
                          onUnlock={() => setStatusModal({ user: u, action: "UNLOCK" })}
                          onLock={() => setStatusModal({ user: u, action: "LOCK" })}
                          onDelete={() => setDeleteModal(u)}
                        />
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setViewModal(u)}>View</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground mt-4">
          <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {createModal && (
        <CreateUserModal defaultRole={tab} onClose={() => setCreateModal(false)}
          onSaved={() => { setCreateModal(false); refetch(); }} />
      )}
      {viewModal && <ViewUserModal user={viewModal} onClose={() => setViewModal(null)} />}
      {editModal && (
        <EditUserModal user={editModal} onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); refetch(); }} />
      )}
      {resetPwModal && (
        <ResetPasswordModal user={resetPwModal} onClose={() => setResetPwModal(null)}
          onSaved={() => { setResetPwModal(null); refetch(); }} />
      )}
      {changeRoleModal && (
        <ChangeRoleModal user={changeRoleModal} onClose={() => setChangeRoleModal(null)}
          onSaved={() => { setChangeRoleModal(null); refetch(); }} />
      )}
      {statusModal && (
        <UserStatusModal entry={statusModal} onClose={() => setStatusModal(null)}
          onSaved={() => { setStatusModal(null); refetch(); }} />
      )}
      <ConfirmDialog
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title={`Delete user "${deleteModal?.name}"?`}
        message="This will permanently delete this user account. This cannot be undone."
        onConfirm={async () => {
          try {
            await api.delete(`/users/${deleteModal.id}`);
            toast.success("User deleted");
            setDeleteModal(null);
            refetch();
          } catch (e: any) { toast.error(e.message); }
        }}
      />
    </div>
  );
}

function UserActionMenu({ user, onView, onEdit, onResetPw, onChangePw, onForcePwChange, onChangeRole, onActivate, onDeactivate, onUnlock, onLock, onDelete }: any) {
  const [open, setOpen] = useState(false);
  const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();
  const isActive = user.status === "ACTIVE";

  const items = [
    { label: "View", icon: Eye, action: onView },
    { label: "Edit", icon: Edit2, action: onEdit },
    { label: "Reset Password", icon: KeyRound, action: onResetPw },
    { label: "Change Password", icon: KeyRound, action: onChangePw },
    { label: "Force Password Change", icon: ShieldCheck, action: onForcePwChange },
    { label: "Change Role", icon: UserCog, action: onChangeRole },
    isActive
      ? { label: "Deactivate", icon: Ban, action: onDeactivate }
      : { label: "Activate", icon: UserCheck, action: onActivate },
    isLocked
      ? { label: "Unlock Account", icon: Unlock, action: onUnlock }
      : { label: "Lock Account", icon: Lock, action: onLock },
    { label: "Delete User", icon: Trash2, action: onDelete, danger: true },
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
          <div className="absolute right-0 top-7 z-20 w-52 rounded-xl border bg-card shadow-lg overflow-hidden">
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

function CreateUserModal({ defaultRole, onClose, onSaved }: { defaultRole: string; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", password: "", role: defaultRole,
  });
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/users", form);
      toast.success(`User "${form.name}" created`);
      onSaved();
    } catch (err: any) { toast.error(err.message ?? "Failed"); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Add User — ${user?.school?.name || "School"}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={(e: any) => save(e)}><UserPlus className="size-4" /> Create User</Button></>}>
      <form onSubmit={save} className="grid sm:grid-cols-2 gap-4">
        <Field label="Full Name *"><TextInput required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Email (login username) *"><TextInput required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Phone"><TextInput type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Password *"><TextInput required type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Min. 6 characters" /></Field>
        <Field label="Role *">
          <Select value={form.role} onChange={(e) => set("role", e.target.value)}>
            {CREATE_ROLES.map((r) => (
              <option key={r} value={r}>{r.replace("_", " ")}</option>
            ))}
          </Select>
        </Field>
        <p className="sm:col-span-2 text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
          User will be assigned to your school automatically. Share credentials securely after creation.
        </p>
      </form>
    </Modal>
  );
}

function ViewUserModal({ user, onClose }: { user: any; onClose: () => void }) {
  const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();
  return (
    <Modal open onClose={onClose} title={user.name} size="lg">
      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        {[
          ["Email", user.email],
          ["Phone", user.phone || "—"],
          ["Role", user.role?.replace("_", " ")],
          ["Status", user.status],
          ["Created", user.createdAt ? new Date(user.createdAt).toLocaleString() : "—"],
          ["Last Login", user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="font-medium mt-0.5">{value}</div>
          </div>
        ))}
        <div className="sm:col-span-2 flex gap-2 flex-wrap">
          {isLocked && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">LOCKED</span>}
          {user.forcePasswordChange && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">MUST CHANGE PASSWORD</span>}
        </div>
      </div>
    </Modal>
  );
}

function EditUserModal({ user, onClose, onSaved }: any) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: user.name, email: user.email, phone: user.phone || "" });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}`, form);
      toast.success("User updated");
      onSaved();
    } catch (err: any) { toast.error(err.message ?? "Failed"); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Edit User — ${user.name}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={(e: any) => save(e)}><Edit2 className="size-4" /> Save</Button></>}>
      <form onSubmit={save} className="grid sm:grid-cols-2 gap-4">
        <Field label="Full Name"><TextInput value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></Field>
        <Field label="Email"><TextInput type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></Field>
        <div className="sm:col-span-2">
          <Field label="Phone"><TextInput type="tel" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></Field>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose, onSaved }: any) {
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState("");
  const [force, setForce] = useState(true);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}/reset-password`, { newPassword: pw, forceChange: force });
      toast.success("Password updated successfully");
      onSaved();
    } catch (err: any) { toast.error(err.message ?? "Failed"); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Reset Password — ${user.name}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={(e: any) => save(e)}><KeyRound className="size-4" /> Save Password</Button></>}>
      <form onSubmit={save} className="space-y-4">
        <Field label="New Password *">
          <TextInput required type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Min. 6 characters" />
        </Field>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="size-4 rounded" />
          <span className="text-sm">Force user to change password on next login</span>
        </label>
      </form>
    </Modal>
  );
}

function ChangeRoleModal({ user, onClose, onSaved }: any) {
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState(user.role);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}/change-role`, { role });
      toast.success(`Role changed to ${role.replace("_", " ")}`);
      onSaved();
    } catch (err: any) { toast.error(err.message ?? "Failed"); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Change Role — ${user.name}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={(e: any) => save(e)}><UserCog className="size-4" /> Change Role</Button></>}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Current Role">
          <div className="text-sm font-semibold text-primary">{user.role?.replace("_", " ")}</div>
        </Field>
        <Field label="New Role *">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            {CHANGE_ROLES.map((r) => (
              <option key={r} value={r}>{r.replace("_", " ")}</option>
            ))}
          </Select>
        </Field>
        <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
          Promote teachers or receptionists to accountant, or assign school admin as needed.
        </p>
      </form>
    </Modal>
  );
}

function UserStatusModal({ entry, onClose, onSaved }: { entry: { user: any; action: string }; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const { user, action } = entry;

  const labels: Record<string, { title: string; desc: string; icon: any }> = {
    ACTIVATE:   { title: "Activate Account",   desc: `${user.name} will be able to log in again.`, icon: UserCheck },
    DEACTIVATE: { title: "Deactivate Account", desc: `${user.name} will no longer be able to log in.`, icon: Ban },
    UNLOCK:     { title: "Unlock Account",     desc: `Remove the login lock from ${user.name}'s account.`, icon: Unlock },
    LOCK:       { title: "Lock Account",       desc: `Prevent ${user.name} from logging in.`, icon: Lock },
  };
  const info = labels[action] ?? labels.ACTIVATE;

  const confirm = async () => {
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}/status`, { action });
      toast.success(info.title + " successful");
      onSaved();
    } catch (err: any) { toast.error(err.message ?? "Failed"); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={info.title}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={confirm}><info.icon className="size-4" /> Confirm</Button></>}>
      <div className="flex items-start gap-3 p-4 bg-muted/40 rounded-xl">
        <info.icon className="size-8 mt-0.5 text-primary" />
        <div>
          <p className="font-semibold">{user.name} <span className="text-muted-foreground">({user.email})</span></p>
          <p className="text-sm text-muted-foreground mt-1">{info.desc}</p>
        </div>
      </div>
    </Modal>
  );
}
