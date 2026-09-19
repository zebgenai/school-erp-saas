import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildExamPayload,
  buildExamSubjectPayload,
  examSubjectMarks,
  toExamFormValues,
} from "./exam-form.ts";

const FORBIDDEN = [
  "id",
  "schoolId",
  "examSubjects",
  "createdAt",
  "updatedAt",
  "class",
  "section",
  "subjects",
  "maxMarks",
  "passMarks",
];

describe("exam form", () => {
  it("requires classId and omits empty dates", () => {
    assert.throws(() => buildExamPayload({ name: "Mid", classId: "" }), /class/i);

    const payload = buildExamPayload({
      name: "Mid Term",
      classId: "class-1",
      startDate: "",
      endDate: "",
      description: "  ",
    });

    assert.equal(payload.name, "Mid Term");
    assert.equal(payload.classId, "class-1");
    assert.equal("startDate" in payload, false);
    assert.equal("endDate" in payload, false);
    assert.equal("description" in payload, false);
  });

  it("sanitizes edit payloads to UpdateExamDto fields only", () => {
    const payload = buildExamPayload({
      id: "exam-1",
      name: "Final",
      classId: "class-1",
      sectionId: "sec-1",
      startDate: "2026-06-01",
      endDate: "2026-06-10",
      status: "DRAFT",
      description: "Desc",
      schoolId: "school-1",
      examSubjects: [{ id: "es-1" }],
      class: { id: "class-1", name: "Grade 5" },
      createdAt: "2026-01-01",
      updatedAt: "2026-01-02",
    });

    assert.deepEqual(payload, {
      name: "Final",
      classId: "class-1",
      sectionId: "sec-1",
      startDate: "2026-06-01",
      endDate: "2026-06-10",
      status: "DRAFT",
      description: "Desc",
    });

    for (const key of FORBIDDEN) {
      assert.equal(key in payload, false, `must not send ${key}`);
    }
  });

  it("maps Max/Pass UI fields to totalMarks/passingMarks", () => {
    const payload = buildExamSubjectPayload({
      subjectId: "sub-1",
      maxMarks: 100,
      passMarks: 40,
    });
    assert.deepEqual(payload, {
      subjectId: "sub-1",
      totalMarks: 100,
      passingMarks: 40,
    });
    assert.equal("maxMarks" in payload, false);
    assert.equal("passMarks" in payload, false);
  });

  it("maps backend totalMarks/passingMarks into Max/Pass UI values", () => {
    assert.deepEqual(examSubjectMarks({ totalMarks: 80, passingMarks: 33 }), {
      maxMarks: 80,
      passMarks: 33,
    });
  });

  it("loads edit form values without spreading nested relations as writable fields", () => {
    const form = toExamFormValues({
      id: "exam-1",
      name: "Final",
      classId: "class-1",
      class: { id: "class-1", name: "Grade 5" },
      startDate: "2026-06-01T00:00:00.000Z",
      endDate: null,
      examSubjects: [],
    });
    assert.equal(form.name, "Final");
    assert.equal(form.classId, "class-1");
    assert.equal(form.startDate, "2026-06-01");
    assert.equal(form.endDate, "");
    assert.equal(form.examSubjects, undefined);
  });
});
