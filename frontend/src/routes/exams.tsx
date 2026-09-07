import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, ClipboardList, Edit2, Trash2, ArrowLeft, Download, Save, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PageHeader, Skeleton, EmptyState, StatusBadge, ErrorState } from "@/components/ui-kit";
import { Button, Field, Select, TextInput } from "@/components/form";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { useApiQuery, asList } from "@/lib/hooks";
import { api } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { pdfApi } from "@/lib/pdfUtils";

export const Route = createFileRoute("/exams")({
  head: () => ({ meta: [{ title: "Exams — School ERP" }] }),
  component: () => <AppShell><ExamsPage /></AppShell>,
});

function ExamsPage() {
  const { can } = usePermissions();
  const canManage = can("exams.manage");
  const list = useApiQuery<any>("/exams");
  const classes = useApiQuery<any>("/classes");
  const [modal, setModal] = useState<{ open: boolean; data: any | null }>({ open: false, data: null });
  const [del, setDel] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm] = useState<any>({ name: "", classId: "", startDate: "", endDate: "" });

  const open = (r: any | null) => { setForm(r ? { ...r, startDate: r.startDate?.slice(0, 10), endDate: r.endDate?.slice(0, 10) } : { name: "", classId: "", startDate: "", endDate: "" }); setModal({ open: true, data: r }); };

  const save = async () => {
    if (!form.name) return toast.error("Name required");
    setBusy(true);
    try {
      if (modal.data?.id) await api.patch(`/exams/${modal.data.id}`, form);
      else await api.post("/exams", form);
      toast.success("Saved"); setModal({ open: false, data: null }); list.refetch();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await api.delete(`/exams/${del.id}`); toast.success("Deleted"); setDel(null); list.refetch(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const rows = asList<any>(list.data);

  if (selected) return <ExamDetail exam={selected} onBack={() => setSelected(null)} canManage={canManage} />;

  return (
    <div>
      <PageHeader title="Exams & Results" description="Create exams, add subjects, enter marks, and view results."
        actions={canManage ? <Button onClick={() => open(null)}><Plus className="size-4" /> Create Exam</Button> : undefined} />

      <Card className="p-0 overflow-hidden">
        {list.loading ? <div className="p-6 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div> :
          list.error ? <ErrorState message={list.error} onRetry={list.refetch} /> :
          rows.length === 0 ? <EmptyState icon={ClipboardList} title="No exams yet"
            action={canManage ? <Button onClick={() => open(null)}><Plus className="size-4" /> Create Exam</Button> : undefined} /> : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left"><tr>
              <th className="px-4 py-3 font-medium text-muted-foreground">Exam</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Class</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Start</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">End</th>
              <th></th>
            </tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{e.name}</td>
                  <td className="px-4 py-3">{e.class?.name || asList<any>(classes.data).find((c) => c.id === e.classId)?.name || "—"}</td>
                  <td className="px-4 py-3">{e.startDate?.slice(0, 10) || "—"}</td>
                  <td className="px-4 py-3">{e.endDate?.slice(0, 10) || "—"}</td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <Button size="sm" variant="outline" onClick={() => setSelected(e)}>Open</Button>
                    {canManage && (
                      <>
                        <button onClick={() => open(e)} className="size-8 inline-grid place-items-center rounded-lg hover:bg-muted"><Edit2 className="size-4" /></button>
                        <button onClick={() => setDel(e)} className="size-8 inline-grid place-items-center rounded-lg hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={modal.open} onClose={() => setModal({ open: false, data: null })} title={`${modal.data ? "Edit" : "Create"} Exam`}
        footer={<><Button variant="outline" onClick={() => setModal({ open: false, data: null })}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
        <div className="space-y-3">
          <Field label="Exam Name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mid-term 2025" /></Field>
          <Field label="Class">
            <Select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
              <option value="">All</option>
              {asList<any>(classes.data).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date"><TextInput type="date" value={form.startDate || ""} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
            <Field label="End Date"><TextInput type="date" value={form.endDate || ""} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={busy} title="Delete exam?" message="This cannot be undone." />
    </div>
  );
}

function ExamDetail({ exam, onBack, canManage }: { exam: any; onBack: () => void; canManage: boolean }) {
  const subjects = useApiQuery<any>(`/exams/${exam.id}/subjects`);
  const results = useApiQuery<any>(`/exams/${exam.id}/results`);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ subjectId: "", maxMarks: 100, passMarks: 40 });
  const allSubjects = useApiQuery<any>("/subjects");

  const addSubject = async () => {
    setBusy(true);
    try { await api.post(`/exams/${exam.id}/subjects`, form); toast.success("Subject added"); setAddOpen(false); subjects.refetch(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3">
        <ArrowLeft className="size-4" /> Back to exams
      </button>
      <PageHeader title={exam.name} description={`Manage subjects, marks and results for this exam.`} />

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Subjects</h3>
            {canManage && <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="size-4" /> Add Subject</Button>}
          </div>
          {subjects.loading ? <Skeleton className="h-32" /> :
            asList(subjects.data).length === 0 ? <EmptyState icon={ClipboardList} title="No subjects added" /> : (
            <ul className="divide-y">
              {asList<any>(subjects.data).map((s) => (
                <li key={s.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{s.subject?.name || s.name}</div>
                    <div className="text-xs text-muted-foreground">Max {s.maxMarks} · Pass {s.passMarks}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Results</h3>
            <span className="text-xs text-muted-foreground">{asList(results.data).length} students</span>
          </div>
          {results.loading ? <Skeleton className="h-32" /> :
            asList(results.data).length === 0 ? <EmptyState icon={ClipboardList} title="No results yet" description="Marks will appear here once entered." /> : (
            <ul className="divide-y">
              {asList<any>(results.data).map((r, i) => (
                <li key={r.id || i} className="py-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{r.student?.fullName || r.studentName}</div>
                    <div className="text-xs text-muted-foreground">Total: {r.totalMarks ?? r.total ?? r.obtained ?? "—"} / {r.maxTotal ?? "—"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border bg-primary/10 text-primary border-primary/20">
                      {r.grade || "—"}
                    </span>
                    {r.student?.id && (
                      <>
                        <button title="Download Report Card PDF" onClick={() => pdfApi.reportCard(exam.id, r.student.id, r.student.admissionNo).catch((e) => toast.error(e.message))}
                          className="size-8 grid place-items-center rounded-lg hover:bg-primary/10 hover:text-primary">
                          <Download className="size-4" />
                        </button>
                        <button title="Print Report Card PDF" onClick={() => pdfApi.printReportCard(exam.id, r.student.id).catch((e) => toast.error(e.message))}
                          className="size-8 grid place-items-center rounded-lg hover:bg-muted">
                          <Download className="size-4" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {canManage && <ExamMarksEntry exam={exam} subjects={asList<any>(subjects.data)} />}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Subject to Exam"
        footer={<><Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button><Button onClick={addSubject} loading={busy}>Add</Button></>}>
        <div className="space-y-3">
          <Field label="Subject">
            <Select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
              <option value="">Select subject</option>
              {asList<any>(allSubjects.data).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max Marks"><TextInput type="number" value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: Number(e.target.value) })} /></Field>
            <Field label="Pass Marks"><TextInput type="number" value={form.passMarks} onChange={(e) => setForm({ ...form, passMarks: Number(e.target.value) })} /></Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ExamMarksEntry({ exam, subjects }: { exam: any; subjects: any[] }) {
  const classId = exam.classId || exam.class?.id || "";
  const [subjectId, setSubjectId] = useState("");
  const students = useApiQuery<any>(classId ? "/students" : null, classId ? { classId, limit: 200 } : undefined);
  const existingMarks = useApiQuery<any>(
    exam.id && subjectId ? `/exams/${exam.id}/marks` : null,
    subjectId ? { subjectId } : undefined,
  );
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const studentList = asList<any>(students.data);
  const markList = asList<any>(existingMarks.data);
  const selectedSubject = subjects.find((s) => (s.subjectId || s.subject?.id) === subjectId || s.id === subjectId);

  useEffect(() => {
    if (subjects.length > 0 && !subjectId) {
      const first = subjects[0];
      setSubjectId(first.subjectId || first.subject?.id || first.id);
    }
  }, [subjects, subjectId]);

  useEffect(() => {
    const m: Record<string, string> = {};
    markList.forEach((mk: any) => { m[mk.studentId] = String(mk.obtainedMarks ?? ""); });
    setMarks(m);
  }, [markList, subjectId]);

  const save = async () => {
    const sid = selectedSubject?.subjectId || selectedSubject?.subject?.id || subjectId;
    if (!exam.id || !sid) return toast.error("Select a subject");
    const records = studentList
      .filter((s) => marks[s.id] !== undefined && marks[s.id] !== "")
      .map((s) => ({ studentId: s.id, obtainedMarks: Number(marks[s.id]), remarks: "" }));
    if (records.length === 0) return toast.error("Enter marks for at least one student");
    setSaving(true);
    try {
      await api.post("/exams/marks/bulk", { examId: exam.id, subjectId: sid, records });
      toast.success("Marks saved");
      existingMarks.refetch();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save marks");
    } finally {
      setSaving(false);
    }
  };

  if (subjects.length === 0) return null;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2"><Users className="size-4 text-primary" /> Enter Marks</h3>
        <Button size="sm" onClick={save} loading={saving} disabled={!subjectId || studentList.length === 0}>
          <Save className="size-4" /> Save Marks
        </Button>
      </div>
      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="min-w-[240px]">
          {subjects.map((s) => {
            const sid = s.subjectId || s.subject?.id || s.id;
            return (
              <option key={s.id} value={sid}>
                {s.subject?.name || s.name} (Max {s.maxMarks})
              </option>
            );
          })}
        </Select>
      </div>
      {!classId ? (
        <EmptyState icon={Users} title="No class linked" description="Assign a class to this exam to enter marks." />
      ) : students.loading ? (
        <Skeleton className="h-48" />
      ) : studentList.length === 0 ? (
        <EmptyState icon={Users} title="No students" description="No students found for this exam's class." />
      ) : (
        <div className="divide-y max-h-[420px] overflow-y-auto border rounded-xl">
          {studentList.map((s: any) => (
            <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <span className="font-medium text-sm">{s.fullName}</span>
                <span className="text-muted-foreground text-xs ml-2">{s.admissionNo}</span>
              </div>
              <input
                type="number"
                min={0}
                max={selectedSubject?.maxMarks ?? 100}
                className="w-24 h-9 px-2 rounded-lg border bg-card text-sm text-right"
                placeholder="—"
                value={marks[s.id] ?? ""}
                onChange={(e) => setMarks((m) => ({ ...m, [s.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
