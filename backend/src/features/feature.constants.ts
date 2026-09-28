/**
 * Feature Control catalog — aligned with roles.constants MODULES where applicable.
 * Core features cannot be globally disabled. Controllable features support global + school overrides.
 */

export type FeatureCatalogEntry = {
  key: string;
  name: string;
  description: string;
  isCore: boolean;
};

/** Always-on / not globally disableable in V1. */
export const CORE_FEATURE_KEYS = [
  'authentication',
  'students',
  'parents',
  'teachers',
  'staff',
  'classes',
  'subjects',
  'attendance',
  'settings',
  'id-cards',
] as const;

/**
 * Controllable in Super Admin Feature Control.
 * Backend API enforcement Phase 2–3: module controllers, notifications admin,
 * reports page endpoints, and gated PDF downloads.
 * `results` is a catalog alias of `exams` (no independent runtime state).
 */
export const CONTROLLABLE_FEATURE_KEYS = [
  'exams',
  'results',
  'fees',
  'payroll',
  'expenses',
  'library',
  'transport',
  'communication',
  'notifications',
  'homework',
  'online-classes',
  'academic-calendar',
  'timetable',
  'reports',
] as const;

/**
 * Catalog keys that mirror another feature's effective state.
 * Mutations must target the canonical key; aliases reject independent changes.
 */
export const FEATURE_ALIASES: Record<string, string> = {
  results: 'exams',
};

export const RESULTS_LINKED_DESCRIPTION =
  'Marks and results — linked to Exams (follows Exams ON/OFF; no independent runtime state)';

export const FEATURE_CATALOG: FeatureCatalogEntry[] = [
  { key: 'authentication', name: 'Authentication', description: 'Login, sessions, and account access', isCore: true },
  { key: 'students', name: 'Students', description: 'Student records and management', isCore: true },
  { key: 'parents', name: 'Parents', description: 'Parent records and portal links', isCore: true },
  { key: 'teachers', name: 'Teachers', description: 'Teacher records and assignments', isCore: true },
  { key: 'staff', name: 'Staff', description: 'Non-teaching staff management', isCore: true },
  { key: 'classes', name: 'Classes', description: 'Classes and sections', isCore: true },
  { key: 'subjects', name: 'Subjects', description: 'Subject catalog', isCore: true },
  { key: 'attendance', name: 'Attendance', description: 'Student/teacher attendance and QR scanning (always on)', isCore: true },
  { key: 'settings', name: 'Settings', description: 'School settings', isCore: true },
  { key: 'id-cards', name: 'ID Cards', description: 'Student and teacher ID cards', isCore: true },

  { key: 'exams', name: 'Exams', description: 'Exam setup, marks, and results', isCore: false },
  { key: 'results', name: 'Results', description: RESULTS_LINKED_DESCRIPTION, isCore: false },
  { key: 'fees', name: 'Fees', description: 'Fee structures, invoices, and payments', isCore: false },
  { key: 'payroll', name: 'Payroll', description: 'Staff payroll', isCore: false },
  { key: 'expenses', name: 'Expenses', description: 'School expenses', isCore: false },
  { key: 'library', name: 'Library', description: 'Library books and issues', isCore: false },
  { key: 'transport', name: 'Transport', description: 'Vehicles and routes', isCore: false },
  { key: 'communication', name: 'Communication', description: 'Notices and announcements', isCore: false },
  { key: 'notifications', name: 'Notifications', description: 'In-app and campaign notifications', isCore: false },
  { key: 'homework', name: 'Homework', description: 'Homework assignments', isCore: false },
  { key: 'online-classes', name: 'Online Classes', description: 'Online class sessions', isCore: false },
  { key: 'academic-calendar', name: 'Academic Calendar', description: 'School calendar events', isCore: false },
  { key: 'timetable', name: 'Timetable', description: 'Class timetables', isCore: false },
  { key: 'reports', name: 'Reports', description: 'Analytics and reports', isCore: false },
];

export const ALL_FEATURE_KEYS = FEATURE_CATALOG.map((f) => f.key);

export function isKnownFeatureKey(key: string): boolean {
  return ALL_FEATURE_KEYS.includes(key);
}

export function isCoreFeatureKey(key: string): boolean {
  return (CORE_FEATURE_KEYS as readonly string[]).includes(key);
}

/** Canonical key used for effective resolution (aliases map to target). */
export function resolveCanonicalFeatureKey(key: string): string {
  return FEATURE_ALIASES[key] ?? key;
}

/** Stable machine-readable code for disabled features (alongside HTTP 403). */
export const FEATURE_DISABLED_CODE = 'FEATURE_DISABLED';
