import { useMemo, useState } from "react";
import {
  Ban, Edit2, KeyRound, Lock, Plus, Search, ShieldCheck, Trash2,
  Unlock, UserCheck, UserCog, UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Card, EmptyState, Skeleton, StatusBadge } from "@/components/ui-kit";
import { Button, Field, Select, TextInput } from "@/components/form";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { useApiQuery, asList } from "@/lib/hooks";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type PlatformUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: "SUPER_ADMIN" | "PLATFORM_MANAGER";
  status: string;
  lastLoginAt?: string | null;
  createdAt?: string;
  lockedUntil?: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  PLATFORM_MANAGER: "Manager",
};

export function PlatformTeamTab() {
  const { user: me } = useAuth();
  const list = useApiQuery<{ data: PlatformUser[]; total: number }>("/super-admin/platform-users");
  const rows = asList<PlatformUser>(list.data?.data ?? list.data);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<PlatformUser | null>(null);
  const [resetUser, setResetUser] = useState<PlatformUser | null>(null);
  const [delUser, setDelUser] = useState<PlatformUser | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [rows, search]);

  const admins = filtered.filter((u) => u.role === "SUPER_ADMIN").length;
  const managers = filtered.filter((u) => u.role === "PLATFORM_MANAGER").length;

  const setStatus = async (u: PlatformUser, action: "ACTIVATE" | "DEACTIVATE" | "UNLOCK" | "LOCK") => {
    setBusyId(u.id);
    try {
      await api.patch(`/super-admin/users/${u.id}/status`, { action });
      toast.success("Updated");
      list.refetch();
    } catch (e: any) {
      toast.error(e.message || "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const changeRole = async (u: PlatformUser, role: PlatformUser["role"]) => {
    if (u.role === role) return;
    setBusyId(u.id);
    try {
      await api.patch(`/super-admin/platform-users/${u.id}/change-role`, { role });
      toast.success(`Role changed to ${ROLE_LABEL[role]}`);
      list.refetch();
    } catch (e: any) {
      toast.error(e.message || "Could not change role");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!delUser) return;
    setBusyId(delUser.id);
    try {
      await api.delete(`/super-admin/platform-users/${delUser.id}`);
      toast.success("User removed");
      setDelUser(null);
      list.refetch();
    } catch (e: any) {
      toast.error(e.message || "Could not remove user");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-3 gap-4">
        <Summary icon={ShieldCheck} label="Super Admins" value={list.loading ? null : admins} />
        <Summary icon={UserCog} label="Managers" value={list.loading ? null : managers} />
        <Summary icon={UserPlus} label="Team members" value={list.loading ? null : rows.length} />
      </div>

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <TextInput className="pl-9" placeholder="Search team…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> Add Admin or Manager
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Super Admins have full platform control. Managers can run schools, billing, plans, and school roles, but cannot manage this team, change platform settings, delete schools, or impersonate.
      </p>

      {list.loading ? (
        <Skeleton className="h-64" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={UserCog} title="No platform users" description="Add another Super Admin or a Manager to help run the platform." />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground bg-muted/40">
                  <th className="px-4 py-3 font-semibold">Person</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Last login</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isMe = u.id === me?.id;
                  const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
                  return (
                    <tr key={u.id} className="border-t border-border/70">
                      <td className="px-4 py-3">
                        <div className="font-medium">{u.name}{isMe ? <span className="text-xs text-muted-foreground font-normal"> (you)</span> : null}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          className="h-9 text-xs"
                          value={u.role}
                          disabled={!!busyId || isMe}
                          onChange={(e) => changeRole(u, e.target.value as PlatformUser["role"])}
                        >
                          <option value="SUPER_ADMIN">Super Admin</option>
                          <option value="PLATFORM_MANAGER">Manager</option>
                        </Select>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={locked ? "LOCKED" : u.status} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => setEditUser(u)}><Edit2 className="size-3.5" /> Edit</Button>
                          <Button size="sm" variant="outline" onClick={() => setResetUser(u)}><KeyRound className="size-3.5" /></Button>
                          {u.status === "ACTIVE" ? (
                            <Button size="sm" variant="outline" disabled={isMe} onClick={() => setStatus(u, "DEACTIVATE")}><Ban className="size-3.5" /></Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => setStatus(u, "ACTIVATE")}><UserCheck className="size-3.5" /></Button>
                          )}
                          {locked ? (
                            <Button size="sm" variant="outline" onClick={() => setStatus(u, "UNLOCK")}><Unlock className="size-3.5" /></Button>
                          ) : (
                            <Button size="sm" variant="outline" disabled={isMe} onClick={() => setStatus(u, "LOCK")}><Lock className="size-3.5" /></Button>
                          )}
                          <Button size="sm" variant="outline" disabled={isMe} className="text-destructive hover:bg-destructive/10" onClick={() => setDelUser(u)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {createOpen && (
        <PlatformUserForm
          title="Add Admin or Manager"
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); list.refetch(); }}
        />
      )}
      {editUser && (
        <PlatformUserForm
          title={`Edit ${editUser.name}`}
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => { setEditUser(null); list.refetch(); }}
        />
      )}
      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onSaved={() => { setResetUser(null); list.refetch(); }}
        />
      )}
      <ConfirmDialog
        open={!!delUser}
        onClose={() => setDelUser(null)}
        onConfirm={remove}
        title="Remove team member?"
        message={delUser ? `Remove ${delUser.name} (${ROLE_LABEL[delUser.role]})? They will no longer be able to sign in.` : ""}
        confirmText="Remove"
        loading={busyId === delUser?.id}
      />
    </div>
  );
}

function Summary({ icon: Icon, label, value }: { icon: any; label: string; value: number | null }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className="size-11 rounded-2xl grid place-items-center bg-primary/10 text-primary">
        <Icon className="size-5" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground font-medium">{label}</div>
        <div className="text-2xl font-bold mt-0.5">{value === null ? <Skeleton className="h-7 w-12" /> : value}</div>
      </div>
    </Card>
  );
}

function PlatformUserForm({
  title, user, onClose, onSaved,
}: {
  title: string;
  user?: PlatformUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [role, setRole] = useState<PlatformUser["role"]>(user?.role ?? "PLATFORM_MANAGER");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const isCreate = !user;

  const save = async () => {
    if (name.trim().length < 2) return toast.error("Name is required");
    if (!email.trim()) return toast.error("Email is required");
    if (isCreate && password.length < 8) return toast.error("Password must be at least 8 characters with upper, lower, and a number");
    setSaving(true);
    try {
      if (isCreate) {
        await api.post("/super-admin/platform-users", {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          password,
          role,
        });
        toast.success(`${ROLE_LABEL[role]} created`);
      } else {
        await api.patch(`/super-admin/platform-users/${user.id}`, {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
        });
        toast.success("Saved");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={isCreate ? "They can sign in immediately. Super Admin has full access; Manager cannot manage this team or platform settings." : undefined}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>{isCreate ? "Create" : "Save"}</Button></>}
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Full name *"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email *"><TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Phone"><TextInput value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        {isCreate && (
          <Field label="Role *">
            <Select value={role} onChange={(e) => setRole(e.target.value as PlatformUser["role"])}>
              <option value="SUPER_ADMIN">Super Admin — full platform access</option>
              <option value="PLATFORM_MANAGER">Manager — operate schools & billing</option>
            </Select>
          </Field>
        )}
        {isCreate && (
          <div className="sm:col-span-2">
            <Field label="Temporary password *" hint="Min 8 characters, with uppercase, lowercase, and a number. They will be asked to change it.">
              <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </Field>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose, onSaved }: { user: PlatformUser; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (password.length < 8) return toast.error("Password must be at least 8 characters with upper, lower, and a number");
    setSaving(true);
    try {
      await api.patch(`/super-admin/users/${user.id}/reset-password`, { newPassword: password, forceChange: true });
      toast.success("Password reset");
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Reset failed");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Reset password — ${user.name}`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>Reset</Button></>}>
      <Field label="New password">
        <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </Field>
    </Modal>
  );
}
