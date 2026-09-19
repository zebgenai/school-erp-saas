export type LibraryStudent = {
  id: string;
  fullName?: string;
};

export type IssueBookFormState = {
  bookId: string;
  studentId: string;
  issueDate: string;
  dueDate: string;
  remarks?: string;
};

export function todayIsoDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function resolveIssuedToName(
  studentId: string,
  students: LibraryStudent[],
): string | undefined {
  const student = students.find((s) => s.id === studentId);
  const name = String(student?.fullName ?? "").trim();
  return name || undefined;
}

/**
 * Build IssueBookDto from the issue form.
 * Does not send issueDate — backend sets it. Requires issuedToName from the selected student.
 */
export function buildIssueBookPayload(
  form: IssueBookFormState,
  students: LibraryStudent[],
): Record<string, unknown> {
  const bookId = String(form.bookId ?? "").trim();
  const studentId = String(form.studentId ?? "").trim();
  const dueDate = String(form.dueDate ?? "").trim();
  const issuedToName = resolveIssuedToName(studentId, students);

  if (!bookId) throw new Error("Select a book");
  if (!studentId) throw new Error("Select a student");
  if (!issuedToName) throw new Error("Selected student has no name");
  if (!dueDate) throw new Error("Due date is required");

  const payload: Record<string, unknown> = {
    bookId,
    issuedToName,
    dueDate,
    studentId,
  };

  const remarks = String(form.remarks ?? "").trim();
  if (remarks) payload.remarks = remarks;

  return payload;
}
