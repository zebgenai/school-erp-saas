import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Plus, Search, Edit2, Trash2, Users, Eye, Upload, FileText, X, Download, Printer, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { toastSuccess, toastError } from "@/lib/errors";
import { AppShell } from "@/components/layout/AppShell";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { MonthYearFilter } from "@/components/MonthYearFilter";
import { Card, PageHeader, Skeleton, EmptyState, ErrorState, StatusBadge } from "@/components/ui-kit";
import { Button, Field, Select, TextInput, Textarea } from "@/components/form";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { useApiQuery, asList } from "@/lib/hooks";
import { api, authorizedFetch, getApiBaseUrl, resolveFileUrl } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { pdfApi } from "@/lib/pdfUtils";

export const Route = createFileRoute("/students")({
  head: () => ({ meta: [{ title: "Students — School ERP" }] }),
  component: () => <AppShell><Students /></AppShell>,
});

const empty = {
  admissionNo: "", admissionDate: "", fullName: "", fatherName: "",
  guardianPhone: "", whatsappNumber: "", gender: "MALE", dateOfBirth: "",
  address: "", classId: "", sectionId: "", monthlyFee: 0, feeStatus: "UNPAID", status: "ACTIVE",
};

function Students() {
  const { can } = usePermissions();
  const canCreate = can("students.create");
  const canEdit = can("students.edit");
  const canDelete = can("students.delete");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const list = useApiQuery<any>("/students", {
    search: search || undefined,
    classId: classFilter || undefined,
    sectionId: sectionFilter || undefined,
    month: monthFilter || undefined,
    year: yearFilter || undefined,
    limit: PAGE_SIZE,
    skip: page * PAGE_SIZE,
  });
  const hasFilters = Boolean(search || classFilter || sectionFilter || monthFilter || yearFilter);
  const clearFilters = () => {
    setSearch(""); setClassFilter(""); setSectionFilter("");
    setMonthFilter(""); setYearFilter(""); setPage(0);
  };
  const classes = useApiQuery<any>("/classes");
  const sections = useApiQuery<any>("/sections");
  const [modal, setModal] = useState<{ open: boolean; data: any | null }>({ open: false, data: null });
  const [view, setView] = useState<any | null>(null);
  const [del, setDel] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const students = asList<any>(list.data);
  const total = (list.data as any)?.total ?? students.length;

  const save = async (form: any) => {
    setSaving(true);
    try {
      // Only send fields accepted by the DTO — strip API-response-only fields
      const allowed = [
        "admissionNo", "admissionDate", "fullName", "fatherName",
        "guardianPhone", "whatsappNumber", "gender", "dateOfBirth",
        "address", "photoUrl", "classId", "sectionId", "monthlyFee", "feeStatus", "status",
      ];
      const payload: Record<string, any> = {};
      for (const key of allowed) {
        if (form[key] !== undefined && form[key] !== "") payload[key] = form[key];
      }
      payload.monthlyFee = Number(form.monthlyFee) || 0;
      if (payload.monthlyFee > 0) {
        payload.feeStatus = form.feeStatus === "PAID" ? "PAID" : "UNPAID";
      } else {
        delete payload.feeStatus;
      }

      if (modal.data?.id) {
        await api.patch(`/students/${modal.data.id}`, payload);
        toastSuccess("Student updated successfully");
      } else {
        await api.post("/students", payload);
        toastSuccess("Student created successfully");
      }
      setModal({ open: false, data: null });
      list.refetch();
    } catch (e: any) {
      toastError(e, "Save failed");
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!del) return;
    setDeleting(true);
    try {
      await api.delete(`/students/${del.id}`);
      toastSuccess("Student deleted successfully");
      setDel(null);
      list.refetch();
    } catch (e: any) {
      toastError(e, "Delete failed");
    } finally { setDeleting(false); }
  };

  return (
    <div>
      <PageHeader
        title="Students"
        description="Manage admissions, profiles, and student records."
        actions={canCreate ? (
          <Button onClick={() => setModal({ open: true, data: null })}>
            <Plus className="size-4" /> Add Student
          </Button>
        ) : undefined}
      />

      <Card className="mb-4">
        <div className="grid sm:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <TextInput placeholder="Search by name, admission no…" className="pl-10" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          </div>
          <Select value={classFilter} onChange={(e) => { setClassFilter(e.target.value); setPage(0); }}>
            <option value="">All Classes</option>
            {asList<any>(classes.data).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={sectionFilter} onChange={(e) => { setSectionFilter(e.target.value); setPage(0); }}>
            <option value="">All Sections</option>
            {asList<any>(sections.data).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <MonthYearFilter
            month={monthFilter}
            year={yearFilter}
            onMonthChange={(v) => { setMonthFilter(v); setPage(0); }}
            onYearChange={(v) => { setYearFilter(v); setPage(0); }}
            monthLabel="Admission: All Months"
            yearLabel="Admission: All Years"
          />
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {list.loading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.refetch} />
        ) : students.length === 0 ? (
          hasFilters ? (
            <EmptyState icon={Users} title="No matching records"
              description="No students match your current search or filters."
              action={<Button variant="outline" onClick={clearFilters}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={Users} title="No students yet" description="Add your first student to get started."
              action={canCreate ? (
                <Button onClick={() => setModal({ open: true, data: null })}><Plus className="size-4" /> Add Student</Button>
              ) : undefined} />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Adm No</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Father</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Class</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Phone</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Fee</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Fee Status</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-t hover:bg-muted/30 transition">
                    <td className="px-4 py-3 font-mono text-xs">{s.admissionNo}</td>
                    <td className="px-4 py-3 font-medium">{s.fullName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.fatherName}</td>
                    <td className="px-4 py-3">{s.class?.name || "—"} {s.section?.name ? `· ${s.section.name}` : ""}</td>
                    <td className="px-4 py-3">{s.guardianPhone}</td>
                    <td className="px-4 py-3">{s.monthlyFee}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.feeInvoices?.[0]?.status || (s.monthlyFee ? "UNPAID" : "—")} />
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setView(s)} title="View details" className="size-8 grid place-items-center rounded-lg hover:bg-muted"><Eye className="size-4" /></button>
                        <button onClick={() => pdfApi.printStudentProfile(s.id).catch((e) => toast.error(e.message))} title="Print student details"
                          className="size-8 grid place-items-center rounded-lg hover:bg-muted"><Printer className="size-4" /></button>
                        {canEdit && <button onClick={() => setModal({ open: true, data: s })} className="size-8 grid place-items-center rounded-lg hover:bg-muted"><Edit2 className="size-4" /></button>}
                        {canDelete && <button onClick={() => setDel(s)} className="size-8 grid place-items-center rounded-lg hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
                <span className="text-muted-foreground">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button size="sm" variant="outline" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {modal.open && (
        <StudentForm
          initial={modal.data || empty}
          classes={asList(classes.data)}
          sections={asList(sections.data)}
          onClose={() => setModal({ open: false, data: null })}
          onSave={save}
          saving={saving}
          isEdit={!!modal.data}
        />
      )}

      <Modal open={!!view} onClose={() => setView(null)} title={view?.fullName || "Student"} size="lg"
        footer={view ? (
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => pdfApi.studentProfile(view.id, view.admissionNo).catch((e) => toast.error(e.message))}>
              <Download className="size-4" /> Download Details
            </Button>
            <Button variant="outline" size="sm" onClick={() => pdfApi.printStudentProfile(view.id).catch((e) => toast.error(e.message))}>
              <Printer className="size-4" /> Print Student Details
            </Button>
          </div>
        ) : undefined}>
        {view && (
          <div className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <Info label="Admission No" value={view.admissionNo} />
              <Info label="Admission Date" value={view.admissionDate} />
              <Info label="Father" value={view.fatherName} />
              <Info label="Gender" value={view.gender} />
              <Info label="DOB" value={view.dateOfBirth} />
              <Info label="Phone" value={view.guardianPhone} />
              <Info label="WhatsApp" value={view.whatsappNumber} />
              <Info label="Class / Section" value={`${view.class?.name || "—"} / ${view.section?.name || "—"}`} />
              <Info label="Monthly Fee" value={view.monthlyFee} />
              <Info label="Fee Status" value={view.feeInvoices?.[0]?.status || (view.monthlyFee ? "UNPAID" : "—")} />
              <Info label="Status" value={view.status} />
              <div className="sm:col-span-2"><Info label="Address" value={view.address} /></div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Photo</h3>
              <StudentPhoto
                student={view}
                canEdit={canEdit}
                onUpdated={(photoUrl) => { setView({ ...view, photoUrl }); list.refetch(); }}
              />
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><FileText className="w-4 h-4" /> Documents</h3>
              <StudentDocuments studentId={view.id} />
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">Activity Timeline</h3>
              <ActivityTimeline entity="Student" entityId={view.id} />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={deleting}
        title="Delete student?" message={`This will remove ${del?.fullName}. This action cannot be undone.`}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium mt-0.5">{value || "—"}</div>
    </div>
  );
}

function StudentForm({
  initial, classes, sections, onClose, onSave, saving, isEdit,
}: any) {
  const [f, setF] = useState<any>({
    ...empty,
    ...initial,
    feeStatus: initial?.feeInvoices?.[0]?.status === "PAID" ? "PAID" : (initial?.feeStatus || "UNPAID"),
  });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.fullName?.trim()) return toast.error("Full name is required");
    if (!f.admissionNo?.trim()) return toast.error("Admission no is required");
    onSave(f);
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? "Edit Student" : "Add Student"} size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{isEdit ? "Save changes" : "Add Student"}</Button>
        </>
      }>
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
        <Field label="Admission No"><TextInput value={f.admissionNo} onChange={(e) => set("admissionNo", e.target.value)} /></Field>
        <Field label="Admission Date"><TextInput type="date" value={f.admissionDate?.slice(0, 10) || ""} onChange={(e) => set("admissionDate", e.target.value)} /></Field>
        <Field label="Full Name"><TextInput value={f.fullName} onChange={(e) => set("fullName", e.target.value)} /></Field>
        <Field label="Father Name"><TextInput value={f.fatherName} onChange={(e) => set("fatherName", e.target.value)} /></Field>
        <Field label="Guardian Phone"><TextInput value={f.guardianPhone} onChange={(e) => set("guardianPhone", e.target.value)} /></Field>
        <Field label="WhatsApp Number"><TextInput value={f.whatsappNumber} onChange={(e) => set("whatsappNumber", e.target.value)} /></Field>
        <Field label="Gender">
          <Select value={f.gender} onChange={(e) => set("gender", e.target.value)}>
            <option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
          </Select>
        </Field>
        <Field label="Date of Birth"><TextInput type="date" value={f.dateOfBirth?.slice(0, 10) || ""} onChange={(e) => set("dateOfBirth", e.target.value)} /></Field>
        <Field label="Class">
          <Select value={f.classId || ""} onChange={(e) => set("classId", e.target.value)}>
            <option value="">Select class</option>
            {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Section">
          <Select value={f.sectionId || ""} onChange={(e) => set("sectionId", e.target.value)}>
            <option value="">Select section</option>
            {sections.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
          </Select>
        </Field>
        <div className="sm:col-span-2 rounded-xl border bg-muted/30 p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fee</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Monthly Fee">
              <TextInput type="number" min={0} value={f.monthlyFee} onChange={(e) => set("monthlyFee", e.target.value)} />
            </Field>
            <Field label="Fee Status" hint="Creates this month's invoice as paid or unpaid.">
              <Select
                value={f.feeStatus || "UNPAID"}
                onChange={(e) => set("feeStatus", e.target.value)}
                disabled={!Number(f.monthlyFee)}
              >
                <option value="UNPAID">Unpaid</option>
                <option value="PAID">Paid</option>
              </Select>
            </Field>
          </div>
        </div>
        <div className="sm:col-span-2"><Field label="Address"><Textarea value={f.address} onChange={(e) => set("address", e.target.value)} /></Field></div>
      </form>
    </Modal>
  );
}

// ─── Student Photo ─────────────────────────────────────────────────────────────

/**
 * Reuses the existing authenticated student-document upload (type=PHOTO) and then points
 * `Student.photoUrl` at the stored file, so no new upload infrastructure is introduced.
 */
function StudentPhoto({
  student, canEdit, onUpdated,
}: { student: any; canEdit: boolean; onUpdated: (photoUrl: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await authorizedFetch(
        `${getApiBaseUrl()}/uploads/student/${student.id}/document?type=PHOTO`,
        { method: "POST", body: formData },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Upload failed");
      }
      const doc = await res.json();
      await api.patch(`/students/${student.id}`, { photoUrl: doc.fileUrl });
      toastSuccess("Student photo updated successfully");
      onUpdated(doc.fileUrl);
    } catch (e: any) {
      toastError(e, "Photo upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-4">
      {student.photoUrl ? (
        <img src={resolveFileUrl(student.photoUrl)} alt={student.fullName}
          className="size-20 rounded-xl object-cover border" />
      ) : (
        <div className="size-20 rounded-xl border border-dashed grid place-items-center text-muted-foreground">
          <ImageIcon className="size-6" />
        </div>
      )}
      {canEdit && (
        <div>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} loading={uploading}>
            <Upload className="w-3.5 h-3.5" /> {student.photoUrl ? "Replace photo" : "Upload photo"}
          </Button>
          <p className="text-xs text-muted-foreground mt-1.5">JPG, PNG or WebP up to 5 MB.</p>
          <input ref={fileRef} type="file" className="hidden" accept="image/*"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </div>
      )}
    </div>
  );
}

// ─── Document Upload Panel ─────────────────────────────────────────────────────

const DOC_TYPES = [
  { value: "BIRTH_CERTIFICATE", label: "Birth Certificate" },
  { value: "B_FORM",            label: "B-Form" },
  { value: "ID_CARD",           label: "ID Card" },
  { value: "TRANSFER_CERTIFICATE", label: "Transfer Certificate" },
  { value: "PHOTO",             label: "Photo" },
  { value: "OTHER",             label: "Other" },
];

export function StudentDocuments({ studentId }: { studentId: string }) {
  const docs = useApiQuery<any>(`/uploads/student/${studentId}/documents`);
  const docList = asList<any>(docs.data);
  const [docType, setDocType] = useState("BIRTH_CERTIFICATE");
  const [uploading, setUploading] = useState(false);
  const [delDoc, setDelDoc] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await authorizedFetch(
        `${getApiBaseUrl()}/uploads/student/${studentId}/document?type=${docType}`,
        { method: "POST", body: formData },
      );
      if (!res.ok) throw new Error("Upload failed");
      toastSuccess("Document uploaded successfully");
      docs.refetch();
    } catch (e: any) {
      toastError(e, "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const deleteDoc = async () => {
    if (!delDoc) return;
    setDeleting(true);
    try {
      await api.delete(`/uploads/document/${delDoc.id}`);
      toastSuccess("Document deleted successfully");
      setDelDoc(null);
      docs.refetch();
    } catch (e: any) { toastError(e); }
    finally { setDeleting(false); }
  };

  if (docs.loading) return <Skeleton className="h-20" />;
  if (docs.error) return <ErrorState message={docs.error} onRetry={docs.refetch} />;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <Select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-44">
          {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </Select>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} loading={uploading}>
          <Upload className="w-3.5 h-3.5" /> Upload
        </Button>
        <input ref={fileRef} type="file" className="hidden"
          accept="image/*,.pdf"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      </div>
      {docList.length === 0
        ? <EmptyState icon={FileText} title="No documents uploaded yet" description="Upload birth certificates, photos, or other student documents." />
        : docList.map((d: any) => (
          <div key={d.id} className="flex items-center justify-between gap-2 p-2 bg-muted/40 rounded-lg">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{d.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {DOC_TYPES.find(t => t.value === d.type)?.label ?? d.type}
                </p>
              </div>
            </div>
            <div className="flex gap-1">
              <a href={resolveFileUrl(d.fileUrl)} target="_blank" rel="noopener noreferrer"
                className="text-xs text-primary hover:underline px-2 py-1">View</a>
              <button onClick={() => setDelDoc(d)}
                className="p-1 hover:bg-destructive/10 hover:text-destructive rounded transition">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))
      }
      <ConfirmDialog open={!!delDoc} onClose={() => setDelDoc(null)} onConfirm={deleteDoc}
        title="Delete document?" message={`Remove "${delDoc?.fileName}"? This cannot be undone.`}
        loading={deleting} />
    </div>
  );
}
