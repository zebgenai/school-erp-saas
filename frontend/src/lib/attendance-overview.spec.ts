import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { showsLegacyTodayAttendanceCards, showsSchoolAdminTodayOverview } from "./attendance-overview.ts";

describe("school admin today's attendance visibility", () => {
  it("shows the new section only for school admins", () => {
    assert.equal(showsSchoolAdminTodayOverview("SCHOOL_ADMIN"), true);
    for (const role of ["ACCOUNTANT", "RECEPTIONIST", "TEACHER", "SUPER_ADMIN", "PARENT", "STUDENT"]) {
      assert.equal(showsSchoolAdminTodayOverview(role), false, role);
    }
  });

  it("keeps the older today cards for accountant and receptionist", () => {
    assert.equal(showsLegacyTodayAttendanceCards("ACCOUNTANT", true), true);
    assert.equal(showsLegacyTodayAttendanceCards("RECEPTIONIST", true), true);
    assert.equal(showsLegacyTodayAttendanceCards("SCHOOL_ADMIN", true), false);
    assert.equal(showsLegacyTodayAttendanceCards("RECEPTIONIST", false), false);
  });

  it("wires the dashboard to those role checks", () => {
    const source = readFileSync(new URL("../routes/dashboard.tsx", import.meta.url), "utf8");
    assert.match(source, /showsSchoolAdminTodayOverview\(role\)/);
    assert.match(source, /showsLegacyTodayAttendanceCards\(role, showAttendanceCharts\)/);
    assert.match(source, /Today's Attendance/);
    assert.match(source, /\/attendance\/today-overview/);
    assert.match(source, /\/attendance\/today-roster/);
  });
});
