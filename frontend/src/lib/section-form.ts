export type SectionFormInput = {
  name?: string;
  classId?: string;
  teacherId?: string | null;
  [key: string]: unknown;
};

/** CreateSectionDto — name, classId required; optional teacherId. */
export function buildCreateSectionPayload(form: SectionFormInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: String(form.name ?? "").trim(),
    classId: String(form.classId ?? "").trim(),
  };
  payload.teacherId = form.teacherId ? form.teacherId : null;
  return payload;
}

/** UpdateSectionDto — name and teacherId only; never classId. */
export function buildUpdateSectionPayload(form: SectionFormInput): Record<string, unknown> {
  return {
    name: String(form.name ?? "").trim(),
    teacherId: form.teacherId ? form.teacherId : null,
  };
}

export function buildSectionPayload(
  form: SectionFormInput,
  isEdit: boolean,
): Record<string, unknown> {
  return isEdit ? buildUpdateSectionPayload(form) : buildCreateSectionPayload(form);
}
