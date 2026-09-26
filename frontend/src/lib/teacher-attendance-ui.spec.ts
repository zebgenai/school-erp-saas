import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatWorkingHours,
  studentQrScanBody,
  teacherAttendanceStatusLabel,
  teacherQrScanBody,
} from "./teacher-attendance-ui.ts";

describe("teacher attendance UI helpers", () => {
  it("formats working hours from backend minutes", () => {
    assert.equal(formatWorkingHours(0), "0 min");
    assert.equal(formatWorkingHours(45), "45 min");
    assert.equal(formatWorkingHours(60), "1h");
    assert.equal(formatWorkingHours(503), "8h 23m");
    assert.equal(formatWorkingHours(null), "—");
  });

  it("teacher scanner posts qrToken; student scanner posts token", () => {
    assert.deepEqual(teacherQrScanBody("  TCC1.abc  "), { qrToken: "TCC1.abc" });
    assert.deepEqual(studentQrScanBody("  CC1.abc  "), { token: "CC1.abc" });
  });

  it("status labels for list rows", () => {
    assert.equal(teacherAttendanceStatusLabel({ checkOutAt: new Date() }), "Completed");
    assert.equal(teacherAttendanceStatusLabel({ checkInAt: new Date() }), "Checked in");
    assert.equal(teacherAttendanceStatusLabel({}), "—");
  });
});
