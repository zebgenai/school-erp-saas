import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ATTENDANCE_SCANNER_HOME,
  canRoutePath,
  homeRouteForRole,
  isAttendanceScannerRole,
  resolveAppNavKind,
  roleDisplayName,
} from "./permissions-routing.ts";
import {
  SCHOOL_USER_ASSIGNABLE_ROLES,
  SCHOOL_USER_ROLE_TABS,
} from "./school-user-roles.ts";
import { classifyAttendanceQrToken } from "./qr-attendance-classify.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("ATTENDANCE_SCANNER portal routing", () => {
  it("recognizes ATTENDANCE_SCANNER as a valid role with display name", () => {
    assert.equal(isAttendanceScannerRole("ATTENDANCE_SCANNER"), true);
    assert.equal(roleDisplayName("ATTENDANCE_SCANNER"), "Attendance Scanner");
    assert.equal(isAttendanceScannerRole("RECEPTIONIST"), false);
  });

  it("homeRouteForRole returns Unified Scanner path", () => {
    assert.equal(homeRouteForRole("ATTENDANCE_SCANNER"), ATTENDANCE_SCANNER_HOME);
    assert.equal(homeRouteForRole("ATTENDANCE_SCANNER"), "/attendance");
  });

  it("canRoute allows only the scanner attendance route", () => {
    assert.equal(
      canRoutePath({ role: "ATTENDANCE_SCANNER", path: "/attendance" }),
      true,
    );
  });

  it("canRoute denies dashboard even with attendance permissions present", () => {
    const perms = { "attendance.view": true, "attendance.create": true };
    assert.equal(
      canRoutePath({ role: "ATTENDANCE_SCANNER", path: "/dashboard", permissions: perms }),
      false,
    );
  });

  it("canRoute denies students, teachers, id-cards, users, fees, reports, settings", () => {
    const perms = { "attendance.view": true, "attendance.create": true };
    for (const path of [
      "/students",
      "/teachers",
      "/id-cards",
      "/users",
      "/fees",
      "/reports",
      "/settings",
      "/payroll",
      "/library",
      "/exams",
      "/classes",
      "/subjects",
      "/timetable",
      "/communication",
      "/academic-calendar",
      "/parent",
      "/teacher",
      "/student",
      "/super-admin",
    ]) {
      assert.equal(
        canRoutePath({ role: "ATTENDANCE_SCANNER", path, permissions: perms }),
        false,
        path,
      );
    }
  });

  it("resolveAppNavKind uses attendance-scanner portal (no school Dashboard fallback)", () => {
    assert.equal(resolveAppNavKind("ATTENDANCE_SCANNER", "school-1"), "attendance-scanner");
    assert.notEqual(resolveAppNavKind("ATTENDANCE_SCANNER", "school-1"), "school");
  });
});

describe("existing portal / staff routes remain intact", () => {
  it("PARENT / STUDENT / TEACHER / SCHOOL_ADMIN home routes unchanged", () => {
    assert.equal(homeRouteForRole("PARENT"), "/parent");
    assert.equal(homeRouteForRole("STUDENT"), "/student");
    assert.equal(homeRouteForRole("TEACHER"), "/teacher");
    assert.equal(homeRouteForRole("SCHOOL_ADMIN"), "/dashboard");
    assert.equal(homeRouteForRole("RECEPTIONIST"), "/dashboard");
  });

  it("SCHOOL_ADMIN can still reach dashboard and attendance via permissions", () => {
    assert.equal(canRoutePath({ role: "SCHOOL_ADMIN", path: "/dashboard" }), true);
    assert.equal(canRoutePath({ role: "SCHOOL_ADMIN", path: "/attendance" }), true);
    assert.equal(canRoutePath({ role: "SCHOOL_ADMIN", path: "/students" }), true);
  });

  it("TEACHER keeps teacher portal + permission routes", () => {
    assert.equal(canRoutePath({ role: "TEACHER", path: "/teacher" }), true);
    assert.equal(
      canRoutePath({
        role: "TEACHER",
        path: "/attendance",
        permissions: { "attendance.view": true },
      }),
      true,
    );
    assert.equal(
      canRoutePath({
        role: "TEACHER",
        path: "/fees",
        permissions: { "attendance.view": true },
      }),
      false,
    );
  });

  it("school admin nav kind remains school", () => {
    assert.equal(resolveAppNavKind("SCHOOL_ADMIN", "school-1"), "school");
    assert.equal(resolveAppNavKind("RECEPTIONIST", "school-1"), "school");
  });
});

describe("QR classification (unified scanner)", () => {
  it("routes CC1. to student and TCC1. to teacher; unknown invalid", () => {
    assert.equal(
      classifyAttendanceQrToken("CC1.abcdefghijklmnopqrstuvwxyz0123456789ABCD"),
      "student",
    );
    assert.equal(
      classifyAttendanceQrToken("TCC1.abcdefghijklmnopqrstuvwxyz0123456789ABCD"),
      "teacher",
    );
    assert.equal(classifyAttendanceQrToken("UNKNOWN.token"), null);
  });
});

describe("ID Cards scanner mode", () => {
  it("keeps student-only mode on the ID Cards page", () => {
    const src = readFileSync(join(here, "../routes/id-cards.tsx"), "utf8");
    assert.match(src, /QrAttendanceScanner\s+mode="student"/);
    assert.doesNotMatch(src, /QrAttendanceScanner\s+mode="auto"/);
  });
});

describe("Users role assignment UI lists", () => {
  it("includes Attendance Scanner in assignable roles and tabs", () => {
    assert.ok(SCHOOL_USER_ASSIGNABLE_ROLES.includes("ATTENDANCE_SCANNER"));
    assert.ok(SCHOOL_USER_ROLE_TABS.some((t) => t.id === "ATTENDANCE_SCANNER"));
    assert.equal(
      SCHOOL_USER_ROLE_TABS.find((t) => t.id === "ATTENDANCE_SCANNER")?.label,
      "Attendance Scanners",
    );
    assert.ok(!SCHOOL_USER_ASSIGNABLE_ROLES.includes("SUPER_ADMIN" as any));
    assert.ok(!SCHOOL_USER_ASSIGNABLE_ROLES.includes("PLATFORM_MANAGER" as any));
  });
});

describe("AppShell scanner nav source", () => {
  it("defines a dedicated Attendance Scanner nav without Dashboard", () => {
    const src = readFileSync(join(here, "../components/layout/AppShell.tsx"), "utf8");
    assert.match(src, /attendanceScannerNavGroups/);
    assert.match(src, /Unified Scanner/);
    assert.match(src, /attendance-scanner/);
    // Dashboard remains in schoolNavGroups for normal staff, not in scanner portal.
    const scannerBlock = src.slice(
      src.indexOf("attendanceScannerNavGroups"),
      src.indexOf("/** Navigation shown to TEACHER"),
    );
    assert.doesNotMatch(scannerBlock, /to:\s*"\/dashboard"/);
  });
});
