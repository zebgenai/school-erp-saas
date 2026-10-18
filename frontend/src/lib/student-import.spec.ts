import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clientFileProblem,
  formatFileSize,
  importActionState,
  MAX_STUDENT_IMPORT_BYTES,
} from "./student-import-rules.ts";

describe("student import client checks", () => {
  it("accepts xlsx and csv and rejects other formats and oversized files", () => {
    assert.equal(clientFileProblem({ name: "students.xlsx", size: 120 }), null);
    assert.equal(clientFileProblem({ name: "students.CSV", size: 120 }), null);
    assert.match(clientFileProblem({ name: "students.xls", size: 120 }) ?? "", /not supported/i);
    assert.match(clientFileProblem({ name: "students.pdf", size: 120 }) ?? "", /xlsx/i);
    assert.match(clientFileProblem({ name: "students.csv", size: 0 }) ?? "", /empty/i);
    assert.match(
      clientFileProblem({ name: "students.xlsx", size: MAX_STUDENT_IMPORT_BYTES + 1 }) ?? "",
      /5 MB/,
    );
  });

  it("formats file size and only enables import after a clean validation", () => {
    assert.equal(formatFileSize(512), "512 B");
    assert.equal(formatFileSize(2048), "2.0 KB");
    assert.equal(
      importActionState({ readyToImport: true, dirty: false, busy: false }).canImport,
      true,
    );
    assert.equal(
      importActionState({ readyToImport: true, dirty: true, busy: false }).canImport,
      false,
    );
    assert.equal(
      importActionState({ readyToImport: false, dirty: false, busy: false }).canImport,
      false,
    );
    assert.equal(
      importActionState({ readyToImport: false, dirty: true, busy: true }).canValidate,
      false,
    );
  });
});
