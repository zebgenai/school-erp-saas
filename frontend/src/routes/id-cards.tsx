import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, IdCard, Printer, QrCode, Search, Download } from "lucide-react";
import { toast } from "sonner";
import { toastError, toastSuccess } from "@/lib/errors";
import { AppShell } from "@/components/layout/AppShell";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui-kit";
import { Button, Field, Select, TextInput } from "@/components/form";
import {
  IdCardPair,
  TeacherIdCardPair,
  type IdCardPreviewModel,
  type TeacherIdCardPreviewModel,
} from "@/components/id-cards/IdCardPreview";
import { QrAttendanceScanner } from "@/components/id-cards/QrScanner";
import { useApiQuery, asList } from "@/lib/hooks";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import {
  ID_CARD_TEMPLATES,
  activeStudentsOnly,
  activeTeachersOnly,
  hasTruthySelection,
  selectedStudentIds,
  studentsInSelectionScope,
  studentsMissingPhotos,
  teachersMissingPhotos,
  DEFAULT_TEACHER_CARD_COLORS,
  resolveTeacherCardColors,
  type IdCardTemplateId,
  type TeacherCardColors,
} from "@/lib/id-card-data";
import {
  buildTeacherSettingsQuery,
  buildTeacherSettingsResetBody,
  buildTeacherSettingsSaveBody,
  mapSuperAdminSchoolsList,
  resolveTeacherSettingsTargetSchoolId,
  shouldApplyTeacherSettingsResponse,
  shouldShowTeacherSettingsSchoolPicker,
} from "@/lib/teacher-id-card-settings-ui";
import { pdfApi } from "@/lib/pdfUtils";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/id-cards")({
  head: () => ({ meta: [{ title: "ID Cards — School ERP" }] }),
  component: () => <AppShell><IdCardsPage /></AppShell>,
});

type Tab = "single" | "bulk" | "templates" | "scanner";
type Audience = "students" | "teachers";

function toPreviewModel(row: any): IdCardPreviewModel {
  return {
    template: row.template,
    qrSvg: row.qrSvg,
    qrToken: row.qrToken,
    student: row.student,
    school: row.school,
    card: row.card,
  };
}

function toTeacherPreviewModel(row: any): TeacherIdCardPreviewModel {
  return {
    template: row.template,
    qrSvg: row.qrSvg,
    qrToken: row.qrToken,
    teacher: row.teacher,
    school: row.school,
    card: row.card,
  };
}

function IdCardsPage() {
  const { can } = usePermissions();
  const { user } = useAuth();
  const canMark =
    can("attendance.mark") &&
    Boolean(user?.schoolId) &&
    user?.role !== "SUPER_ADMIN" &&
    user?.role !== "PLATFORM_MANAGER";
  const canManageStudents = can("students.edit");
  const canManageTeachers = can("teachers.edit");
  const [tab, setTab] = useState<Tab>("single");
  const [audience, setAudience] = useState<Audience>("students");
  const school = useApiQuery<any>("/schools/mine");
  const defaultTemplate = ((school.data as any)?.idCardTemplate || "CLASSIC") as IdCardTemplateId;
  const [template, setTemplate] = useState<IdCardTemplateId>(defaultTemplate);

  const tabs: { id: Tab; label: string; icon: any; hidden?: boolean }[] = [
    { id: "single", label: "Single card", icon: IdCard },
    { id: "bulk", label: "Bulk generate", icon: CreditCard },
    { id: "templates", label: "Templates", icon: CreditCard },
    { id: "scanner", label: "Scanner", icon: QrCode, hidden: !canMark || audience === "teachers" },
  ];

  return (
    <div>
      <PageHeader
        title="ID Cards"
        description={
          audience === "teachers"
            ? "Issue teacher staff ID cards with a secure QR token for future attendance."
            : "Print student ID cards with a secure QR code for attendance."
        }
      />
      <div className="flex flex-wrap gap-2 mb-4">
        {(["students", "teachers"] as Audience[]).map((a) => (
          <button
            key={a}
            onClick={() => {
              setAudience(a);
              if (a === "teachers" && tab === "scanner") setTab("single");
            }}
            className={cn(
              "h-8 px-3 rounded-lg text-sm font-medium border",
              audience === a ? "bg-muted border-primary/40" : "bg-card hover:bg-muted/60",
            )}
          >
            {a === "students" ? "Students" : "Teachers"}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.filter((t) => !t.hidden).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "h-9 px-3 rounded-lg text-sm font-medium border inline-flex items-center gap-2",
              tab === t.id ? "bg-primary text-primary-foreground border-transparent" : "bg-card hover:bg-muted",
            )}
          >
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>
      {tab === "single" && audience === "students" && (
        <SingleCard template={template} setTemplate={setTemplate} canManage={canManageStudents} />
      )}
      {tab === "single" && audience === "teachers" && (
        <SingleTeacherCard template={template} setTemplate={setTemplate} canManage={canManageTeachers} />
      )}
      {tab === "bulk" && audience === "students" && (
        <BulkCards template={template} setTemplate={setTemplate} canManage={canManageStudents} />
      )}
      {tab === "bulk" && audience === "teachers" && (
        <BulkTeacherCards template={template} setTemplate={setTemplate} canManage={canManageTeachers} />
      )}
      {tab === "templates" && (
        <div className="space-y-6">
          <TemplatesTab
            current={((school.data as any)?.idCardTemplate || template) as IdCardTemplateId}
            canManage={can("settings.manage")}
            schoolId={(school.data as any)?.id}
            onSaved={() => school.refetch()}
          />
          {audience === "teachers" && can("settings.manage") && (
            <TeacherIdCardDesignPanel
              ownSchoolId={(school.data as any)?.id ?? user?.schoolId ?? undefined}
              template={template}
            />
          )}
        </div>
      )}
      {tab === "scanner" && canMark && audience === "students" && (
        <Card>
          <h3 className="font-semibold mb-1">QR attendance scanner</h3>
          <p className="text-sm text-muted-foreground mb-4">Scan the back of a student ID card. Manual attendance is unchanged.</p>
          <QrAttendanceScanner mode="student" />
        </Card>
      )}
    </div>
  );
}

function TemplateSelect({ value, onChange }: { value: IdCardTemplateId; onChange: (v: IdCardTemplateId) => void }) {
  return (
    <Field label="Template">
      <Select value={value} onChange={(e) => onChange(e.target.value as IdCardTemplateId)}>
        {ID_CARD_TEMPLATES.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </Select>
    </Field>
  );
}

function SingleCard({
  template, setTemplate, canManage,
}: { template: IdCardTemplateId; setTemplate: (v: IdCardTemplateId) => void; canManage: boolean }) {
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [busy, setBusy] = useState("");
  const students = useApiQuery<any>("/students", { search: search || undefined, status: "ACTIVE", limit: 30 }, { enabled: search.length >= 1 });
  const card = useApiQuery<any>(studentId ? `/id-cards/student/${studentId}` : null);
  const list = asList<any>(students.data);

  const issue = async (path: "issue" | "reissue" | "revoke") => {
    if (!studentId) return;
    setBusy(path);
    try {
      if (path === "revoke") await api.post(`/id-cards/student/${studentId}/revoke`);
      else if (path === "reissue") await api.post(`/id-cards/student/${studentId}/reissue`);
      else await api.post(`/id-cards/student/${studentId}`);
      toastSuccess(path === "revoke" ? "Card revoked" : path === "reissue" ? "Card reissued" : "Card generated");
      card.refetch();
    } catch (e: any) { toastError(e); }
    finally { setBusy(""); }
  };

  const download = async () => {
    if (!studentId) return;
    try {
      await pdfApi.idCards({ studentIds: [studentId], template });
    } catch (e: any) { toastError(e); }
  };

  const print = async () => {
    if (!studentId) return;
    try {
      await pdfApi.printIdCards({ studentIds: [studentId], template });
    } catch (e: any) { toastError(e); }
  };

  const model = card.data?.card ? toPreviewModel({ ...card.data, template }) : null;

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="space-y-4">
        <Field label="Search student">
          <div className="relative">
            <Search className="size-4 absolute left-3 top-3.5 text-muted-foreground" />
            <TextInput className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or admission no" />
          </div>
        </Field>
        <div className="max-h-72 overflow-auto rounded-xl border divide-y">
          {list.map((s) => (
            <button
              key={s.id}
              onClick={() => setStudentId(s.id)}
              className={cn("w-full text-left px-3 py-2 text-sm hover:bg-muted/50", studentId === s.id && "bg-muted")}
            >
              <div className="font-medium">{s.fullName}</div>
              <div className="text-xs text-muted-foreground">{s.admissionNo} · {s.class?.name || "—"} {s.section?.name || ""}</div>
            </button>
          ))}
          {search && list.length === 0 && !students.loading && (
            <div className="px-3 py-6 text-sm text-muted-foreground">No active students match that search.</div>
          )}
        </div>
        <TemplateSelect value={template} onChange={setTemplate} />
      </Card>
      <Card className="lg:col-span-2">
        {!studentId && <EmptyState icon={IdCard} title="Select a student" description="Search and choose a student to preview their ID card." />}
        {studentId && card.loading && <Skeleton className="h-56" />}
        {studentId && model && (
          <div className="space-y-4">
            <IdCardPair model={model} template={template} />
            <div className="flex flex-wrap gap-2 justify-center">
              <Button variant="outline" onClick={download}><Download className="size-4" /> PDF</Button>
              <Button variant="outline" onClick={print}><Printer className="size-4" /> Print</Button>
              {canManage && !card.data?.card && <Button onClick={() => issue("issue")} loading={busy === "issue"}>Generate</Button>}
              {canManage && card.data?.card && (
                <>
                  <Button variant="outline" onClick={() => issue("reissue")} loading={busy === "reissue"}>Reissue</Button>
                  <Button variant="destructive" onClick={() => issue("revoke")} loading={busy === "revoke"}>Revoke</Button>
                </>
              )}
            </div>
          </div>
        )}
        {studentId && !card.loading && card.data && !card.data.card && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">No active card yet. Generate one to print a QR for attendance.</p>
            {canManage && <div className="flex justify-center"><Button onClick={() => issue("issue")} loading={busy === "issue"}>Generate card</Button></div>}
          </div>
        )}
      </Card>
    </div>
  );
}

function BulkCards({
  template, setTemplate, canManage,
}: { template: IdCardTemplateId; setTemplate: (v: IdCardTemplateId) => void; canManage: boolean }) {
  const classes = useApiQuery<any>("/classes");
  const sections = useApiQuery<any>("/sections");
  const [scope, setScope] = useState<"class" | "allActive">("class");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [photoChoice, setPhotoChoice] = useState<"ask" | "continue" | "review">("ask");
  const pendingAction = useRef<"preview" | "generate" | null>(null);
  const [lastResult, setLastResult] = useState<{
    generated: number;
    alreadyHadActiveCard: number;
    skippedInactive: number;
    failed: number;
  } | null>(null);

  const students = useApiQuery<any>(
    scope === "class" && classId ? "/students" : null,
    { classId, sectionId: sectionId || undefined, status: "ACTIVE", limit: 200 },
  );
  const studentList = useMemo(() => activeStudentsOnly(asList<any>(students.data)), [students.data]);
  const selectedIds = selectedStudentIds(selected);
  const scopeStudents = studentsInSelectionScope(studentList, selected);
  const missing = studentsMissingPhotos(scopeStudents);
  const pendingCount = preview?.pendingCount ?? preview?.cards?.filter((c: any) => !c.cardExists)?.length ?? 0;
  const canRun = scope === "allActive" || Boolean(classId) || hasTruthySelection(selected);

  const toggleAll = (on: boolean) => {
    const next: Record<string, boolean> = {};
    if (on) studentList.forEach((s) => { next[s.id] = true; });
    setSelected(next);
  };

  const selectionBody = (extra: Record<string, unknown> = {}) => {
    const body: Record<string, unknown> = { template, ...extra };
    if (scope === "allActive") {
      body.allActive = true;
      return body;
    }
    if (selectedIds.length) {
      body.studentIds = selectedIds;
      return body;
    }
    body.classId = classId;
    if (sectionId) body.sectionId = sectionId;
    return body;
  };

  const executePreview = async () => {
    setLoading(true);
    try {
      const res = await api.post("/id-cards/preview", selectionBody());
      setPreview(res);
      setLastResult(null);
      const pending = res.pendingCount ?? res.cards?.filter((c: any) => !c.cardExists)?.length ?? 0;
      const batchNote =
        res.nextCursor || res.hasMore
          ? ` · showing ${res.cards?.length ?? res.total} of school-wide active students (batch)`
          : "";
      toastSuccess(
        pending > 0
          ? `${res.total} layouts ready · ${pending} not issued yet (preview only)${batchNote}`
          : `${res.total} card${res.total === 1 ? "" : "s"} ready${batchNote}`,
      );
    } catch (e: any) {
      toastError(e);
    } finally {
      setLoading(false);
    }
  };

  const executeGenerate = async () => {
    if (!canManage) return;
    setGenerating(true);
    try {
      let cursor: string | undefined;
      let generated = 0;
      let alreadyHadActiveCard = 0;
      let skippedInactive = 0;
      let failed = 0;
      let lastCards: any[] = [];
      let guard = 0;
      do {
        const res: any = await api.post(
          "/id-cards/bulk-generate",
          selectionBody(cursor ? { cursor } : {}),
        );
        generated += res.generated ?? 0;
        alreadyHadActiveCard += res.alreadyHadActiveCard ?? 0;
        skippedInactive += res.skippedInactive ?? 0;
        failed += res.failed ?? 0;
        if (Array.isArray(res.cards)) lastCards = res.cards;
        cursor = res.nextCursor || undefined;
        guard += 1;
      } while (cursor && guard < 500);

      setLastResult({ generated, alreadyHadActiveCard, skippedInactive, failed });
      setPreview({
        cards: lastCards,
        total: lastCards.length,
        pendingCount: 0,
        missingPhotos: [],
      });
      toastSuccess(
        `Generated ${generated} · already had card ${alreadyHadActiveCard} · skipped ${skippedInactive} · failed ${failed}`,
      );
    } catch (e: any) {
      toastError(e);
    } finally {
      setGenerating(false);
    }
  };

  const runPreview = async () => {
    if (!canRun) return toast.error("Select a class, students, or All active students");
    if (scope === "class" && missing.length && photoChoice === "ask") {
      pendingAction.current = "preview";
      setPhotoChoice("review");
      return;
    }
    if (photoChoice === "review") return;
    pendingAction.current = null;
    await executePreview();
  };

  const runGenerate = async () => {
    if (!canManage) return;
    if (!canRun) return toast.error("Select a class, students, or All active students");
    if (scope === "class" && missing.length && photoChoice === "ask") {
      pendingAction.current = "generate";
      setPhotoChoice("review");
      return;
    }
    if (photoChoice === "review") return;
    pendingAction.current = null;
    await executeGenerate();
  };

  const continueAnyway = async () => {
    const action = pendingAction.current;
    pendingAction.current = null;
    setPhotoChoice("continue");
    if (action === "preview") await executePreview();
    else if (action === "generate") await executeGenerate();
  };

  const cancelPhotoWarning = () => {
    pendingAction.current = null;
    setPhotoChoice("ask");
  };

  const pdfBody = () => selectionBody();

  return (
    <div className="space-y-6">
      <Card className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Field label="Scope">
          <Select
            value={scope}
            onChange={(e) => {
              const next = e.target.value as "class" | "allActive";
              setScope(next);
              setSelected({});
              setPreview(null);
              setLastResult(null);
              setPhotoChoice("ask");
              pendingAction.current = null;
              if (next === "allActive") {
                setClassId("");
                setSectionId("");
              }
            }}
          >
            <option value="class">Class / section / selected</option>
            <option value="allActive">All active students</option>
          </Select>
        </Field>
        <Field label="Class">
          <Select
            value={classId}
            disabled={scope === "allActive"}
            onChange={(e) => {
              setClassId(e.target.value);
              setSectionId("");
              setSelected({});
              setPreview(null);
              setPhotoChoice("ask");
              pendingAction.current = null;
            }}
          >
            <option value="">Select class</option>
            {asList<any>(classes.data).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Section">
          <Select
            value={sectionId}
            disabled={scope === "allActive" || !classId}
            onChange={(e) => {
              setSectionId(e.target.value);
              setSelected({});
              setPreview(null);
              setPhotoChoice("ask");
              pendingAction.current = null;
            }}
          >
            <option value="">All sections</option>
            {asList<any>(sections.data).filter((s) => !classId || s.classId === classId).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <TemplateSelect value={template} onChange={setTemplate} />
        <div className="flex items-end gap-2">
          <Button className="w-full" variant="outline" onClick={runPreview} loading={loading} disabled={!canRun}>Preview</Button>
          {canManage && (
            <Button className="w-full" onClick={runGenerate} loading={generating} disabled={!canRun}>Generate</Button>
          )}
        </div>
      </Card>

      {scope === "allActive" && (
        <Card>
          <p className="text-sm text-muted-foreground">
            Generates QR cards for every active student in your school in safe batches of 200.
            Preview is read-only and shows the first batch. Generation is explicit and reports counts.
          </p>
        </Card>
      )}

      {scope === "class" && classId && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">{studentList.length} active students{sectionId ? " in section" : ""}</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => toggleAll(true)}>Select all</Button>
              <Button size="sm" variant="ghost" onClick={() => toggleAll(false)}>Clear</Button>
            </div>
          </div>
          <div className="max-h-64 overflow-auto divide-y rounded-xl border">
            {studentList.map((s) => (
              <label key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!selected[s.id]}
                  onChange={(e) => setSelected((prev) => ({ ...prev, [s.id]: e.target.checked }))}
                />
                <span className="font-medium">{s.fullName}</span>
                <span className="text-muted-foreground text-xs">{s.admissionNo}</span>
                {!s.photoUrl && <span className="ml-auto text-[11px] text-amber-700">No photo</span>}
              </label>
            ))}
          </div>
        </Card>
      )}

      {photoChoice === "review" && missing.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <p className="font-medium text-sm">{missing.length} student{missing.length === 1 ? "" : "s"} have no photo.</p>
          <p className="text-sm text-muted-foreground mt-1">Cards will show a placeholder unless you upload photos first.</p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={continueAnyway}>Continue anyway</Button>
            <Button size="sm" variant="ghost" onClick={cancelPhotoWarning}>Cancel</Button>
          </div>
          <ul className="mt-3 text-sm space-y-1">
            {missing.slice(0, 20).map((s) => <li key={s.id}>{s.fullName} · {s.admissionNo}</li>)}
          </ul>
        </Card>
      )}

      {lastResult && (
        <Card>
          <h3 className="font-semibold text-sm mb-2">Generation results</h3>
          <ul className="text-sm grid sm:grid-cols-2 gap-1 text-muted-foreground">
            <li>Generated: <span className="text-foreground font-medium">{lastResult.generated}</span></li>
            <li>Already had active card: <span className="text-foreground font-medium">{lastResult.alreadyHadActiveCard}</span></li>
            <li>Skipped inactive: <span className="text-foreground font-medium">{lastResult.skippedInactive}</span></li>
            <li>Failed: <span className="text-foreground font-medium">{lastResult.failed}</span></li>
          </ul>
        </Card>
      )}

      {preview?.cards?.length > 0 && (
        <Card>
          <div className="flex flex-wrap justify-between gap-2 mb-4">
            <div>
              <h3 className="font-semibold">{preview.total} cards</h3>
              {pendingCount > 0 && (
                <p className="text-xs text-muted-foreground">{pendingCount} not issued yet — Generate to mint QR tokens</p>
              )}
              {preview.missingPhotos?.length > 0 && (
                <p className="text-xs text-amber-700">{preview.missingPhotos.length} without photo</p>
              )}
              {(preview.nextCursor || preview.hasMore) && (
                <p className="text-xs text-muted-foreground">More active students remain — Generate walks all batches.</p>
              )}
            </div>
            <div className="flex gap-2">
              {canManage && pendingCount > 0 && (
                <Button onClick={runGenerate} loading={generating}>Generate QR cards</Button>
              )}
              <Button variant="outline" onClick={() => pdfApi.idCards(pdfBody()).catch((e) => toastError(e))}><Download className="size-4" /> PDF</Button>
              <Button variant="outline" onClick={() => pdfApi.printIdCards(pdfBody()).catch((e) => toastError(e))}><Printer className="size-4" /> Print</Button>
            </div>
          </div>
          <div className="space-y-8">
            {preview.cards.map((row: any) => (
              <div key={row.card?.id || row.student?.id} className="space-y-2">
                {!row.cardExists && (
                  <p className="text-center text-xs text-muted-foreground">Not issued — QR will appear after Generate</p>
                )}
                <IdCardPair model={toPreviewModel({ ...row, template })} template={template} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function SingleTeacherCard({
  template, setTemplate, canManage,
}: { template: IdCardTemplateId; setTemplate: (v: IdCardTemplateId) => void; canManage: boolean }) {
  const [search, setSearch] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [busy, setBusy] = useState("");
  const teachers = useApiQuery<any>("/teachers", { search: search || undefined, status: "ACTIVE", limit: 30 }, { enabled: search.length >= 1 });
  const card = useApiQuery<any>(teacherId ? `/id-cards/teacher/${teacherId}` : null);
  const list = asList<any>(teachers.data);

  const issue = async (path: "issue" | "reissue" | "revoke") => {
    if (!teacherId) return;
    setBusy(path);
    try {
      if (path === "revoke") await api.post(`/id-cards/teacher/${teacherId}/revoke`);
      else if (path === "reissue") await api.post(`/id-cards/teacher/${teacherId}/reissue`);
      else await api.post(`/id-cards/teacher/${teacherId}`);
      toastSuccess(path === "revoke" ? "Card revoked" : path === "reissue" ? "Card reissued" : "Card generated");
      card.refetch();
    } catch (e: any) { toastError(e); }
    finally { setBusy(""); }
  };

  const download = async () => {
    if (!teacherId) return;
    try {
      await pdfApi.teacherIdCards({ teacherIds: [teacherId], template });
    } catch (e: any) { toastError(e); }
  };

  const print = async () => {
    if (!teacherId) return;
    try {
      await pdfApi.printTeacherIdCards({ teacherIds: [teacherId], template });
    } catch (e: any) { toastError(e); }
  };

  const model = card.data?.card ? toTeacherPreviewModel({ ...card.data, template }) : null;

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="space-y-4">
        <Field label="Search teacher">
          <div className="relative">
            <Search className="size-4 absolute left-3 top-3.5 text-muted-foreground" />
            <TextInput className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or employee no" />
          </div>
        </Field>
        <div className="max-h-72 overflow-auto rounded-xl border divide-y">
          {list.map((t) => (
            <button
              key={t.id}
              onClick={() => setTeacherId(t.id)}
              className={cn("w-full text-left px-3 py-2 text-sm hover:bg-muted/50", teacherId === t.id && "bg-muted")}
            >
              <div className="font-medium">{t.fullName}</div>
              <div className="text-xs text-muted-foreground">{t.employeeNo || "No emp. ID"} · {t.designation || "Teacher"}</div>
            </button>
          ))}
          {search && list.length === 0 && !teachers.loading && (
            <div className="px-3 py-6 text-sm text-muted-foreground">No active teachers match that search.</div>
          )}
        </div>
        <TemplateSelect value={template} onChange={setTemplate} />
      </Card>
      <Card className="lg:col-span-2">
        {!teacherId && <EmptyState icon={IdCard} title="Select a teacher" description="Search and choose a teacher to preview their staff ID card." />}
        {teacherId && card.loading && <Skeleton className="h-56" />}
        {teacherId && model && (
          <div className="space-y-4">
            <TeacherIdCardPair model={model} template={template} />
            <div className="flex flex-wrap gap-2 justify-center">
              <Button variant="outline" onClick={download}><Download className="size-4" /> PDF</Button>
              <Button variant="outline" onClick={print}><Printer className="size-4" /> Print</Button>
              {canManage && !card.data?.card && <Button onClick={() => issue("issue")} loading={busy === "issue"}>Generate</Button>}
              {canManage && card.data?.card && (
                <>
                  <Button variant="outline" onClick={() => issue("reissue")} loading={busy === "reissue"}>Reissue</Button>
                  <Button variant="destructive" onClick={() => issue("revoke")} loading={busy === "revoke"}>Revoke</Button>
                </>
              )}
            </div>
          </div>
        )}
        {teacherId && !card.loading && card.data && !card.data.card && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">No active card yet. Generate one to print a teacher QR.</p>
            {canManage && <div className="flex justify-center"><Button onClick={() => issue("issue")} loading={busy === "issue"}>Generate card</Button></div>}
          </div>
        )}
      </Card>
    </div>
  );
}

function BulkTeacherCards({
  template, setTemplate, canManage,
}: { template: IdCardTemplateId; setTemplate: (v: IdCardTemplateId) => void; canManage: boolean }) {
  const [scope, setScope] = useState<"selected" | "allActive">("selected");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [photoChoice, setPhotoChoice] = useState<"ask" | "continue" | "review">("ask");
  const pendingAction = useRef<"preview" | "generate" | null>(null);
  const [lastResult, setLastResult] = useState<{
    generated: number;
    alreadyHadActiveCard: number;
    skippedInactive: number;
    failed: number;
  } | null>(null);

  const teachersQ = useApiQuery<any>(scope === "selected" ? "/teachers" : null, { status: "ACTIVE", limit: 200 });
  const teacherList = useMemo(() => activeTeachersOnly(asList<any>(teachersQ.data)), [teachersQ.data]);
  const selectedIds = selectedStudentIds(selected);
  const scopeTeachers = studentsInSelectionScope(teacherList, selected);
  const missing = teachersMissingPhotos(scopeTeachers);
  const pendingCount = preview?.pendingCount ?? preview?.cards?.filter((c: any) => !c.cardExists)?.length ?? 0;
  const canRun = scope === "allActive" || hasTruthySelection(selected);

  const toggleAll = (on: boolean) => {
    const next: Record<string, boolean> = {};
    if (on) teacherList.forEach((t) => { next[t.id] = true; });
    setSelected(next);
  };

  const selectionBody = (extra: Record<string, unknown> = {}) => {
    const body: Record<string, unknown> = { template, ...extra };
    if (scope === "allActive") {
      body.allActive = true;
      return body;
    }
    body.teacherIds = selectedIds;
    return body;
  };

  const executePreview = async () => {
    setLoading(true);
    try {
      const res = await api.post("/id-cards/teachers/preview", selectionBody());
      setPreview(res);
      setLastResult(null);
      toastSuccess(`${res.total} teacher layout${res.total === 1 ? "" : "s"} ready`);
    } catch (e: any) {
      toastError(e);
    } finally {
      setLoading(false);
    }
  };

  const executeGenerate = async () => {
    if (!canManage) return;
    setGenerating(true);
    try {
      let cursor: string | undefined;
      let generated = 0;
      let alreadyHadActiveCard = 0;
      let skippedInactive = 0;
      let failed = 0;
      let lastCards: any[] = [];
      let guard = 0;
      do {
        const res: any = await api.post(
          "/id-cards/teachers/bulk-generate",
          selectionBody(cursor ? { cursor } : {}),
        );
        generated += res.generated ?? 0;
        alreadyHadActiveCard += res.alreadyHadActiveCard ?? 0;
        skippedInactive += res.skippedInactive ?? 0;
        failed += res.failed ?? 0;
        if (Array.isArray(res.cards)) lastCards = res.cards;
        cursor = res.nextCursor || undefined;
        guard += 1;
      } while (cursor && guard < 500);

      setLastResult({ generated, alreadyHadActiveCard, skippedInactive, failed });
      setPreview({
        cards: lastCards,
        total: lastCards.length,
        pendingCount: 0,
        missingPhotos: [],
      });
      toastSuccess(
        `Generated ${generated} · already had card ${alreadyHadActiveCard} · skipped ${skippedInactive} · failed ${failed}`,
      );
    } catch (e: any) {
      toastError(e);
    } finally {
      setGenerating(false);
    }
  };

  const runPreview = async () => {
    if (!canRun) return toast.error("Select teachers or All active teachers");
    if (scope === "selected" && missing.length && photoChoice === "ask") {
      pendingAction.current = "preview";
      setPhotoChoice("review");
      return;
    }
    if (photoChoice === "review") return;
    pendingAction.current = null;
    await executePreview();
  };

  const runGenerate = async () => {
    if (!canManage) return;
    if (!canRun) return toast.error("Select teachers or All active teachers");
    if (scope === "selected" && missing.length && photoChoice === "ask") {
      pendingAction.current = "generate";
      setPhotoChoice("review");
      return;
    }
    if (photoChoice === "review") return;
    pendingAction.current = null;
    await executeGenerate();
  };

  const continueAnyway = async () => {
    const action = pendingAction.current;
    pendingAction.current = null;
    setPhotoChoice("continue");
    if (action === "preview") await executePreview();
    else if (action === "generate") await executeGenerate();
  };

  return (
    <div className="space-y-6">
      <Card className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Field label="Scope">
          <Select
            value={scope}
            onChange={(e) => {
              const next = e.target.value as "selected" | "allActive";
              setScope(next);
              setSelected({});
              setPreview(null);
              setLastResult(null);
              setPhotoChoice("ask");
              pendingAction.current = null;
            }}
          >
            <option value="selected">Selected teachers</option>
            <option value="allActive">All active teachers</option>
          </Select>
        </Field>
        <TemplateSelect value={template} onChange={setTemplate} />
        <div className="flex items-end gap-2 lg:col-span-2">
          <Button className="w-full" variant="outline" onClick={runPreview} loading={loading} disabled={!canRun}>Preview</Button>
          {canManage && (
            <Button className="w-full" onClick={runGenerate} loading={generating} disabled={!canRun}>Generate</Button>
          )}
        </div>
      </Card>

      {scope === "selected" && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">{teacherList.length} active teachers</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => toggleAll(true)}>Select all</Button>
              <Button size="sm" variant="ghost" onClick={() => toggleAll(false)}>Clear</Button>
            </div>
          </div>
          <div className="max-h-64 overflow-auto divide-y rounded-xl border">
            {teacherList.map((t) => (
              <label key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!selected[t.id]}
                  onChange={(e) => setSelected((prev) => ({ ...prev, [t.id]: e.target.checked }))}
                />
                <span className="font-medium">{t.fullName}</span>
                <span className="text-muted-foreground text-xs">{t.employeeNo || "—"}</span>
                {!t.photoUrl && <span className="ml-auto text-[11px] text-amber-700">No photo</span>}
              </label>
            ))}
          </div>
        </Card>
      )}

      {photoChoice === "review" && missing.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <p className="font-medium text-sm">{missing.length} teacher{missing.length === 1 ? "" : "s"} have no photo.</p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={continueAnyway}>Continue anyway</Button>
            <Button size="sm" variant="ghost" onClick={() => { pendingAction.current = null; setPhotoChoice("ask"); }}>Cancel</Button>
          </div>
        </Card>
      )}

      {lastResult && (
        <Card>
          <h3 className="font-semibold text-sm mb-2">Generation results</h3>
          <ul className="text-sm grid sm:grid-cols-2 gap-1 text-muted-foreground">
            <li>Generated: <span className="text-foreground font-medium">{lastResult.generated}</span></li>
            <li>Already had active card: <span className="text-foreground font-medium">{lastResult.alreadyHadActiveCard}</span></li>
            <li>Skipped inactive: <span className="text-foreground font-medium">{lastResult.skippedInactive}</span></li>
            <li>Failed: <span className="text-foreground font-medium">{lastResult.failed}</span></li>
          </ul>
        </Card>
      )}

      {preview?.cards?.length > 0 && (
        <Card>
          <div className="flex flex-wrap justify-between gap-2 mb-4">
            <div>
              <h3 className="font-semibold">{preview.total} teacher cards</h3>
              {pendingCount > 0 && (
                <p className="text-xs text-muted-foreground">{pendingCount} not issued yet — Generate to mint QR tokens</p>
              )}
            </div>
            <div className="flex gap-2">
              {canManage && pendingCount > 0 && (
                <Button onClick={runGenerate} loading={generating}>Generate QR cards</Button>
              )}
              <Button variant="outline" onClick={() => pdfApi.teacherIdCards(selectionBody()).catch((e) => toastError(e))}><Download className="size-4" /> PDF</Button>
              <Button variant="outline" onClick={() => pdfApi.printTeacherIdCards(selectionBody()).catch((e) => toastError(e))}><Printer className="size-4" /> Print</Button>
            </div>
          </div>
          <div className="space-y-8">
            {preview.cards.map((row: any) => (
              <div key={row.card?.id || row.teacher?.id} className="space-y-2">
                {!row.cardExists && (
                  <p className="text-center text-xs text-muted-foreground">Not issued — QR will appear after Generate</p>
                )}
                <TeacherIdCardPair model={toTeacherPreviewModel({ ...row, template })} template={template} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function TemplatesTab({ current, canManage, schoolId, onSaved }: { current: IdCardTemplateId; canManage: boolean; schoolId?: string; onSaved: () => void }) {
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!schoolId || !canManage) return;
    setSaving(true);
    try {
      await api.patch(`/schools/${schoolId}`, { idCardTemplate: value });
      toastSuccess("Template saved");
      onSaved();
    } catch (e: any) { toastError(e); }
    finally { setSaving(false); }
  };
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {ID_CARD_TEMPLATES.map((t) => (
        <button
          key={t.id}
          onClick={() => setValue(t.id)}
          className={cn("text-left rounded-2xl border p-4 hover:border-primary", value === t.id && "border-primary ring-2 ring-primary/20")}
        >
          <div className="font-semibold">{t.name}</div>
          <p className="text-sm text-muted-foreground mt-1">{t.description}</p>
        </button>
      ))}
      {canManage && (
        <div className="sm:col-span-2 flex justify-end">
          <Button onClick={save} loading={saving}>Save default template</Button>
        </div>
      )}
    </div>
  );
}

function TeacherIdCardDesignPanel({
  ownSchoolId,
  template,
}: {
  /** Logged-in school for SCHOOL_ADMIN. Ignored for SUPER_ADMIN targeting. */
  ownSchoolId?: string;
  template: IdCardTemplateId;
}) {
  const { user } = useAuth();
  const role = user?.role;
  const showSchoolPicker = shouldShowTeacherSettingsSchoolPicker(role);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const targetSchoolIdRef = useRef<string | null>(null);

  const schoolsQuery = useApiQuery<any>(
    showSchoolPicker ? "/super-admin/schools" : null,
    showSchoolPicker ? { limit: 200 } : undefined,
  );
  const schoolOptions = useMemo(
    () => mapSuperAdminSchoolsList(schoolsQuery.data),
    [schoolsQuery.data],
  );

  const targetSchoolId = resolveTeacherSettingsTargetSchoolId({
    role,
    ownSchoolId,
    selectedSchoolId: showSchoolPicker ? selectedSchoolId : null,
  });
  targetSchoolIdRef.current = targetSchoolId;

  const settingsQueryParams = buildTeacherSettingsQuery(role, targetSchoolId);
  const settings = useApiQuery<any>(
    targetSchoolId ? "/id-cards/teacher-settings" : null,
    settingsQueryParams,
  );

  const [colors, setColors] = useState<TeacherCardColors>({ ...DEFAULT_TEACHER_CARD_COLORS });
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Switching schools must drop previous school's colors immediately.
  useEffect(() => {
    setColors({ ...DEFAULT_TEACHER_CARD_COLORS });
  }, [targetSchoolId]);

  useEffect(() => {
    if (
      settings.data?.colors &&
      shouldApplyTeacherSettingsResponse(settings.data.schoolId, targetSchoolId)
    ) {
      setColors(resolveTeacherCardColors(settings.data.colors));
    }
  }, [settings.data, targetSchoolId]);

  const set = (key: keyof TeacherCardColors, value: string) =>
    setColors((c) => ({ ...c, [key]: value }));

  const selectedSchoolName =
    schoolOptions.find((s) => s.id === targetSchoolId)?.name ||
    (showSchoolPicker ? "Selected school" : "Your School");

  const previewModel: TeacherIdCardPreviewModel = {
    template,
    teacher: {
      fullName: "Sample Teacher",
      employeeNo: "EMP-001",
      designation: "Senior Teacher",
      photoUrl: null,
    },
    school: {
      name: selectedSchoolName,
      teacherCardColors: colors,
    },
    card: { reference: "EMP-001" },
  };

  const save = async () => {
    // Capture at click time so a mid-flight school switch cannot retarget the request.
    const schoolIdForRequest = targetSchoolId;
    if (!schoolIdForRequest) return;
    setSaving(true);
    try {
      const res: any = await api.patch(
        "/id-cards/teacher-settings",
        buildTeacherSettingsSaveBody(colors, role, schoolIdForRequest),
      );
      if (schoolIdForRequest !== targetSchoolIdRef.current) return;
      if (shouldApplyTeacherSettingsResponse(res.schoolId, schoolIdForRequest)) {
        setColors(resolveTeacherCardColors(res.colors));
      }
      toastSuccess("Teacher ID card design saved");
      settings.refetch();
    } catch (e: any) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    const schoolIdForRequest = targetSchoolId;
    if (!schoolIdForRequest) return;
    setResetting(true);
    try {
      const res: any = await api.post(
        "/id-cards/teacher-settings/reset",
        buildTeacherSettingsResetBody(role, schoolIdForRequest),
      );
      if (schoolIdForRequest !== targetSchoolIdRef.current) return;
      if (shouldApplyTeacherSettingsResponse(res.schoolId, schoolIdForRequest)) {
        setColors(resolveTeacherCardColors(res.colors));
      }
      toastSuccess("Reset to default teacher card colors");
      settings.refetch();
    } catch (e: any) {
      toastError(e);
    } finally {
      setResetting(false);
    }
  };

  const fields: Array<{ key: keyof TeacherCardColors; label: string }> = [
    { key: "primary", label: "Primary Color" },
    { key: "accent", label: "Accent Color" },
    { key: "background", label: "Background Color" },
    { key: "text", label: "Text Color" },
  ];

  const canEdit = Boolean(targetSchoolId);

  return (
    <Card>
      <h3 className="font-semibold text-base">Teacher ID Card Design</h3>
      <p className="text-sm text-muted-foreground mt-1 mb-4">
        Customize the portrait staff card colors. Student ID cards are unchanged.
      </p>
      {showSchoolPicker && (
        <div className="mb-4 max-w-md">
          <Field label="School">
            <Select
              value={selectedSchoolId}
              onChange={(e) => setSelectedSchoolId(e.target.value)}
              disabled={schoolsQuery.loading}
            >
              <option value="">Select a school…</option>
              {schoolOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.status && s.status !== "ACTIVE" ? ` (${s.status})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          {!selectedSchoolId && (
            <p className="text-xs text-muted-foreground mt-1">
              Choose a school to load and edit its teacher ID card colors.
            </p>
          )}
        </div>
      )}
      {!canEdit ? (
        showSchoolPicker ? null : (
          <p className="text-sm text-muted-foreground">School context is required to edit teacher card design.</p>
        )
      ) : settings.loading ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            {fields.map((f) => (
              <Field key={f.key} label={f.label}>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(colors[f.key]) ? colors[f.key] : "#115e59"}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="size-10 rounded border cursor-pointer bg-transparent"
                    aria-label={f.label}
                  />
                  <TextInput
                    value={colors[f.key]}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder="#115e59"
                    className="font-mono text-sm"
                  />
                </div>
              </Field>
            ))}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={save} loading={saving} disabled={!canEdit}>
                Save Changes
              </Button>
              <Button variant="outline" onClick={reset} loading={resetting} disabled={!canEdit}>
                Reset to Default
              </Button>
            </div>
          </div>
          <div className="flex justify-center items-start overflow-auto">
            <TeacherIdCardPair model={previewModel} template={template} />
          </div>
        </div>
      )}
    </Card>
  );
}
