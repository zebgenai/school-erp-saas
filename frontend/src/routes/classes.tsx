import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Plus, Edit2, Trash2, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PageHeader, Skeleton, EmptyState, ErrorState } from "@/components/ui-kit";
import { Button, Field, Select, TextInput } from "@/components/form";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { useApiQuery, asList } from "@/lib/hooks";
import { api } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";

export const Route = createFileRoute("/classes")({
  head: () => ({ meta: [{ title: "Classes — School ERP" }] }),
  component: () => (
    <AppShell>
      <ClassesPage />
    </AppShell>
  ),
});

type TabKey = "classes" | "sections" | "subjects";

type FieldConfig = {
  name: string;
  label: string;
  type?: "class" | "section" | "teacher";
};

function ClassesPage() {
  const { role, permissions } = usePermissions();
  const canManage =
    role === "SCHOOL_ADMIN" ||
    role === "SUPER_ADMIN" ||
    permissions["classes.create"] === true ||
    permissions["classes.edit"] === true;
  const [tab, setTab] = useState<TabKey>("classes");

  return (
    <div>
      <PageHeader
        title="Classes & Curriculum"
        description="Manage classes, sections and subjects offered by your school."
      />

      <div className="inline-flex gap-1 p-1 bg-muted rounded-xl mb-4">
        {(["classes", "sections", "subjects"] as TabKey[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition ${
              tab === t
                ? "bg-card shadow-soft"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "classes" && (
        <CrudTable endpoint="/classes" title="Class" canManage={canManage}
          fields={[
            { name: "name", label: "Class Name" },
            { name: "classTeacherId", label: "Class Teacher", type: "teacher" },
          ]} />
      )}
      {tab === "sections" && (
        <CrudTable endpoint="/sections" title="Section" canManage={canManage}
          fields={[
            { name: "name", label: "Section Name" },
            { name: "classId", label: "Class", type: "class" },
            { name: "teacherId", label: "Section Teacher", type: "teacher" },
          ]} />
      )}
      {tab === "subjects" && (
        <CrudTable endpoint="/subjects" title="Subject" canManage={canManage}
          fields={[
            { name: "name", label: "Subject Name" },
            { name: "code", label: "Code" },
            { name: "classId", label: "Class", type: "class" },
            { name: "sectionId", label: "Section", type: "section" },
            { name: "teacherId", label: "Teacher", type: "teacher" },
          ]} />
      )}
    </div>
  );
}

function CrudTable({
  endpoint,
  title,
  fields,
  canManage = false,
}: {
  endpoint: string;
  title: string;
  fields: FieldConfig[];
  canManage?: boolean;
}) {
  const list = useApiQuery<any>(endpoint);
  const classes = useApiQuery<any>("/classes");
  const needsTeachers = fields.some((f) => f.type === "teacher");
  const needsSections = fields.some((f) => f.type === "section");
  const teachers = useApiQuery<any>(needsTeachers ? "/teachers" : null, { limit: 200 });
  const sections = useApiQuery<any>(needsSections ? "/sections" : null, { limit: 200 });

  const [modal, setModal] = useState<{ open: boolean; data: any | null }>({
    open: false,
    data: null,
  });

  const [del, setDel] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const empty = Object.fromEntries(fields.map((f) => [f.name, ""]));
  const [form, setForm] = useState<any>(empty);

  const open = (row: any | null) => {
    const cleanForm = { ...empty };

    if (row) {
      for (const field of fields) {
        cleanForm[field.name] = row[field.name] ?? "";
      }
    }

    setForm(cleanForm);
    setModal({ open: true, data: row });
  };

  const closeModal = () => {
    setModal({ open: false, data: null });
    setForm(empty);
  };

  // Optional relations send null (not undefined) so an existing assignment can be cleared.
  const relation = (value: string) => (value ? value : null);

  const buildPayload = () => {
    if (endpoint === "/classes") {
      return {
        name: form.name?.trim(),
        classTeacherId: relation(form.classTeacherId),
      };
    }

    if (endpoint === "/sections") {
      return {
        name: form.name?.trim(),
        classId: form.classId || undefined,
        teacherId: relation(form.teacherId),
      };
    }

    if (endpoint === "/subjects") {
      return {
        name: form.name?.trim(),
        code: form.code?.trim() || undefined,
        classId: relation(form.classId),
        sectionId: relation(form.sectionId),
        teacherId: relation(form.teacherId),
      };
    }

    return {};
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();

    if (!form.name?.trim()) {
      return toast.error("Name is required");
    }

    if (endpoint === "/sections" && !form.classId) {
      return toast.error("Class is required");
    }

    setSaving(true);

    try {
      const payload = buildPayload();

      if (modal.data?.id) {
        await api.patch(`${endpoint}/${modal.data.id}`, payload);
        toast.success(`${title} updated`);
      } else {
        await api.post(endpoint, payload);
        toast.success(`${title} added`);
      }

      closeModal();
      list.refetch();

      if (endpoint === "/classes") {
        classes.refetch();
      }
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
      await api.delete(`${endpoint}/${del.id}`);
      toast.success(`${title} deleted`);
      setDel(null);
      list.refetch();

      if (endpoint === "/classes") {
        classes.refetch();
      }
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const rows = asList<any>(list.data);
  const classRows = asList<any>(classes.data);
  const teacherRows = asList<any>(teachers.data);
  const sectionRows = asList<any>(sections.data);
  // Only offer sections that belong to the class chosen in the form.
  const sectionOptions = form.classId
    ? sectionRows.filter((s) => s.classId === form.classId)
    : sectionRows;

  const displayValue = (row: any, f: FieldConfig) => {
    if (f.type === "class") {
      return classRows.find((c) => c.id === row[f.name])?.name || row.class?.name || "—";
    }
    if (f.type === "teacher") {
      return (
        teacherRows.find((t) => t.id === row[f.name])?.fullName ||
        row.teacher?.fullName ||
        row.classTeacher?.fullName ||
        "—"
      );
    }
    if (f.type === "section") {
      return sectionRows.find((s) => s.id === row[f.name])?.name || row.section?.name || "—";
    }
    return row[f.name] || "—";
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="font-semibold">{title}s</div>
        {canManage && (
          <Button size="sm" onClick={() => open(null)}>
            <Plus className="size-4" />
            Add {title}
          </Button>
        )}
      </div>

      {list.loading ? (
        <div className="p-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={`No ${title.toLowerCase()}s yet`}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                {fields.map((f) => (
                  <th
                    key={f.name}
                    className="px-4 py-3 font-medium text-muted-foreground"
                  >
                    {f.label}
                  </th>
                ))}
                <th className="px-4 py-3"></th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  {fields.map((f) => (
                    <td key={f.name} className="px-4 py-3">
                      {displayValue(r, f)}
                    </td>
                  ))}

                  <td className="px-4 py-3">
                    {canManage && (
                      <div className="flex justify-end gap-1">
                        <button onClick={() => open(r)} className="size-8 grid place-items-center rounded-lg hover:bg-muted" title={`Edit ${title}`}>
                          <Edit2 className="size-4" />
                        </button>
                        <button onClick={() => setDel(r)} className="size-8 grid place-items-center rounded-lg hover:bg-destructive/10 hover:text-destructive" title={`Delete ${title}`}>
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modal.open}
        onClose={closeModal}
        title={`${modal.data ? "Edit" : "Add"} ${title}`}
        footer={
          <>
            <Button variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button onClick={save as any} loading={saving}>
              {modal.data ? "Save" : "Add"}
            </Button>
          </>
        }
      >
        <form onSubmit={save} className="space-y-4">
          {fields.map((f) => (
            <Field key={f.name} label={f.label}>
              {f.type === "class" ? (
                <Select
                  value={form[f.name] ?? ""}
                  onChange={(e) =>
                    // Changing the class invalidates any section chosen under the old one.
                    setForm({ ...form, [f.name]: e.target.value, sectionId: "" })
                  }
                >
                  <option value="">Select class</option>
                  {classRows.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              ) : f.type === "teacher" ? (
                <Select
                  value={form[f.name] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                >
                  <option value="">Unassigned</option>
                  {teacherRows.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.fullName}
                    </option>
                  ))}
                </Select>
              ) : f.type === "section" ? (
                <Select
                  value={form[f.name] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                >
                  <option value="">All sections</option>
                  {sectionOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.class?.name ? `${s.class.name} · ${s.name}` : s.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <TextInput
                  value={form[f.name] ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, [f.name]: e.target.value })
                  }
                />
              )}
            </Field>
          ))}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={remove}
        loading={deleting}
        title={`Delete ${title.toLowerCase()}?`}
        message="This action cannot be undone."
      />
    </Card>
  );
}