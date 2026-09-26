import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Plus, Search, Edit2, Trash2, GraduationCap, Eye, Phone, Mail, BookOpen, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PageHeader, Skeleton, EmptyState, ErrorState, StatusBadge } from "@/components/ui-kit";
import { Button, Field, Select, TextInput, Textarea } from "@/components/form";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { useApiQuery, asList } from "@/lib/hooks";
import { api, authorizedFetch, getApiBaseUrl, resolveFileUrl } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { toastError, toastSuccess } from "@/lib/errors";
import { TeacherIdCardPair, type TeacherIdCardPreviewModel } from "@/components/id-cards/IdCardPreview";
import { pdfApi } from "@/lib/pdfUtils";

export const Route = createFileRoute("/teachers")({
  head: () => ({ meta: [{ title: "Teachers — School ERP" }] }),
  component: () => <AppShell><Teachers /></AppShell>,
});

const empty = {
  fullName: "", phone: "", email: "", address: "", employeeNo: "", designation: "", salary: 0, status: "ACTIVE",
};

function Teachers() {
  const { can } = usePermissions();
  const canCreate = can("teachers.create");
  const canEdit = can("teachers.edit");
  const canDelete = can("teachers.delete");
  const list = useApiQuery<any>("/teachers");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modal, setModal] = useState<{ open: boolean; data: any | null }>({ open: false, data: null });
  const [view, setView] = useState<any | null>(null);
  const [assign, setAssign] = useState<any | null>(null);
  const [del, setDel] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const teachers = useMemo(() => {
    return asList<any>(list.data).filter((t) => {
      const text = `${t.fullName || ""} ${t.phone || ""} ${t.email || ""}`.toLowerCase();
      if (search && !text.includes(search.toLowerCase())) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      return true;
    });
  }, [list.data, search, statusFilter]);

  const save = async (form: any) => {
    setSaving(true);
    try {
      const allowed = ["fullName", "phone", "email", "address", "employeeNo", "designation", "salary", "status", "photoUrl"];
      const payload: Record<string, any> = {};
      for (const key of allowed) {
        if (form[key] !== undefined && form[key] !== "") payload[key] = form[key];
      }
      payload.salary = Number(form.salary) || 0;
      if (modal.data?.id) {
        await api.patch(`/teachers/${modal.data.id}`, payload);
        toast.success("Teacher updated");
      } else {
        const created: any = await api.post("/teachers", payload);
        if (form._pendingPhoto && created?.id) {
          try {
            await uploadTeacherPhoto(created.id, form._pendingPhoto as File);
          } catch (e: any) {
            toast.error(e.message || "Teacher saved, but photo upload failed");
          }
        }
        toast.success("Teacher added");
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
      await api.delete(`/teachers/${del.id}`);
      toast.success("Teacher removed");
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
        title="Teachers"
        description="Manage teaching staff profiles, contact details, and salaries."
        actions={canCreate ? (
          <Button onClick={() => setModal({ open: true, data: null })}>
            <Plus className="size-4" /> Add Teacher
          </Button>
        ) : undefined}
      />

      {/* Filters */}
      <Card className="mb-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <TextInput
              placeholder="Search by name, phone, email…"
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
        ) : teachers.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No teachers yet"
            description="Add your first teacher to get started."
            action={canCreate ? (
              <Button onClick={() => setModal({ open: true, data: null })}>
                <Plus className="size-4" /> Add Teacher
              </Button>
            ) : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Phone</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Email</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Subjects</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Salary</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {teachers.map((t) => (
                  <tr key={t.id} className="border-t hover:bg-muted/30 transition">
                    <td className="px-4 py-3 font-medium">{t.fullName}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t.phone ? (
                        <span className="flex items-center gap-1.5">
                          <Phone className="size-3.5" /> {t.phone}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t.email ? (
                        <span className="flex items-center gap-1.5">
                          <Mail className="size-3.5" /> {t.email}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t.subjectsTaught?.length
                        ? t.subjectsTaught.map((s: any) => s.name).join(", ")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {t.salary ? `PKR ${Number(t.salary).toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setView(t)}
                          className="size-8 grid place-items-center rounded-lg hover:bg-muted"
                          title="View"
                        >
                          <Eye className="size-4" />
                        </button>
                        {canEdit && (
                        <button
                          onClick={() => setAssign(t)}
                          className="size-8 grid place-items-center rounded-lg hover:bg-muted"
                          title="Assign subjects"
                        >
                          <BookOpen className="size-4" />
                        </button>
                        )}
                        {canEdit && (
                        <button
                          onClick={() => setModal({ open: true, data: t })}
                          className="size-8 grid place-items-center rounded-lg hover:bg-muted"
                          title="Edit"
                        >
                          <Edit2 className="size-4" />
                        </button>
                        )}
                        {canDelete && (
                        <button
                          onClick={() => setDel(t)}
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
        <TeacherForm
          initial={modal.data}
          onClose={() => setModal({ open: false, data: null })}
          onSave={save}
          saving={saving}
          isEdit={!!modal.data}
        />
      )}

      {/* View Modal */}
      <Modal open={!!view} onClose={() => setView(null)} title={view?.fullName || "Teacher"} size="md">
        {view && (
          <div className="space-y-4 text-sm">
            <TeacherPhoto
              teacher={view}
              canEdit={canEdit}
              onUpdated={(photoUrl) => { setView({ ...view, photoUrl }); list.refetch(); }}
            />
            <div className="grid sm:grid-cols-2 gap-4">
              <Info label="Full Name" value={view.fullName} />
              <Info label="Employee No" value={view.employeeNo} />
              <Info label="Designation" value={view.designation} />
              <Info label="Phone" value={view.phone} />
              <Info label="Email" value={view.email} />
              <Info label="Monthly Salary" value={view.salary ? `PKR ${Number(view.salary).toLocaleString()}` : null} />
              <Info label="Status" value={<StatusBadge status={view.status} />} />
              <div className="sm:col-span-2"><Info label="Address" value={view.address} /></div>
              <div className="sm:col-span-2 border-t pt-3">
                <Info
                  label="Subjects Taught"
                  value={view.subjectsTaught?.length
                    ? view.subjectsTaught
                        .map((s: any) => [s.class?.name, s.section?.name, s.name].filter(Boolean).join(" · "))
                        .join(", ")
                    : null}
                />
              </div>
              <Info
                label="Class Teacher Of"
                value={view.classesLed?.length ? view.classesLed.map((c: any) => c.name).join(", ") : null}
              />
              <Info
                label="Section Teacher Of"
                value={view.sectionsLed?.length
                  ? view.sectionsLed.map((s: any) => [s.class?.name, s.name].filter(Boolean).join(" · ")).join(", ")
                  : null}
              />
            </div>
            <TeacherIdCardPanel teacher={view} canManage={canEdit} />
          </div>
        )}
      </Modal>

      {assign && (
        <AssignSubjectsModal
          teacher={assign}
          onClose={() => setAssign(null)}
          onSaved={() => { setAssign(null); list.refetch(); }}
        />
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={remove}
        loading={deleting}
        title="Remove teacher?"
        message={`This will deactivate ${del?.fullName}. You can restore them later.`}
      />
    </div>
  );
}

function TeacherForm({
  initial, onClose, onSave, saving, isEdit,
}: {
  initial: any; onClose: () => void; onSave: (f: any) => void; saving: boolean; isEdit: boolean;
}) {
  const [f, setF] = useState({ ...empty, ...(initial || {}) });
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: string, v: any) => setF((p: typeof empty) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.fullName?.trim()) return toast.error("Full name is required");
    if (f.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
      return toast.error("Enter a valid email address");
    }
    if (isEdit && pendingPhoto && initial?.id) {
      try {
        const photoUrl = await uploadTeacherPhoto(initial.id, pendingPhoto);
        onSave({ ...f, photoUrl });
      } catch (err: any) {
        toast.error(err.message || "Photo upload failed");
      }
      return;
    }
    onSave({ ...f, _pendingPhoto: pendingPhoto });
  };

  const displayPhoto = previewUrl || (f.photoUrl ? resolveFileUrl(f.photoUrl) : "");

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Edit Teacher" : "Add Teacher"}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>
            {isEdit ? "Save changes" : "Add Teacher"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2 flex items-center gap-4">
          {displayPhoto ? (
            <img src={displayPhoto} alt="" className="size-16 rounded-xl object-cover border" />
          ) : (
            <div className="size-16 rounded-xl border border-dashed grid place-items-center text-muted-foreground">
              <ImageIcon className="size-5" />
            </div>
          )}
          <div>
            <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="w-3.5 h-3.5" /> {pendingPhoto || f.photoUrl ? "Change photo" : "Choose photo"}
            </Button>
            <p className="text-xs text-muted-foreground mt-1">Optional · JPG, PNG, WebP</p>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setPendingPhoto(file);
                setPreviewUrl(URL.createObjectURL(file));
              }}
            />
          </div>
        </div>
        <Field label="Full Name *">
          <TextInput
            value={f.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            placeholder="e.g. Ahmed Khan"
          />
        </Field>
        <Field label="Employee No">
          <TextInput
            value={f.employeeNo}
            onChange={(e) => set("employeeNo", e.target.value)}
            placeholder="e.g. EMP-001"
          />
        </Field>
        <Field label="Designation">
          <TextInput
            value={f.designation}
            onChange={(e) => set("designation", e.target.value)}
            placeholder="e.g. Senior Teacher"
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
            placeholder="teacher@school.edu"
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

async function uploadTeacherPhoto(teacherId: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await authorizedFetch(
    `${getApiBaseUrl()}/uploads/teacher/${teacherId}/photo`,
    { method: "POST", body: formData },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || "Upload failed");
  }
  const data = await res.json();
  return data.photoUrl as string;
}

function TeacherPhoto({
  teacher, canEdit, onUpdated,
}: { teacher: any; canEdit: boolean; onUpdated: (photoUrl: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const photoUrl = await uploadTeacherPhoto(teacher.id, file);
      toastSuccess("Teacher photo updated");
      onUpdated(photoUrl);
    } catch (e: any) {
      toastError(e, "Photo upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-4">
      {teacher.photoUrl ? (
        <img src={resolveFileUrl(teacher.photoUrl)} alt={teacher.fullName}
          className="size-20 rounded-xl object-cover border" />
      ) : (
        <div className="size-20 rounded-xl border border-dashed grid place-items-center text-muted-foreground">
          <ImageIcon className="size-6" />
        </div>
      )}
      {canEdit && (
        <div>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} loading={uploading}>
            <Upload className="w-3.5 h-3.5" /> {teacher.photoUrl ? "Replace photo" : "Upload photo"}
          </Button>
          <p className="text-xs text-muted-foreground mt-1.5">JPG, PNG or WebP up to 2 MB.</p>
          <input ref={fileRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </div>
      )}
    </div>
  );
}

function TeacherIdCardPanel({ teacher, canManage }: { teacher: any; canManage: boolean }) {
  const card = useApiQuery<any>(`/id-cards/teacher/${teacher.id}`);
  const [busy, setBusy] = useState("");

  const issue = async (path: "issue" | "reissue" | "revoke") => {
    setBusy(path);
    try {
      if (path === "revoke") await api.post(`/id-cards/teacher/${teacher.id}/revoke`);
      else if (path === "reissue") await api.post(`/id-cards/teacher/${teacher.id}/reissue`);
      else await api.post(`/id-cards/teacher/${teacher.id}`);
      toastSuccess(path === "revoke" ? "Card revoked" : path === "reissue" ? "Card reissued" : "Card generated");
      card.refetch();
    } catch (e: any) {
      toastError(e);
    } finally {
      setBusy("");
    }
  };

  const model: TeacherIdCardPreviewModel | null = card.data?.card
    ? {
        template: card.data.template,
        qrSvg: card.data.qrSvg,
        qrToken: card.data.qrToken,
        teacher: card.data.teacher,
        school: card.data.school,
        card: card.data.card,
      }
    : null;

  return (
    <div className="border-t pt-4 space-y-3">
      <div className="font-medium">Staff ID card</div>
      {card.loading && <Skeleton className="h-40" />}
      {model && <TeacherIdCardPair model={model} />}
      {!card.loading && !model && (
        <p className="text-xs text-muted-foreground">No active card yet.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {canManage && !model && (
          <Button size="sm" onClick={() => issue("issue")} loading={busy === "issue"}>Generate card</Button>
        )}
        {canManage && model && (
          <>
            <Button size="sm" variant="outline" onClick={() => issue("reissue")} loading={busy === "reissue"}>Reissue</Button>
            <Button size="sm" variant="destructive" onClick={() => issue("revoke")} loading={busy === "revoke"}>Revoke</Button>
          </>
        )}
        {model && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => pdfApi.teacherIdCards({ teacherIds: [teacher.id] }).catch((e) => toastError(e))}
          >
            PDF
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Assigns subjects by sending the complete desired set to PATCH /teachers/:id/subjects,
 * which also unassigns anything the user unticked.
 */
function AssignSubjectsModal({
  teacher, onClose, onSaved,
}: { teacher: any; onClose: () => void; onSaved: () => void }) {
  const subjects = useApiQuery<any>("/subjects", { limit: 200 });
  const [selected, setSelected] = useState<string[]>(
    () => (teacher.subjectsTaught ?? []).map((s: any) => s.id),
  );
  const [saving, setSaving] = useState(false);

  const rows = asList<any>(subjects.data);
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    setSaving(true);
    try {
      await api.patch(`/teachers/${teacher.id}/subjects`, { subjectIds: selected });
      toast.success("Subject assignments updated");
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Could not update subject assignments");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Assign Subjects · ${teacher.fullName}`}
      preventClose={saving}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Save assignments</Button>
        </>
      }
    >
      {subjects.loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
      ) : subjects.error ? (
        <ErrorState message={subjects.error} onRetry={subjects.refetch} />
      ) : rows.length === 0 ? (
        <EmptyState icon={BookOpen} title="No subjects yet"
          description="Create subjects under Classes & Curriculum first." />
      ) : (
        <div className="max-h-80 overflow-y-auto space-y-1">
          {rows.map((s) => (
            <label key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 cursor-pointer">
              <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)}
                className="size-4 rounded border-input" />
              <span className="text-sm">
                {s.name}
                <span className="text-muted-foreground">
                  {[s.class?.name, s.section?.name].filter(Boolean).length
                    ? ` · ${[s.class?.name, s.section?.name].filter(Boolean).join(" · ")}`
                    : ""}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
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
