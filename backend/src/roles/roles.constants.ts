import { UserRole } from '@prisma/client';

/** All modules tracked in the permission matrix */
export const MODULES = [
  'students',
  'parents',
  'teachers',
  'staff',
  'classes',
  'subjects',
  'attendance',
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
  'settings',
] as const;

export type Module = (typeof MODULES)[number];

/** Actions available per module */
export const ACTIONS = ['view', 'create', 'edit', 'delete', 'export'] as const;
export type Action = (typeof ACTIONS)[number];

/** Permission string = "module.action" */
export type PermKey = `${Module}.${Action}`;

/** Build the complete set of permission keys */
export const ALL_PERMISSION_KEYS: PermKey[] = MODULES.flatMap((m) =>
  ACTIONS.map((a) => `${m}.${a}` as PermKey),
);

/** Displayed label for each role */
export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'Super Admin',
  [UserRole.PLATFORM_MANAGER]: 'Manager',
  [UserRole.SCHOOL_ADMIN]: 'School Admin',
  [UserRole.ACCOUNTANT]: 'Accountant',
  [UserRole.TEACHER]: 'Teacher',
  [UserRole.RECEPTIONIST]: 'Receptionist',
  [UserRole.PARENT]: 'Parent',
  [UserRole.STUDENT]: 'Student',
};

/** Platform staff (no school). Super Admin owns the platform; Manager operates it. */
export const PLATFORM_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.PLATFORM_MANAGER];

export function isPlatformRole(role: UserRole): boolean {
  return PLATFORM_ROLES.includes(role);
}

/** Built-in roles that belong to a school (excludes platform Super Admin) */
export const SCHOOL_SCOPED_ROLES: UserRole[] = [
  UserRole.SCHOOL_ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.TEACHER,
  UserRole.RECEPTIONIST,
  UserRole.PARENT,
  UserRole.STUDENT,
];

/** Roles a custom school role may inherit from */
export const CUSTOM_BASE_ROLES: UserRole[] = [
  UserRole.ACCOUNTANT,
  UserRole.TEACHER,
  UserRole.RECEPTIONIST,
  UserRole.PARENT,
  UserRole.STUDENT,
];

/** Roles that are school-scoped and editable */
export const EDITABLE_ROLES: UserRole[] = [
  UserRole.ACCOUNTANT,
  UserRole.TEACHER,
  UserRole.RECEPTIONIST,
];

export function sanitisePermissions(permissions?: Record<string, boolean>): Record<string, boolean> {
  const sanitised: Record<string, boolean> = {};
  for (const key of ALL_PERMISSION_KEYS) {
    sanitised[key] = permissions?.[key] === true;
  }
  return sanitised;
}

/** Roles with fixed full access (cannot be downgraded) */
export const FIXED_FULL_ACCESS_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.PLATFORM_MANAGER,
  UserRole.SCHOOL_ADMIN,
];

/** Default permissions per role if no DB override exists */
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, Partial<Record<PermKey, boolean>>> = {
  SUPER_ADMIN: Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, true])) as Record<PermKey, boolean>,

  PLATFORM_MANAGER: Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, true])) as Record<PermKey, boolean>,

  SCHOOL_ADMIN: Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, true])) as Record<PermKey, boolean>,

  ACCOUNTANT: Object.fromEntries(
    ALL_PERMISSION_KEYS.map((k) => [
      k,
      k.startsWith('fees.') ||
        k.startsWith('payroll.') ||
        k.startsWith('expenses.') ||
        k.startsWith('reports.') ||
        k === 'students.view' ||
        k === 'parents.view' ||
        k === 'classes.view' ||
        k === 'academic-calendar.view' ||
        k === 'settings.view',
    ]),
  ) as Record<PermKey, boolean>,

  TEACHER: Object.fromEntries(
    ALL_PERMISSION_KEYS.map((k) => [
      k,
      k === 'students.view' ||
        k === 'parents.view' ||
        k === 'classes.view' ||
        k === 'subjects.view' ||
        k === 'attendance.view' ||
        k === 'attendance.create' ||
        k === 'attendance.edit' ||
        k === 'exams.view' ||
        k === 'results.view' ||
        k === 'results.create' ||
        k === 'results.edit' ||
        k === 'timetable.view' ||
        k === 'library.view' ||
        k === 'communication.view' ||
        k === 'notifications.view' ||
        k.startsWith('homework.') ||
        k.startsWith('online-classes.') ||
        k.startsWith('academic-calendar.') ||
        k === 'reports.view',
    ]),
  ) as Record<PermKey, boolean>,

  RECEPTIONIST: Object.fromEntries(
    ALL_PERMISSION_KEYS.map((k) => [
      k,
      k === 'students.view' ||
        k === 'students.create' ||
        k === 'students.edit' ||
        k === 'parents.view' ||
        k === 'parents.create' ||
        k === 'parents.edit' ||
        k === 'classes.view' ||
        k === 'attendance.view' ||
        k === 'communication.view' ||
        k === 'notifications.view' ||
        k === 'homework.view' ||
        k === 'online-classes.view' ||
        k === 'academic-calendar.view' ||
        k === 'fees.view',
    ]),
  ) as Record<PermKey, boolean>,

  PARENT: Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, false])) as Record<PermKey, boolean>,

  STUDENT: Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, false])) as Record<PermKey, boolean>,
};
