import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ATTENDANCE_VOICE, speakAttendanceCue } from "./attendance-speech.ts";

describe("speakAttendanceCue", () => {
  it("does not throw when SpeechSynthesis is unavailable", () => {
    assert.doesNotThrow(() => speakAttendanceCue("Attendance done."));
    assert.doesNotThrow(() => speakAttendanceCue(""));
    assert.doesNotThrow(() => speakAttendanceCue("   "));
  });

  it("exposes stable cue phrases", () => {
    assert.equal(ATTENDANCE_VOICE.studentSuccess, "Attendance done.");
    assert.equal(ATTENDANCE_VOICE.teacherCheckIn, "Teacher attendance marked. Check in.");
    assert.equal(ATTENDANCE_VOICE.teacherCheckOut, "Teacher attendance marked. Check out.");
    assert.equal(ATTENDANCE_VOICE.alreadyMarked, "Attendance already marked.");
  });
});
