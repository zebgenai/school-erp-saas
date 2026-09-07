import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, Edit2, Trash2, Briefcase, Eye, Phone } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PageHeader, Skeleton, EmptyState, ErrorState, StatusBadge } from "@/components/ui-kit";
import { Button, Field, Select, TextInput, Textarea } from "@/components/form";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { useApiQuery, asList } from "@/lib/hooks";
import { api } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";

export const Route = createFileRoute("/staff")({
  head: () => ({ meta: [{ title: "Staff — School ERP" }] }),
  component: () => <AppShell><Staff /></AppShell>,
});

const DEPARTMENTS = [
  "Administration", "Accounts", "IT", "Security", "Housekeeping",
  "Transport", "Library", "Canteen", "Sports", "Other",
];

const empty = {
  fullName: "", designation: "", department: "", phone: "", email: "",
  address: "", joiningDate: "", salary: 0, status: "ACTIVE",
};

function Staff() {
  const { can } = usePermissions();
  const canCreate = can("staff.create");
  const canEdit = can("staff.edit");
  const canDelete = can("staff.delete");
  const list = useApiQuery<any>("/staff");

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modal, setModal] = useState<{ open: boolean; data: any | null }>({ open: false, data: null });
  const [view, setView] = useState<any | null>(null);
  const [del, setDel] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const rows = useMemo(() => {
    return asList<any>(list.data).filter((s) => {
      const text = `${s.fullName || ""} ${s.designation || ""} ${s.department || ""} ${s.phone || ""}`.toLowerCase();
      if (search && !text.includes(search.toLowerCase())) return false;
      if (deptFilter && s.department !== deptFilter) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      return true;
    });
  }, [list.data, search, deptFilter, statusFilter]);

  const save = async (form: any) => {
    setSaving(true);
    try {
      const allowed = ["fullName", "designation", "department", "phone", "email", "address", "joiningDate", "salary", "status"];
      const payload: Record<string, any> = {};
      for (const key of allowed) {
        if (form[key] !== undefined && form[key] !== "") payload[key] = form[key];
      }
      payload.salary = Number(form.salary) || 0;
      if (modal.data?.id) {
        await api.patch(`/staff/${modal.data.id}`, payload);
        toast.success("Staff member updated");
      } else {
        await api.post("/staff", payload);
        toast.success("Staff member added");
      }
      setModal({ open: false, data: null });
      list.refetch();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!del) return;
    setDeleting(true);
    try {
      await api.delete(`/staff/${del.id}`);
      toast.success("Staff member removed");
      setDel(null);
      list.refetch();
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Staff"
        description="Manage non-teaching staff — admin, security, maintenance, and more."
        actions={canCreate ? (
          <Button onClick={() => setModal({ open: true, data: null })}>
            <Plus className="size-4" /> Add Staff
          </Button>
        ) : undefined}
      />

      {/* Filters */}
      <Card className="mb-4">
        <div className="grid sm:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <TextInput
              placeholder="Search by name, designation, department…"
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="">All departments</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        {list.loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.refetch} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No staff members yet"
            description="Add your first staff member to get started."
            action={canCreate ? (
              <Button onClick={() => setModal({ open: true, data: null })}>
                <Plus className="size-4" /> Add Staff
              </Button>
            ) : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Designation</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Department</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Phone</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Salary</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-t hover:bg-muted/30 transition">
                    <td className="px-4 py-3 font-medium">{s.fullName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.designation || "—"}</td>
                    <td className="px-4 py-3">{s.department || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.phone ? (
                        <span className="flex items-center gap-1.5">
                          <Phone className="size-3.5" /> {s.phone}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {s.salary ? `PKR ${Number(s.salary).toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setView(s)}
                          className="size-8 grid place-items-center rounded-lg hover:bg-muted"
                          title="View"
                        >
                          <Eye className="size-4" />
                        </button>
                        {canEdit && (
                        <button
                          onClick={() => setModal({ open: true, data: s })}
                          className="size-8 grid place-items-center rounded-lg hover:bg-muted"
                          title="Edit"
                        >
                          <Edit2 className="size-4" />
                        </button>
                        )}
                        {canDelete && (
                        <button
                          onClick={() => setDel(s)}
                          className="size-8 grid place-items-center rounded-lg hover:bg-destructive/10 hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="size-4" />
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create / Edit Modal */}
      {modal.open && (
        <StaffForm
          initial={modal.data}
          onClose={() => setModal({ open: false, data: null })}
          onSave={save}
          saving={saving}
          isEdit={!!modal.data}
        />
      )}

      {/* View Modal */}
      <Modal open={!!view} onClose={() => setView(null)} title={view?.fullName || "Staff"} size="lg">
        {view && (
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <Info label="Full Name" value={view.fullName} />
            <Info label="Designation" value={view.designation} />
            <Info label="Department" value={view.department} />
            <Info label="Phone" value={view.phone} />
            <Info label="Email" value={view.email} />
            <Info label="Monthly Salary" value={view.salary ? `PKR ${Number(view.salary).toLocaleString()}` : null} />
            <Info label="Joining Date" value={view.joiningDate?.slice(0, 10)} />
            <Info label="Status" value={<StatusBadge status={view.status} />} />
            <div className="sm:col-span-2"><Info label="Address" value={view.address} /></div>
          </div>
        )}
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={remove}
        loading={deleting}
        title="Remove staff member?"
        message={`This will deactivate ${del?.fullName}. You can restore them later.`}
      />
    </div>
  );
}

function StaffForm({
  initial, onClose, onSave, saving, isEdit,
}: {
  initial: any; onClose: () => void; onSave: (f: any) => void; saving: boolean; isEdit: boolean;
}) {
  const [f, setF] = useState({ ...empty, ...(initial || {}) });
  const set = (k: string, v: any) => setF((p: typeof empty) => ({ ...p, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.fullName?.trim()) return toast.error("Full name is required");
    if (f.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
      return toast.error("Enter a valid email address");
    }
    onSave(f);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Edit Staff Member" : "Add Staff Member"}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>
            {isEdit ? "Save changes" : "Add Staff"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
        <Field label="Full Name *">
          <TextInput
            value={f.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            placeholder="e.g. Ali Hassan"
          />
        </Field>
        <Field label="Designation">
          <TextInput
            value={f.designation}
            onChange={(e) => set("designation", e.target.value)}
            placeholder="e.g. Senior Clerk"
          />
        </Field>
        <Field label="Department">
          <Select value={f.department} onChange={(e) => set("department", e.target.value)}>
            <option value="">Select department</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        </Field>
        <Field label="Phone">
          <TextInput
            type="tel"
            value={f.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="e.g. 0300-1234567"
          />
        </Field>
        <Field label="Email">
          <TextInput
            type="email"
            value={f.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="staff@school.edu"
          />
        </Field>
        <Field label="Monthly Salary (PKR)">
          <TextInput
            type="number"
            min={0}
            value={f.salary}
            onChange={(e) => set("salary", e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Joining Date">
          <TextInput
            type="date"
            value={f.joiningDate?.slice(0, 10) || ""}
            onChange={(e) => set("joiningDate", e.target.value)}
          />
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Address">
            <Textarea
              value={f.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Home address…"
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className="font-medium">{value ?? "—"}</div>
    </div>
  );
}
