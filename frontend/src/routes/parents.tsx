import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, Edit2, Trash2, HeartHandshake, Eye, Phone } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { MonthYearFilter } from "@/components/MonthYearFilter";
import { Card, PageHeader, Skeleton, EmptyState, ErrorState, StatusBadge } from "@/components/ui-kit";
import { Button, Field, Select, TextInput, Textarea } from "@/components/form";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { useApiQuery, asList } from "@/lib/hooks";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";

export const Route = createFileRoute("/parents")({
  head: () => ({ meta: [{ title: "Parents — School ERP" }] }),
  component: () => <AppShell><Parents /></AppShell>,
});

type Student = {
  id: string;
  schoolId: string;
  fullName: string;
  admissionNo: string;
  class?: { name: string };
};

type Parent = {
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
  address?: string;
  status: string;
  studentId?: string;
  student?: Student;
};

const empty: Omit<Parent, "id"> = {
  fullName: "", phone: "", email: "", address: "", status: "ACTIVE", studentId: "",
};

function Parents() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const canCreate = can("parents.create");
  const canEdit = can("parents.edit");
  const canDelete = can("parents.delete");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");

  const list = useApiQuery<Parent[]>("/parents", {
    search: search || undefined,
    status: statusFilter || undefined,
    month: monthFilter || undefined,
    year: yearFilter || undefined,
    limit: 200,
  });
  const students = useApiQuery<Student[]>("/students", { limit: 200 });

  const hasFilters = Boolean(search || statusFilter || monthFilter || yearFilter);
  const clearFilters = () => {
    setSearch(""); setStatusFilter(""); setMonthFilter(""); setYearFilter("");
  };
  const [modal, setModal] = useState<{ open: boolean; data: Parent | null }>({ open: false, data: null });
  const [view, setView] = useState<Parent | null>(null);
  const [del, setDel] = useState<Parent | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const studentList = asList<Student>(students.data);

  // Search/status/month/year are applied server-side by the /parents endpoint.
  const rows = useMemo(() => asList<Parent>(list.data), [list.data]);

  const save = async (form: any) => {
    setSaving(true);
    try {
      const allowed = ["fullName", "phone", "email", "address", "status", "studentId"];
      const base: Record<string, any> = {};
      for (const key of allowed) {
        if (form[key] !== undefined && form[key] !== "") base[key] = form[key];
      }
      base.studentId = form.studentId || undefined;

      if (modal.data?.id) {
        await api.patch(`/parents/${modal.data.id}`, base);
        toast.success("Parent updated");
      } else {
        // schoolId required only on create
        const selectedStudent = studentList.find((s) => s.id === form.studentId);
        const schoolId =
          selectedStudent?.schoolId ||
          (user as any)?.schoolId ||
          (user as any)?.school?.id;
        if (!schoolId) {
          toast.error("School context is required. Link a student or contact your administrator.");
          return;
        }
        await api.post("/parents", { ...base, schoolId });
        toast.success("Parent added");
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
      await api.delete(`/parents/${del.id}`);
      toast.success("Parent removed");
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
        title="Parents"
        description="Manage parent profiles and link them to their children."
        actions={canCreate ? (
          <Button onClick={() => setModal({ open: true, data: null })}>
            <Plus className="size-4" /> Add Parent
          </Button>
        ) : undefined}
      />

      {/* Filters */}
      <Card className="mb-4">
        <div className="grid sm:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <TextInput
              placeholder="Search by name, phone, student name or admission no…"
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
          <div />
          <MonthYearFilter
            month={monthFilter}
            year={yearFilter}
            onMonthChange={setMonthFilter}
            onYearChange={setYearFilter}
            monthLabel="Registered: All Months"
            yearLabel="Registered: All Years"
          />
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
          hasFilters ? (
            <EmptyState
              icon={HeartHandshake}
              title="No matching records"
              description="No parents match your current search or filters."
              action={<Button variant="outline" onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
          <EmptyState
            icon={HeartHandshake}
            title="No parents yet"
            description="Add your first parent profile to get started."
            action={canCreate ? (
              <Button onClick={() => setModal({ open: true, data: null })}>
                <Plus className="size-4" /> Add Parent
              </Button>
            ) : undefined}
          />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Parent Name</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Phone</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Student</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Adm No</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Class</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-muted/30 transition">
                    <td className="px-4 py-3 font-medium">{p.fullName}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.phone ? (
                        <span className="flex items-center gap-1.5">
                          <Phone className="size-3.5" /> {p.phone}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {p.student ? (
                        <span className="font-medium">{p.student.fullName}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">Not linked</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {p.student?.admissionNo || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.student?.class?.name || "—"}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setView(p)}
                          className="size-8 grid place-items-center rounded-lg hover:bg-muted"
                          title="View"
                        >
                          <Eye className="size-4" />
                        </button>
                        {canEdit && (
                        <button
                          onClick={() => setModal({ open: true, data: p })}
                          className="size-8 grid place-items-center rounded-lg hover:bg-muted"
                          title="Edit"
                        >
                          <Edit2 className="size-4" />
                        </button>
                        )}
                        {canDelete && (
                        <button
                          onClick={() => setDel(p)}
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
        <ParentForm
          initial={modal.data}
          students={studentList}
          onClose={() => setModal({ open: false, data: null })}
          onSave={save}
          saving={saving}
          isEdit={!!modal.data}
        />
      )}

      {/* View Modal */}
      <Modal open={!!view} onClose={() => setView(null)} title={view?.fullName || "Parent"} size="md">
        {view && (
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <Info label="Parent Name" value={view.fullName} />
            <Info label="Phone" value={view.phone} />
            <Info label="Email" value={view.email} />
            <Info label="Status" value={<StatusBadge status={view.status} />} />
            {view.student && (
              <>
                <div className="sm:col-span-2 border-t pt-3 mt-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Linked Student
                  </p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Info label="Student Name" value={view.student.fullName} />
                    <Info label="Admission No" value={
                      <span className="font-mono">{view.student.admissionNo}</span>
                    } />
                    <Info label="Class" value={view.student.class?.name} />
                  </div>
                </div>
              </>
            )}
            {view.address && (
              <div className="sm:col-span-2"><Info label="Address" value={view.address} /></div>
            )}
          </div>
        )}
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={remove}
        loading={deleting}
        title="Remove parent?"
        message={`This will deactivate ${del?.fullName}. You can restore them later.`}
      />
    </div>
  );
}

// ─── Parent Form ──────────────────────────────────────────────────────────────

function ParentForm({
  initial, students, onClose, onSave, saving, isEdit,
}: {
  initial: Parent | null;
  students: Student[];
  onClose: () => void;
  onSave: (f: any) => void;
  saving: boolean;
  isEdit: boolean;
}) {
  const [f, setF] = useState<typeof empty>({
    ...empty,
    ...(initial
      ? {
          fullName: initial.fullName ?? "",
          phone: initial.phone ?? "",
          email: initial.email ?? "",
          address: initial.address ?? "",
          status: initial.status ?? "ACTIVE",
          studentId: initial.studentId ?? "",
        }
      : {}),
  });
  const set = (k: string, v: any) => setF((p: typeof empty) => ({ ...p, [k]: v }));

  // When a student is selected, auto-fill parent name if blank
  const handleStudentChange = (studentId: string) => {
    set("studentId", studentId);
    if (studentId && !f.fullName?.trim()) {
      const student = students.find((s) => s.id === studentId);
      if (student) set("fullName", `Parent of ${student.fullName}`);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.fullName?.trim()) return toast.error("Parent name is required");
    if (f.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
      return toast.error("Enter a valid email address");
    }
    onSave(f);
  };

  // Find currently selected student for display hint
  const selectedStudent = students.find((s) => s.id === f.studentId);

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Edit Parent" : "Add Parent"}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>
            {isEdit ? "Save changes" : "Add Parent"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">

        {/* Student section */}
        <div className="sm:col-span-2">
          <Field label="Linked Student (optional)" hint="Select the student this parent belongs to">
            <Select value={f.studentId ?? ""} onChange={(e) => handleStudentChange(e.target.value)}>
              <option value="">— No student linked —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.admissionNo} — {s.fullName}{s.class?.name ? ` (${s.class.name})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          {selectedStudent && (
            <div className="mt-2 px-3 py-2 bg-muted/60 rounded-xl text-xs text-muted-foreground flex gap-4">
              <span><span className="font-semibold">Student:</span> {selectedStudent.fullName}</span>
              <span><span className="font-semibold">Adm No:</span> {selectedStudent.admissionNo}</span>
              {selectedStudent.class && (
                <span><span className="font-semibold">Class:</span> {selectedStudent.class.name}</span>
              )}
            </div>
          )}
        </div>

        {/* Parent details */}
        <Field label="Parent / Guardian Name *">
          <TextInput
            value={f.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            placeholder="e.g. Muhammad Ali"
          />
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
            placeholder="parent@email.com"
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className="font-medium">{value ?? "—"}</div>
    </div>
  );
}
