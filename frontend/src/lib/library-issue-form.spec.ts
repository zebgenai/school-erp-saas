import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildIssueBookPayload,
  resolveIssuedToName,
  todayIsoDate,
} from "./library-issue-form.ts";

const students = [
  { id: "stu-1", fullName: "Ayesha Khan" },
  { id: "stu-2", fullName: "  " },
];

describe("library issue book form", () => {
  it("resolves issuedToName from the selected student fullName", () => {
    assert.equal(resolveIssuedToName("stu-1", students), "Ayesha Khan");
    assert.equal(resolveIssuedToName("missing", students), undefined);
  });

  it("builds IssueBookDto with issuedToName and studentId, without issueDate", () => {
    const payload = buildIssueBookPayload(
      {
        bookId: "book-1",
        studentId: "stu-1",
        issueDate: "2026-01-01",
        dueDate: "2026-01-15",
      },
      students,
    );

    assert.equal(payload.bookId, "book-1");
    assert.equal(payload.studentId, "stu-1");
    assert.equal(payload.issuedToName, "Ayesha Khan");
    assert.equal(payload.dueDate, "2026-01-15");
    assert.equal("issueDate" in payload, false);
  });

  it("rejects students without a usable fullName", () => {
    assert.throws(
      () =>
        buildIssueBookPayload(
          {
            bookId: "book-1",
            studentId: "stu-2",
            issueDate: todayIsoDate(),
            dueDate: "2026-01-15",
          },
          students,
        ),
      /no name/i,
    );
  });
});
