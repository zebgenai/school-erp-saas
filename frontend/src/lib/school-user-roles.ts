/**
 * School-admin assignable login roles (mirrors backend SCHOOL_ASSIGNABLE_ROLES).
 * Platform roles are intentionally excluded.
 */
export const SCHOOL_USER_ASSIGNABLE_ROLES = [
  "SCHOOL_ADMIN",
  "ACCOUNTANT",
  "TEACHER",
  "RECEPTIONIST",
  "ATTENDANCE_SCANNER",
  "PARENT",
] as const;

export type SchoolUserAssignableRole = (typeof SCHOOL_USER_ASSIGNABLE_ROLES)[number];

/** Tabs on the Users page (filter by role). */
export const SCHOOL_USER_ROLE_TABS: ReadonlyArray<{ id: SchoolUserAssignableRole; label: string }> = [
  { id: "SCHOOL_ADMIN", label: "School Admins" },
  { id: "TEACHER", label: "Teachers" },
  { id: "ACCOUNTANT", label: "Accountants" },
  { id: "RECEPTIONIST", label: "Receptionists" },
  { id: "ATTENDANCE_SCANNER", label: "Attendance Scanners" },
  { id: "PARENT", label: "Parents" },
];
