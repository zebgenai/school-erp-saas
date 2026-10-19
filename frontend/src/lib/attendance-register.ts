export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LEAVE", "LATE"] as const;
export type AttendanceMark = (typeof ATTENDANCE_STATUSES)[number];

export type RegisterStudent = {
  id: string;
  fullName?: string;
  admissionNo?: string;
  status?: string | null;
  attendanceId?: string | null;
};

const STATUS_SET = new Set<string>(ATTENDANCE_STATUSES);

export function isAttendanceMark(value: unknown): value is AttendanceMark {
  return typeof value === "string" && STATUS_SET.has(value);
}

/** Saved rows only. Unmarked students stay absent from the map so they are not Present. */
export function marksFromStudents(students: RegisterStudent[]): Record<string, AttendanceMark> {
  const marks: Record<string, AttendanceMark> = {};
  for (const student of students) {
    if (isAttendanceMark(student.status)) marks[student.id] = student.status;
  }
  return marks;
}

export function attendanceCounts(studentIds: string[], marks: Record<string, AttendanceMark>) {
  const counts = { PRESENT: 0, ABSENT: 0, LEAVE: 0, LATE: 0, unmarked: 0 };
  for (const id of studentIds) {
    const status = marks[id];
    if (!status) counts.unmarked += 1;
    else counts[status] += 1;
  }
  return counts;
}

export function registerMatches(
  register: { classId?: string; sectionId?: string | null; date?: string } | null | undefined,
  classId: string,
  sectionId: string,
  date: string,
): boolean {
  if (!register) return false;
  return (
    register.classId === classId &&
    (register.sectionId ?? "") === sectionId &&
    register.date === date
  );
}

/** Drop marks that belong to a different class, section, or date. */
export function marksForSelection(
  loadedKey: string,
  currentKey: string,
  loadedMarks: Record<string, AttendanceMark>,
): Record<string, AttendanceMark> {
  if (!currentKey || loadedKey !== currentKey) return {};
  return loadedMarks;
}

export function selectionKey(classId: string, sectionId: string, date: string): string {
  return `${classId}|${sectionId}|${date}`;
}

export function schoolTodayDate(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const date = (payload as { date?: unknown }).date;
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export function attendanceSchoolParams(
  user: {
    role?: string;
    schoolId?: string;
    school?: { id?: string } | null;
  } | null,
): { schoolId?: string } {
  const role = (user?.role || "").toUpperCase();
  const schoolId = user?.schoolId || user?.school?.id;
  if (role === "SUPER_ADMIN" && schoolId) return { schoolId };
  return {};
}

/**
 * Receptionists may scan teacher cards. Student QR stays limited to
 * school admin, teacher, and attendance scanner.
 */
export function scannerModeForRole(role: string | undefined): "auto" | "teacher" {
  return (role || "").toUpperCase() === "RECEPTIONIST" ? "teacher" : "auto";
}

export function saveBlockReason(input: {
  classId: string;
  date: string;
  studentCount: number;
  unmarked: number;
  studentsLoading: boolean;
  attendanceLoading: boolean;
  attendanceError: string | null;
  classesError: string | null;
  sectionsLoading?: boolean;
  sectionsError: string | null;
  dateError: string | null;
}): string | null {
  if (input.classesError) return input.classesError;
  if (!input.classId) return "Select a class";
  if (input.sectionsLoading) return "Sections are still loading";
  if (input.sectionsError) return input.sectionsError;
  if (input.dateError && !input.date) return input.dateError;
  if (!input.date) return "Choose a date";
  if (input.studentsLoading || input.attendanceLoading) return "Attendance is still loading";
  if (input.attendanceError) return input.attendanceError;
  if (input.studentCount === 0) return "No students to mark";
  if (input.unmarked > 0) {
    return input.unmarked === 1
      ? "1 student is not marked"
      : `${input.unmarked} students are not marked`;
  }
  return null;
}

/** Explicit statuses only. Never fills a missing mark with Present. */
export function bulkRecords(
  students: Array<{ id: string }>,
  marks: Record<string, AttendanceMark>,
): Array<{ studentId: string; status: AttendanceMark }> {
  return students.map((student) => {
    const status = marks[student.id];
    if (!isAttendanceMark(status)) {
      throw new Error("Cannot save unmarked students");
    }
    return { studentId: student.id, status };
  });
}
