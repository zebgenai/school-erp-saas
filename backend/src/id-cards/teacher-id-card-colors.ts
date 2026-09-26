/**
 * Teacher ID card design colors — school-scoped, independent of School.themeColor.
 * Null / missing values fall back to the professional teal staff defaults.
 */

export type TeacherIdCardColors = {
  primary: string;
  accent: string;
  background: string;
  text: string;
};

/** Safe teal/staff defaults used when a school has no custom design. */
export const DEFAULT_TEACHER_ID_CARD_COLORS: TeacherIdCardColors = {
  primary: '#115e59',
  accent: '#2dd4bf',
  background: '#ffffff',
  text: '#134e4a',
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value.trim());
}

/** Normalize #RGB → #RRGGBB; returns null if invalid. */
export function normalizeHexColor(value: unknown): string | null {
  if (!isValidHexColor(value)) return null;
  const raw = value.trim();
  if (raw.length === 4) {
    const r = raw[1];
    const g = raw[2];
    const b = raw[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return raw.toLowerCase();
}

export type TeacherIdCardColorSource = {
  teacherIdCardPrimaryColor?: string | null;
  teacherIdCardAccentColor?: string | null;
  teacherIdCardBackgroundColor?: string | null;
  teacherIdCardTextColor?: string | null;
};

export function resolveTeacherIdCardColors(
  school?: TeacherIdCardColorSource | null,
): TeacherIdCardColors {
  return {
    primary:
      normalizeHexColor(school?.teacherIdCardPrimaryColor) ??
      DEFAULT_TEACHER_ID_CARD_COLORS.primary,
    accent:
      normalizeHexColor(school?.teacherIdCardAccentColor) ??
      DEFAULT_TEACHER_ID_CARD_COLORS.accent,
    background:
      normalizeHexColor(school?.teacherIdCardBackgroundColor) ??
      DEFAULT_TEACHER_ID_CARD_COLORS.background,
    text:
      normalizeHexColor(school?.teacherIdCardTextColor) ??
      DEFAULT_TEACHER_ID_CARD_COLORS.text,
  };
}

export type TeacherCardRenderPalette = {
  header: string;
  accent: string;
  text: string;
  muted: string;
  bg: string;
  back: string;
  backText: string;
  badge: string;
};

/**
 * Build a render palette from configured colors + template structure.
 * Templates keep their intentional structure; configured colors drive the main palette.
 */
export function teacherCardPalette(
  template: string,
  colors: TeacherIdCardColors,
): TeacherCardRenderPalette {
  const { primary, accent, background, text } = colors;
  const muted = '#5b7c7a';

  switch (template) {
    case 'MODERN':
      return {
        header: primary,
        accent,
        text,
        muted,
        bg: background,
        back: primary,
        backText: '#ffffff',
        badge: primary,
      };
    case 'PREMIUM':
      return {
        header: '#0f172a',
        accent,
        text,
        muted,
        bg: background === '#ffffff' ? '#f0fdfa' : background,
        back: '#0f172a',
        backText: '#ccfbf1',
        badge: accent,
      };
    case 'MINIMAL':
      return {
        header: '#ffffff',
        accent,
        text,
        muted: '#94a3b8',
        bg: background,
        back: '#f8fafc',
        backText: text,
        badge: primary,
      };
    default:
      return {
        header: primary,
        accent,
        text,
        muted,
        bg: background,
        back: primary,
        backText: '#ffffff',
        badge: primary,
      };
  }
}
