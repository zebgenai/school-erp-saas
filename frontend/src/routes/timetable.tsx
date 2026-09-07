import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Calendar, Plus, Trash2, Edit2, Download, Printer } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PageHeader, Skeleton, EmptyState } from "@/components/ui-kit";
import { Button, Field, Select, TextInput } from "@/components/form";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { useApiQuery, asList } from "@/lib/hooks";
import { api } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { pdfApi } from "@/lib/pdfUtils";

const DAYS = ["MON","TUE","WED","THU","FRI","SAT"];
/** Map day abbreviation → numeric dayOfWeek (MON=1 … SAT=6) */
const DAY_TO_NUM: Record<string, number> = { MON:1, TUE:2, WED:3, THU:4, FRI:5, SAT:6, SUN:7 };

export const Route = createFileRoute("/timetable")({
  head: () => ({ meta: [{ title: "Timetable — School ERP" }] }),
  component: () => <AppShell><Timetable /></AppShell>,
});

function Timetable() {
  const { can } = usePermissions();
  const canManage = can("timetable.manage");
  const classes = useApiQuery<any>("/classes");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const slots = useApiQuery<any>(classId ? "/timetable" : null, {
    classId: classId || undefined,
    sectionId: sectionId || undefined,
  });
  const subjects = useApiQuery<any>("/subjects", { limit: 200 });
  const teachers = useApiQuery<any>("/teachers", { limit: 200 });
  const sections = useApiQuery<any>("/sections", { classId: classId || undefined });
  const [modal, setModal] = useState<{ open: boolean; data: any | null }>({ open: false, data: null });
  const [del, setDel] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedClass = asList<any>(classes.data).find((c) => c.id === classId);
  const sectionRows = asList<any>(sections.data).filter((s) => s.classId === classId);

  const rows = asList<any>(slots.data);
  const grid = useMemo(() => {
    const periods = Array.from(new Set(rows.map((r) => r.periodNo ?? r.period))).sort((a: any, b: any) => a - b);
    return { periods, byKey: Object.fromEntries(rows.map((r) => [`${r.dayOfWeek ?? DAY_TO_NUM[r.day]}-${r.periodNo ?? r.period}`, r])) };
  }, [rows]);

  const save = async (form: any) => {
    if (form.startTime >= form.endTime) {
      return toast.error("End time must be later than start time");
    }
    setBusy(true);
    try {
      const payload = {
        classId,
        sectionId: form.sectionId || null,
        dayOfWeek: DAY_TO_NUM[form.day] ?? form.dayOfWeek,
        periodNo: Number(form.period),
        startTime: form.startTime,
        endTime: form.endTime,
        subjectId: form.subjectId || null,
        teacherId: form.teacherId || null,
      };
      if (modal.data?.id) {
        await api.patch(`/timetable/${modal.data.id}`, payload);
        toast.success("Slot updated");
      } else {
        await api.post("/timetable", payload);
        toast.success("Slot added");
      }
      setModal({ open: false, data: null });
      slots.refetch();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await api.delete(`/timetable/${del.id}`); toast.success("Removed"); setDel(null); slots.refetch(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Timetable" description="Weekly class schedules."
        actions={classId ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => pdfApi.classTimetable(classId, selectedClass?.name, sectionId || undefined).catch((e: any) => toast.error(e.message))}>
              <Download className="size-4" /> Download
            </Button>
            <Button variant="outline" onClick={() => pdfApi.printClassTimetable(classId, sectionId || undefined).catch((e: any) => toast.error(e.message))}>
              <Printer className="size-4" /> Print
            </Button>
            {canManage && (
              <Button onClick={() => setModal({ open: true, data: null })}><Plus className="size-4" /> Add Slot</Button>
            )}
          </div>
        ) : undefined} />

      <Card className="mb-4">
        <div className="grid sm:grid-cols-2 gap-3 max-w-xl">
          <Field label="Class">
            <Select value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}>
              <option value="">Select class</option>
              {asList<any>(classes.data).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Section">
            <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}>
              <option value="">All sections</option>
              {sectionRows.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      {!classId ? <EmptyState icon={Calendar} title="Select a class to view timetable" /> :
        slots.loading ? <Skeleton className="h-64" /> :
        rows.length === 0 ? <EmptyState icon={Calendar} title="No slots yet" description="Click Add Slot to start building."
          action={canManage ? <Button onClick={() => setModal({ open: true, data: null })}><Plus className="size-4" /> Add Slot</Button> : undefined} /> : (
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Period</th>
                  {DAYS.map((d) => <th key={d} className="px-4 py-3 text-left font-medium text-muted-foreground">{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {grid.periods.map((p) => (
                  <tr key={p} className="border-t">
                    <td className="px-4 py-3 font-semibold">P{p}</td>
                    {DAYS.map((d, di) => {
                      const s = grid.byKey[`${di + 1}-${p}`];
                      return (
                        <td key={d} className="px-4 py-3 align-top">
                          {s ? (
                            <div className="group p-2 rounded-lg bg-primary/5 border border-primary/15">
                              <div className="font-medium text-xs">{s.subject?.name || s.subjectName}</div>
                              <div className="text-[11px] text-muted-foreground">{s.teacher?.fullName || s.teacherName || "—"}</div>
                              <div className="text-[10px] text-muted-foreground">{s.startTime}–{s.endTime}</div>
                              {canManage && (
                              <div className="flex gap-2 opacity-0 group-hover:opacity-100 mt-1">
                                <button onClick={() => setModal({ open: true, data: s })} title="Edit slot" className="text-muted-foreground hover:text-foreground">
                                  <Edit2 className="size-3" />
                                </button>
                                <button onClick={() => setDel(s)} title="Delete slot" className="text-destructive">
                                  <Trash2 className="size-3" />
                                </button>
                              </div>
                              )}
                            </div>
                          ) : <span className="text-muted-foreground/50">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

      {modal.open && (
        <SlotForm
          initial={modal.data}
          defaultSectionId={sectionId}
          subjects={asList(subjects.data)}
          teachers={asList(teachers.data)}
          sections={sectionRows}
          onClose={() => setModal({ open: false, data: null })}
          onSave={save}
          busy={busy}
        />
      )}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={busy} title="Delete slot?" message="This cannot be undone." />
    </div>
  );
}

function SlotForm({ initial, defaultSectionId, subjects, teachers, sections, onClose, onSave, busy }: any) {
  const [f, setF] = useState(() => ({
    day: DAYS[(initial?.dayOfWeek ?? 1) - 1] ?? "MON",
    period: initial?.periodNo ?? 1,
    startTime: initial?.startTime ?? "08:00",
    endTime: initial?.endTime ?? "08:45",
    subjectId: initial?.subjectId ?? "",
    teacherId: initial?.teacherId ?? "",
    sectionId: initial?.sectionId ?? defaultSectionId ?? "",
  }));
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  return (
    <Modal open onClose={onClose} title={initial ? "Edit Slot" : "Add Slot"} preventClose={busy}
      footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button loading={busy} onClick={() => onSave(f)}>Save</Button></>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Day"><Select value={f.day} onChange={(e) => set("day", e.target.value)}>{DAYS.map((d) => <option key={d}>{d}</option>)}</Select></Field>
        <Field label="Period"><TextInput type="number" min={1} max={12} value={f.period} onChange={(e) => set("period", Number(e.target.value))} /></Field>
        <Field label="Start Time"><TextInput type="time" value={f.startTime} onChange={(e) => set("startTime", e.target.value)} /></Field>
        <Field label="End Time"><TextInput type="time" value={f.endTime} onChange={(e) => set("endTime", e.target.value)} /></Field>
        <Field label="Section">
          <Select value={f.sectionId} onChange={(e) => set("sectionId", e.target.value)}>
            <option value="">Whole class</option>
            {sections.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Subject">
          <Select value={f.subjectId} onChange={(e) => set("subjectId", e.target.value)}>
            <option value="">Select…</option>
            {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Teacher">
          <Select value={f.teacherId} onChange={(e) => set("teacherId", e.target.value)}>
            <option value="">Select…</option>
            {teachers.map((t: any) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
