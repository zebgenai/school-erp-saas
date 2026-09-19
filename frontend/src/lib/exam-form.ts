const EXAM_WRITE_KEYS = [
  "name",
  "classId",
  "sectionId",
  "startDate",
  "endDate",
  "status",
  "description",
] as const;

export type ExamFormState = {
  name?: string;
  classId?: string;
  sectionId?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  description?: string;
  [key: string]: unknown;
};

function optionalDate(value: unknown): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : undefined;
}

function optionalString(value: unknown): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : undefined;
}

/**
 * CreateExamDto / UpdateExamDto payload.
 * Requires classId; omits empty optional dates; strips nested/read-only fields.
 */
export function buildExamPayload(form: ExamFormState): Record<string, unknown> {
  const name = String(form.name ?? "").trim();
  const classId = String(form.classId ?? "").trim();

  if (!name) throw new Error("Name required");
  if (!classId) throw new Error("Class is required");

  const payload: Record<string, unknown> = { name, classId };

  const sectionId = optionalString(form.sectionId);
  if (sectionId) payload.sectionId = sectionId;

  const startDate = optionalDate(form.startDate);
  if (startDate) payload.startDate = startDate;

  const endDate = optionalDate(form.endDate);
  if (endDate) payload.endDate = endDate;

  const status = optionalString(form.status);
  if (status) payload.status = status;

  const description = optionalString(form.description);
  if (description) payload.description = description;

  for (const key of Object.keys(payload)) {
    if (!(EXAM_WRITE_KEYS as readonly string[]).includes(key)) delete payload[key];
  }

  return payload;
}

export type ExamSubjectFormState = {
  subjectId?: string;
  maxMarks?: number | string;
  passMarks?: number | string;
  totalMarks?: number | string;
  passingMarks?: number | string;
};

/** CreateExamSubjectDto — UI labels Max/Pass map to totalMarks/passingMarks. */
export function buildExamSubjectPayload(form: ExamSubjectFormState): Record<string, unknown> {
  const subjectId = String(form.subjectId ?? "").trim();
  if (!subjectId) throw new Error("Subject is required");

  const totalMarks = Number(form.totalMarks ?? form.maxMarks);
  const passingMarks = Number(form.passingMarks ?? form.passMarks);

  return {
    subjectId,
    totalMarks: Number.isFinite(totalMarks) ? totalMarks : 0,
    passingMarks: Number.isFinite(passingMarks) ? passingMarks : 0,
  };
}

/** Map backend exam-subject row into Max/Pass UI values. */
export function examSubjectMarks(row: Record<string, any> | null | undefined): {
  maxMarks: number;
  passMarks: number;
} {
  const maxMarks = Number(row?.totalMarks ?? row?.maxMarks ?? 0);
  const passMarks = Number(row?.passingMarks ?? row?.passMarks ?? 0);
  return {
    maxMarks: Number.isFinite(maxMarks) ? maxMarks : 0,
    passMarks: Number.isFinite(passMarks) ? passMarks : 0,
  };
}

export function toExamFormValues(row: Record<string, any> | null | undefined): ExamFormState {
  if (!row) return { name: "", classId: "", startDate: "", endDate: "" };
  return {
    name: row.name ?? "",
    classId: row.classId ?? row.class?.id ?? "",
    sectionId: row.sectionId ?? row.section?.id ?? "",
    startDate: row.startDate ? String(row.startDate).slice(0, 10) : "",
    endDate: row.endDate ? String(row.endDate).slice(0, 10) : "",
    status: row.status ?? "",
    description: row.description ?? "",
  };
}
