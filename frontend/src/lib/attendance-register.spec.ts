import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attendanceCounts,
  bulkRecords,
  marksForSelection,
  marksFromStudents,
  registerMatches,
  saveBlockReason,
  scannerModeForRole,
  selectionKey,
} from "./attendance-register.ts";

function students(
  count: number,
  marked: Record<number, "PRESENT" | "ABSENT" | "LEAVE" | "LATE"> = {},
) {
  return Array.from({ length: count }, (_, index) => ({
    id: `s-${index + 1}`,
    fullName: `Student ${index + 1}`,
    admissionNo: `A-${index + 1}`,
    status: marked[index + 1] ?? null,
  }));
}

describe("attendance register helpers", () => {
  it("keeps an ABSENT record past the first page of 50", () => {
    const list = students(60, { 51: "ABSENT", 1: "PRESENT" });
    const marks = marksFromStudents(list);
    assert.equal(marks["s-51"], "ABSENT");
    assert.equal(marks["s-2"], undefined);
    const records = bulkRecords(
      list.map((student) => ({ ...student, status: marks[student.id] ?? "LEAVE" })),
      {
        ...marks,
        ...Object.fromEntries(
          list.filter((s) => !marks[s.id]).map((s) => [s.id, "LEAVE" as const]),
        ),
      },
    );
    assert.equal(records.length, 60);
    assert.equal(records[50].status, "ABSENT");
    assert.equal(records[50].studentId, "s-51");
  });

  it("keeps a LEAVE record past 200 students and does not invent Present", () => {
    const list = students(201, { 201: "LEAVE" });
    const marks = marksFromStudents(list);
    assert.equal(Object.keys(marks).length, 1);
    assert.equal(marks["s-201"], "LEAVE");
    assert.throws(() => bulkRecords(list, marks), /unmarked/);
    const counts = attendanceCounts(
      list.map((student) => student.id),
      marks,
    );
    assert.equal(counts.LEAVE, 1);
    assert.equal(counts.PRESENT, 0);
    assert.equal(counts.unmarked, 200);
  });

  it("blocks saving when saved attendance failed to load", () => {
    const reason = saveBlockReason({
      classId: "class-1",
      date: "2026-09-17",
      studentCount: 10,
      unmarked: 0,
      studentsLoading: false,
      attendanceLoading: false,
      attendanceError: "Could not load attendance",
      classesError: null,
      sectionsError: null,
      dateError: null,
    });
    assert.equal(reason, "Could not load attendance");
  });

  it("blocks saving while attendance is loading", () => {
    const reason = saveBlockReason({
      classId: "class-1",
      date: "2026-09-17",
      studentCount: 0,
      unmarked: 0,
      studentsLoading: false,
      attendanceLoading: true,
      attendanceError: null,
      classesError: null,
      sectionsError: null,
      dateError: null,
    });
    assert.match(reason || "", /loading/i);
  });

  it("does not reuse marks after the class, section, or date changes", () => {
    const loaded = marksFromStudents(students(2, { 1: "ABSENT", 2: "LATE" }));
    const loadedKey = selectionKey("class-a", "sec-1", "2026-09-17");
    assert.deepEqual(marksForSelection(loadedKey, loadedKey, loaded), loaded);
    assert.deepEqual(
      marksForSelection(loadedKey, selectionKey("class-b", "sec-1", "2026-09-17"), loaded),
      {},
    );
    assert.deepEqual(
      marksForSelection(loadedKey, selectionKey("class-a", "sec-2", "2026-09-17"), loaded),
      {},
    );
    assert.deepEqual(
      marksForSelection(loadedKey, selectionKey("class-a", "sec-1", "2026-09-18"), loaded),
      {},
    );
    assert.equal(
      registerMatches(
        { classId: "class-a", sectionId: "sec-1", date: "2026-09-17" },
        "class-b",
        "sec-1",
        "2026-09-17",
      ),
      false,
    );
  });

  it("gives receptionists a teacher-only scanner", () => {
    assert.equal(scannerModeForRole("RECEPTIONIST"), "teacher");
    assert.equal(scannerModeForRole("receptionist"), "teacher");
    assert.equal(scannerModeForRole("SCHOOL_ADMIN"), "auto");
    assert.equal(scannerModeForRole("TEACHER"), "auto");
    assert.equal(scannerModeForRole("ATTENDANCE_SCANNER"), "auto");
  });
});
