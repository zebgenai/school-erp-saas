export type IdCardTemplateId = "CLASSIC" | "MODERN" | "PREMIUM" | "MINIMAL";

export const ID_CARD_TEMPLATES: Array<{ id: IdCardTemplateId; name: string; description: string }> = [
  { id: "CLASSIC", name: "Classic", description: "Traditional navy header with gold accents." },
  { id: "MODERN", name: "Modern", description: "Clean layout using the school theme color." },
  { id: "PREMIUM", name: "Premium", description: "Dark header with gold highlights." },
  { id: "MINIMAL", name: "Minimal", description: "Light border, generous space, quiet branding." },
];

export type StudentCardSource = {
  id: string;
  fullName?: string | null;
  admissionNo?: string | null;
  fatherName?: string | null;
  photoUrl?: string | null;
  status?: string | null;
  class?: { name?: string | null } | null;
  section?: { name?: string | null } | null;
};

export type SchoolCardSource = {
  name?: string | null;
  logoUrl?: string | null;
  themeColor?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  domain?: string | null;
};

export function mapStudentToCardFields(student: StudentCardSource, school: SchoolCardSource) {
  return {
    fullName: student.fullName ?? "",
    admissionNo: student.admissionNo ?? "",
    fatherName: student.fatherName ?? "",
    photoUrl: student.photoUrl ?? "",
    className: student.class?.name ?? "",
    sectionName: student.section?.name ?? "",
    status: student.status ?? "ACTIVE",
    schoolName: school.name ?? "",
    schoolLogoUrl: school.logoUrl ?? "",
    themeColor: school.themeColor ?? "#4f46e5",
    address: school.address ?? "",
    phone: school.phone ?? "",
    email: school.email ?? "",
    domain: school.domain ?? "",
  };
}

export function studentsMissingPhotos<T extends { id: string; fullName?: string; admissionNo?: string; photoUrl?: string | null; hasPhoto?: boolean }>(
  students: T[],
) {
  return students.filter((s) => !(s.hasPhoto ?? Boolean(s.photoUrl)));
}

export function activeStudentsOnly<T extends { status?: string | null }>(students: T[]) {
  return students.filter((s) => (s.status ?? "ACTIVE") === "ACTIVE");
}

/** Truthy checkbox values only — ignores leftover `false` keys after Clear/uncheck. */
export function selectedStudentIds(selected: Record<string, boolean>): string[] {
  return Object.entries(selected)
    .filter(([, on]) => on)
    .map(([id]) => id);
}

export function hasTruthySelection(selected: Record<string, boolean>): boolean {
  return Object.values(selected).some(Boolean);
}

/**
 * Students in scope for missing-photo warnings.
 * - Explicit truthy selections → those students only
 * - No truthy selections → entire provided list (class/section scope)
 */
export function studentsInSelectionScope<T extends { id: string }>(
  students: T[],
  selected: Record<string, boolean>,
): T[] {
  if (!hasTruthySelection(selected)) return students;
  return students.filter((s) => selected[s.id]);
}

export function cardPalette(template: IdCardTemplateId, themeColor?: string | null) {
  const theme = themeColor && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(themeColor) ? themeColor : "#4f46e5";
  switch (template) {
    case "MODERN":
      return { header: theme, accent: theme, text: "#0f172a", muted: "#64748b", bg: "#ffffff", back: theme, backText: "#ffffff" };
    case "PREMIUM":
      return { header: "#111827", accent: "#d4af37", text: "#111827", muted: "#6b7280", bg: "#fffbeb", back: "#111827", backText: "#fef3c7" };
    case "MINIMAL":
      return { header: "#ffffff", accent: "#94a3b8", text: "#334155", muted: "#94a3b8", bg: "#ffffff", back: "#f8fafc", backText: "#334155" };
    default:
      return { header: "#1e3a5f", accent: "#c9a227", text: "#1e293b", muted: "#64748b", bg: "#ffffff", back: "#1e3a5f", backText: "#ffffff" };
  }
}
