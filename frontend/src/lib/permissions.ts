import { useAuth } from "./auth";

export type AppRole =
  | "SUPER_ADMIN"
  | "PLATFORM_MANAGER"
  | "SCHOOL_ADMIN"
  | "ACCOUNTANT"
  | "TEACHER"
  | "RECEPTIONIST"
  | "PARENT"
  | "STUDENT";

export function isPlatformStaff(role?: string) {
  return role === "SUPER_ADMIN" || role === "PLATFORM_MANAGER";
}

export function roleDisplayName(role?: string) {
  const labels: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    PLATFORM_MANAGER: "Manager",
    SCHOOL_ADMIN: "School Admin",
    ACCOUNTANT: "Accountant",
    TEACHER: "Teacher",
    RECEPTIONIST: "Receptionist",
    PARENT: "Parent",
    STUDENT: "Student",
  };
  return (role && labels[role]) || role || "User";
}

export type Permission =
  | "students.view" | "students.create" | "students.edit" | "students.delete"
  | "teachers.view" | "teachers.create" | "teachers.edit" | "teachers.delete"
  | "staff.view"    | "staff.create"    | "staff.edit"    | "staff.delete"
  | "parents.view"  | "parents.create"  | "parents.edit"  | "parents.delete"
  | "classes.view"  | "subjects.view"
  | "attendance.view" | "attendance.mark"
  | "exams.view"  | "exams.manage"
  | "results.view" | "results.enter"
  | "fees.view"   | "fees.manage"
  | "payroll.view" | "payroll.manage"
  | "expenses.view" | "expenses.manage"
  | "library.view"  | "library.manage"
  | "transport.view" | "transport.manage"
  | "communication.view" | "communication.manage"
  | "timetable.view" | "timetable.manage"
  | "academic-calendar.view" | "academic-calendar.manage"
  | "reports.view"
  | "settings.view" | "settings.manage"
  | "users.view" | "users.manage"
  | "super-admin.view";

/** Maps frontend permission checks to backend matrix keys */
const PERM_BACKEND_KEYS: Record<Permission, string[]> = {
  "students.view": ["students.view"],
  "students.create": ["students.create"],
  "students.edit": ["students.edit"],
  "students.delete": ["students.delete"],
  "teachers.view": ["teachers.view"],
  "teachers.create": ["teachers.create"],
  "teachers.edit": ["teachers.edit"],
  "teachers.delete": ["teachers.delete"],
  "staff.view": ["staff.view"],
  "staff.create": ["staff.create"],
  "staff.edit": ["staff.edit"],
  "staff.delete": ["staff.delete"],
  "parents.view": ["parents.view"],
  "parents.create": ["parents.create"],
  "parents.edit": ["parents.edit"],
  "parents.delete": ["parents.delete"],
  "classes.view": ["classes.view"],
  "subjects.view": ["subjects.view"],
  "attendance.view": ["attendance.view"],
  "attendance.mark": ["attendance.create", "attendance.edit"],
  "exams.view": ["exams.view"],
  "exams.manage": ["exams.create", "exams.edit", "exams.delete"],
  "results.view": ["results.view"],
  "results.enter": ["results.create", "results.edit"],
  "fees.view": ["fees.view"],
  "fees.manage": ["fees.create", "fees.edit", "fees.delete"],
  "payroll.view": ["payroll.view"],
  "payroll.manage": ["payroll.create", "payroll.edit", "payroll.delete"],
  "expenses.view": ["expenses.view"],
  "expenses.manage": ["expenses.create", "expenses.edit", "expenses.delete"],
  "library.view": ["library.view"],
  "library.manage": ["library.create", "library.edit", "library.delete"],
  "transport.view": ["transport.view"],
  "transport.manage": ["transport.create", "transport.edit", "transport.delete"],
  "communication.view": ["communication.view"],
  "communication.manage": ["communication.create", "communication.edit", "communication.delete"],
  "timetable.view": ["timetable.view"],
  "timetable.manage": ["timetable.create", "timetable.edit", "timetable.delete"],
  "academic-calendar.view": ["academic-calendar.view"],
  "academic-calendar.manage": [
    "academic-calendar.create",
    "academic-calendar.edit",
    "academic-calendar.delete",
  ],
  "reports.view": ["reports.view"],
  "settings.view": ["settings.view"],
  "settings.manage": ["settings.edit", "settings.create", "settings.delete"],
  "users.view": ["users.view"],
  "users.manage": ["users.create", "users.edit", "users.delete"],
  "super-admin.view": ["super-admin.view"],
};

const ROUTE_PERMISSIONS: Record<string, Permission | null> = {
  "/dashboard": null,
  "/students": "students.view",
  "/parents": "parents.view",
  "/teachers": "teachers.view",
  "/staff": "staff.view",
  "/users": "users.view",
  "/classes": "classes.view",
  "/subjects": "subjects.view",
  "/timetable": "timetable.view",
  "/academic-calendar": "academic-calendar.view",
  "/attendance": "attendance.view",
  "/exams": "exams.view",
  "/fees": "fees.view",
  "/payroll": "payroll.view",
  "/expenses": "expenses.view",
  "/library": "library.view",
  "/transport": "transport.view",
  "/communication": "communication.view",
  "/reports": "reports.view",
  "/roles": "settings.view",
  "/settings": "settings.view",
  "/super-admin": "super-admin.view",
  "/teacher": null,
  "/parent": null,
  "/student": null,
};

function hasBackendPerm(perms: Record<string, boolean>, perm: Permission): boolean {
  const keys = PERM_BACKEND_KEYS[perm];
  return keys.some((k) => perms[k] === true);
}

export function homeRouteForRole(role?: string): string {
  switch (role) {
    case "SUPER_ADMIN":
    case "PLATFORM_MANAGER":
      return "/super-admin";
    case "TEACHER":       return "/teacher";
    case "PARENT":        return "/parent";
    case "STUDENT":       return "/student";
    default:              return "/dashboard";
  }
}

export function usePermissions() {
  const { user } = useAuth();
  const role = (user?.role ?? "STUDENT") as AppRole;
  const perms: Record<string, boolean> = user?.permissions ?? {};

  const can = (p: Permission): boolean => {
    if (role === "SUPER_ADMIN" || role === "PLATFORM_MANAGER" || role === "SCHOOL_ADMIN") return true;
    return hasBackendPerm(perms, p);
  };

  const canRoute = (path: string): boolean => {
    // The academic calendar is readable from every portal, scoped server-side by audience.
    const isCalendar = path === "/academic-calendar" || path.startsWith("/academic-calendar/");
    if (role === "PARENT") {
      return isCalendar || path === "/parent" || path.startsWith("/parent/");
    }
    if (role === "STUDENT") {
      return isCalendar || path === "/student" || path.startsWith("/student/");
    }
    if (role === "TEACHER") {
      if (path === "/teacher" || path.startsWith("/teacher/")) return true;
    }
    if (isPlatformStaff(role) && !user?.schoolId) {
      return path === "/super-admin" || path.startsWith("/super-admin/");
    }

    const base = "/" + path.split("/").filter(Boolean)[0];
    const required = ROUTE_PERMISSIONS[base];
    if (required === null) return true;
    if (required === undefined) return role === "SCHOOL_ADMIN";
    return can(required);
  };

  return { role, can, canRoute, permissions: perms };
}
