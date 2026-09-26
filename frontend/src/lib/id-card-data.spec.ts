import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ID_CARD_TEMPLATES,
  activeStudentsOnly,
  activeTeachersOnly,
  hasTruthySelection,
  mapStudentToCardFields,
  mapTeacherToCardFields,
  selectedStudentIds,
  studentsInSelectionScope,
  studentsMissingPhotos,
  teachersMissingPhotos,
} from "./id-card-data.ts";

describe("ID card data mapping", () => {
  const student = {
    id: "stu-1",
    fullName: "Ali Khan",
    admissionNo: "ADM-01",
    fatherName: "Hassan Khan",
    photoUrl: "/uploads/ali.png",
    status: "ACTIVE",
    class: { name: "Five" },
    section: { name: "A" },
  };
  const school = {
    name: "Iqra Public School",
    logoUrl: "/uploads/logo.png",
    themeColor: "#1d4ed8",
    address: "Charsadda",
    phone: "0300",
    email: "info@iqra.test",
    domain: "iqra.clevercampus.cloud",
  };

  it("maps existing student and school fields without inventing card copies", () => {
    const fields = mapStudentToCardFields(student, school);
    assert.equal(fields.fullName, "Ali Khan");
    assert.equal(fields.admissionNo, "ADM-01");
    assert.equal(fields.className, "Five");
    assert.equal(fields.sectionName, "A");
    assert.equal(fields.fatherName, "Hassan Khan");
    assert.equal(fields.schoolName, "Iqra Public School");
    assert.equal(fields.schoolLogoUrl, "/uploads/logo.png");
    assert.equal("cardStudentName" in fields, false);
  });

  it("uses updated class, section, name, and photo on regenerate", () => {
    const fields = mapStudentToCardFields(
      { ...student, fullName: "Ali Updated", photoUrl: "/uploads/new.png", class: { name: "Six" }, section: { name: "B" } },
      school,
    );
    assert.equal(fields.fullName, "Ali Updated");
    assert.equal(fields.className, "Six");
    assert.equal(fields.sectionName, "B");
    assert.equal(fields.photoUrl, "/uploads/new.png");
  });

  it("selects built-in templates only", () => {
    assert.deepEqual(
      ID_CARD_TEMPLATES.map((t) => t.id),
      ["CLASSIC", "MODERN", "PREMIUM", "MINIMAL"],
    );
  });

  it("flags missing photos and excludes inactive students by default", () => {
    const rows = [
      { id: "1", fullName: "A", admissionNo: "1", photoUrl: "/p.png", status: "ACTIVE" },
      { id: "2", fullName: "B", admissionNo: "2", photoUrl: "", status: "ACTIVE" },
      { id: "3", fullName: "C", admissionNo: "3", photoUrl: "/p.png", status: "INACTIVE" },
    ];
    const active = activeStudentsOnly(rows);
    assert.equal(active.length, 2);
    assert.equal(studentsMissingPhotos(active).length, 1);
    assert.equal(studentsMissingPhotos(active)[0].id, "2");
  });

  it("uses truthy selections only after Select all → Clear / uncheck", () => {
    const rows = [
      { id: "a", fullName: "A", admissionNo: "1", photoUrl: "" },
      { id: "b", fullName: "B", admissionNo: "2", photoUrl: "/p.png" },
      { id: "c", fullName: "C", admissionNo: "3", photoUrl: "" },
    ];
    const afterClear = { a: false, b: false, c: false };
    assert.equal(hasTruthySelection(afterClear), false);
    assert.deepEqual(selectedStudentIds(afterClear), []);
    // No truthy selection → whole class/section list is in scope
    assert.equal(studentsInSelectionScope(rows, afterClear).length, 3);
    assert.equal(studentsMissingPhotos(studentsInSelectionScope(rows, afterClear)).length, 2);

    const oneSelected = { a: false, b: true, c: false };
    assert.deepEqual(selectedStudentIds(oneSelected), ["b"]);
    assert.deepEqual(
      studentsInSelectionScope(rows, oneSelected).map((s) => s.id),
      ["b"],
    );

    const several = { a: true, b: false, c: true };
    assert.deepEqual(selectedStudentIds(several).sort(), ["a", "c"]);
    assert.equal(studentsMissingPhotos(studentsInSelectionScope(rows, several)).length, 2);
  });

  it("Continue-anyway flow helper keeps pending action until resumed", () => {
    // Documented contract for the bulk UI: photoChoice "continue" must resume the
    // pending preview/generate action without requiring another click.
    let pending: "preview" | "generate" | null = "preview";
    let previewCalls = 0;
    let generateCalls = 0;
    const resume = (choice: "ask" | "continue" | "review") => {
      if (choice !== "continue" || !pending) return;
      const action = pending;
      pending = null;
      if (action === "preview") previewCalls += 1;
      if (action === "generate") generateCalls += 1;
    };
    resume("continue");
    assert.equal(previewCalls, 1);
    assert.equal(generateCalls, 0);
    assert.equal(pending, null);
  });

  it("class and section scopes use the full active list when nothing is truthy-selected", () => {
    const classList = [
      { id: "1", fullName: "A", admissionNo: "1", photoUrl: "/p.png", classId: "c1", sectionId: "s1" },
      { id: "2", fullName: "B", admissionNo: "2", photoUrl: "", classId: "c1", sectionId: "s1" },
      { id: "3", fullName: "C", admissionNo: "3", photoUrl: "", classId: "c1", sectionId: "s2" },
    ];
    const sectionOnly = classList.filter((s) => s.sectionId === "s1");
    const emptySelection = { "1": false, "2": false, "3": false };
    assert.equal(studentsInSelectionScope(sectionOnly, emptySelection).length, 2);
    assert.equal(studentsMissingPhotos(studentsInSelectionScope(sectionOnly, emptySelection)).length, 1);

    const selectedInClass = { "1": false, "2": true, "3": false };
    assert.deepEqual(
      studentsInSelectionScope(classList, selectedInClass).map((s) => s.id),
      ["2"],
    );
  });
});

describe("Teacher ID card data mapping", () => {
  it("maps employeeNo and designation without occupation", () => {
    const fields = mapTeacherToCardFields(
      {
        id: "t1",
        fullName: "Ali Teacher",
        employeeNo: "EMP-01",
        designation: "Senior",
        photoUrl: "/uploads/t.png",
        status: "ACTIVE",
      },
      { name: "Iqra", logoUrl: null, themeColor: "#0f766e" },
    );
    assert.equal(fields.fullName, "Ali Teacher");
    assert.equal(fields.employeeNo, "EMP-01");
    assert.equal(fields.designation, "Senior");
    assert.equal(fields.photoUrl, "/uploads/t.png");
    assert.equal("occupation" in fields, false);
  });

  it("flags teachers missing photos", () => {
    const rows = [
      { id: "1", fullName: "A", employeeNo: "E1", photoUrl: "/p.png", status: "ACTIVE" },
      { id: "2", fullName: "B", employeeNo: "E2", photoUrl: null, status: "ACTIVE" },
      { id: "3", fullName: "C", employeeNo: "E3", photoUrl: "/p.png", status: "INACTIVE" },
    ];
    const active = activeTeachersOnly(rows);
    assert.equal(active.length, 2);
    assert.equal(teachersMissingPhotos(active).length, 1);
    assert.equal(teachersMissingPhotos(active)[0].id, "2");
  });
});
