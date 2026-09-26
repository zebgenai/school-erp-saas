import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyAttendanceQrToken } from "./qr-attendance-classify.ts";

describe("classifyAttendanceQrToken", () => {
  it("classifies a valid student CC1. token", () => {
    assert.equal(
      classifyAttendanceQrToken("CC1.abcdefghijklmnopqrstuvwxyz0123456789ABCD"),
      "student",
    );
  });

  it("classifies a valid teacher TCC1. token", () => {
    assert.equal(
      classifyAttendanceQrToken("TCC1.abcdefghijklmnopqrstuvwxyz0123456789ABCD"),
      "teacher",
    );
  });

  it("returns null for invalid / unknown prefixes", () => {
    assert.equal(classifyAttendanceQrToken("student-uuid"), null);
    assert.equal(classifyAttendanceQrToken("XX1.abc"), null);
    assert.equal(classifyAttendanceQrToken("CCT1.abc"), null);
  });

  it("returns null for empty or whitespace-only input", () => {
    assert.equal(classifyAttendanceQrToken(""), null);
    assert.equal(classifyAttendanceQrToken("   "), null);
    assert.equal(classifyAttendanceQrToken("\n\t"), null);
  });

  it("trims surrounding whitespace before classifying", () => {
    assert.equal(
      classifyAttendanceQrToken("  CC1.abcdefghijklmnopqrstuvwxyz0123456789ABCD  "),
      "student",
    );
    assert.equal(
      classifyAttendanceQrToken("\nTCC1.abcdefghijklmnopqrstuvwxyz0123456789ABCD\t"),
      "teacher",
    );
  });

  it("prefers TCC1. over CC1. (teacher checked first)", () => {
    // TCC1. does not start with CC1., but order must remain teacher-first.
    assert.equal(classifyAttendanceQrToken("TCC1.tokenbodyhere________________________"), "teacher");
    assert.equal(classifyAttendanceQrToken("CC1.tokenbodyhere_________________________"), "student");
  });
});
