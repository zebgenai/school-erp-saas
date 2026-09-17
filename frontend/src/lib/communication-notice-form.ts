export const NOTICE_TARGET_ROLES = [
  { label: "All", value: "ALL" },
  { label: "Students", value: "STUDENT" },
  { label: "Parents", value: "PARENT" },
  { label: "Teachers", value: "TEACHER" },
] as const;

export const NOTICE_TYPES = [
  { label: "Announcement", value: "ANNOUNCEMENT" },
  { label: "Notice", value: "NOTICE" },
  { label: "Event", value: "EVENT" },
  { label: "Circular", value: "CIRCULAR" },
] as const;

const ALLOWED_TARGET_ROLES = new Set<string>(NOTICE_TARGET_ROLES.map((option) => option.value));

const LEGACY_TARGET_ROLES: Record<string, string> = {
  ALL: "ALL",
  STUDENT: "STUDENT",
  STUDENTS: "STUDENT",
  PARENT: "PARENT",
  PARENTS: "PARENT",
  TEACHER: "TEACHER",
  TEACHERS: "TEACHER",
};

export type NoticeFormField = {
  key: string;
  label: string;
  type?: "text" | "date" | "textarea" | "select";
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
  full?: boolean;
  defaultValue?: string;
  viewValue?: (row: any) => string;
};

export function noticeFormFields(typeDefault = "ANNOUNCEMENT"): NoticeFormField[] {
  return [
    { key: "title", label: "Title", required: true },
    { key: "type", label: "Type", type: "select", defaultValue: typeDefault, options: [...NOTICE_TYPES] },
    {
      key: "targetRoles",
      label: "Audience",
      type: "select",
      defaultValue: "ALL",
      options: [...NOTICE_TARGET_ROLES],
      viewValue: (row: any) => formatTargetRoles(row?.targetRoles),
    },
    { key: "startDate", label: "Publish Date", type: "date" },
    { key: "endDate", label: "Expiry Date", type: "date" },
    {
      key: "isPublished",
      label: "Status",
      type: "select",
      defaultValue: "true",
      options: [
        { label: "Published", value: "true" },
        { label: "Draft", value: "false" },
      ],
      viewValue: (row: any) => (row?.isPublished ? "Published" : "Draft"),
    },
    { key: "content", label: "Message", type: "textarea", full: true, required: true },
  ];
}

export function formatTargetRoles(value?: string | null): string {
  if (!value) return "All";
  const mapped = LEGACY_TARGET_ROLES[value.trim().toUpperCase()] || value;
  return NOTICE_TARGET_ROLES.find((option) => option.value === mapped)?.label || mapped;
}

export function normalizeTargetRoles(value: unknown): string {
  const raw = String(value ?? "ALL").trim().toUpperCase();
  if (!raw) return "ALL";
  const mapped = LEGACY_TARGET_ROLES[raw] || raw.split(",")[0]?.trim() || "ALL";
  return ALLOWED_TARGET_ROLES.has(mapped) ? mapped : "ALL";
}

export function parseIsPublished(value: unknown): boolean {
  if (value === true || value === "true" || value === "ACTIVE" || value === "PUBLISHED") return true;
  if (value === false || value === "false" || value === "DRAFT" || value === "INACTIVE") return false;
  return Boolean(value);
}

export function toNoticeFormValues(row: Record<string, any> | null | undefined): Record<string, unknown> {
  if (!row) return {};
  return {
    title: row.title ?? "",
    type: row.type ?? "NOTICE",
    targetRoles: normalizeTargetRoles(row.targetRoles),
    startDate: String(row.startDate || "").slice(0, 10),
    endDate: String(row.endDate || "").slice(0, 10),
    isPublished: row.isPublished ? "true" : "false",
    content: row.content ?? "",
  };
}

function optionalDate(value: unknown): string | undefined {
  const raw = String(value ?? "").trim();
  return raw ? raw : undefined;
}

/** POST/PATCH body for CreateNoticeDto / UpdateNoticeDto. isPublished is synced via publish/unpublish. */
export function buildNoticePayload(form: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: form.title,
    type: form.type,
    content: form.content,
    targetRoles: normalizeTargetRoles(form.targetRoles),
  };
  const startDate = optionalDate(form.startDate);
  const endDate = optionalDate(form.endDate);
  if (startDate) payload.startDate = startDate;
  if (endDate) payload.endDate = endDate;
  return payload;
}

export async function syncNoticePublishState(opts: {
  noticeId: string;
  wasPublished: boolean;
  wantPublished: boolean;
  publish: (id: string) => Promise<unknown>;
  unpublish: (id: string) => Promise<unknown>;
}): Promise<"publish" | "unpublish" | "none"> {
  if (opts.wantPublished && !opts.wasPublished) {
    await opts.publish(opts.noticeId);
    return "publish";
  }
  if (!opts.wantPublished && opts.wasPublished) {
    await opts.unpublish(opts.noticeId);
    return "unpublish";
  }
  return "none";
}
