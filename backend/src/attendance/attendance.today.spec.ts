import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AttendanceStatus, UserRole } from '@prisma/client';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';

const schoolA = 'school-a';
const schoolB = 'school-b';
const classA = 'class-a';
const classB = 'class-b';
const today = new Date('2026-09-17T00:00:00.000Z');
const previousUtcDay = new Date('2026-09-16T00:00:00.000Z');
const justAfterUtcMidnight = new Date('2026-09-16T22:30:00.000Z');

const admin = {
  id: 'admin-1',
  email: 'admin@test',
  name: 'Admin',
  role: UserRole.SCHOOL_ADMIN,
  schoolId: schoolA,
};

const accountant = { ...admin, id: 'acct-1', role: UserRole.ACCOUNTANT };
const receptionist = { ...admin, id: 'rec-1', role: UserRole.RECEPTIONIST };

type Student = {
  id: string;
  schoolId: string;
  fullName: string;
  admissionNo: string;
  status: string;
  classId: string | null;
  sectionId: string | null;
};

type Row = {
  schoolId: string;
  studentId: string;
  date: Date;
  status: AttendanceStatus;
};

const students: Student[] = [
  { id: 'unmarked', schoolId: schoolA, fullName: 'Unmarked Ali', admissionNo: 'A-1', status: 'ACTIVE', classId: classA, sectionId: 'sec-1' },
  { id: 'present', schoolId: schoolA, fullName: 'Present Bea', admissionNo: 'A-2', status: 'ACTIVE', classId: classA, sectionId: 'sec-1' },
  { id: 'absent', schoolId: schoolA, fullName: 'Absent Cam', admissionNo: 'A-3', status: 'ACTIVE', classId: classA, sectionId: 'sec-1' },
  { id: 'leave', schoolId: schoolA, fullName: 'Leave Dee', admissionNo: 'A-4', status: 'ACTIVE', classId: classA, sectionId: 'sec-1' },
  { id: 'late', schoolId: schoolA, fullName: 'Late Eve', admissionNo: 'A-5', status: 'ACTIVE', classId: classA, sectionId: 'sec-1' },
  { id: 'inactive', schoolId: schoolA, fullName: 'Inactive Fay', admissionNo: 'A-6', status: 'INACTIVE', classId: classA, sectionId: 'sec-1' },
  { id: 'other-class', schoolId: schoolA, fullName: 'Other Gia', admissionNo: 'B-1', status: 'ACTIVE', classId: classB, sectionId: 'sec-b' },
  { id: 'other-school', schoolId: schoolB, fullName: 'Foreign Hal', admissionNo: 'Z-1', status: 'ACTIVE', classId: 'class-z', sectionId: 'sec-z' },
  { id: 'page-2', schoolId: schoolA, fullName: 'Page Two', admissionNo: 'A-7', status: 'ACTIVE', classId: classA, sectionId: 'sec-1' },
  { id: 'page-3', schoolId: schoolA, fullName: 'Page Three', admissionNo: 'A-8', status: 'ACTIVE', classId: classA, sectionId: 'sec-1' },
  { id: 'mismatched', schoolId: schoolB, fullName: 'Mismatch Ian', admissionNo: 'M-1', status: 'ACTIVE', classId: classA, sectionId: 'sec-1' },
];

const rows: Row[] = [
  { schoolId: schoolA, studentId: 'present', date: today, status: AttendanceStatus.PRESENT },
  { schoolId: schoolA, studentId: 'absent', date: today, status: AttendanceStatus.ABSENT },
  { schoolId: schoolA, studentId: 'leave', date: today, status: AttendanceStatus.LEAVE },
  { schoolId: schoolA, studentId: 'late', date: today, status: AttendanceStatus.LATE },
  { schoolId: schoolA, studentId: 'inactive', date: previousUtcDay, status: AttendanceStatus.ABSENT },
  { schoolId: schoolA, studentId: 'inactive', date: today, status: AttendanceStatus.ABSENT },
  { schoolId: schoolA, studentId: 'other-class', date: today, status: AttendanceStatus.PRESENT },
  { schoolId: schoolB, studentId: 'other-school', date: today, status: AttendanceStatus.PRESENT },
  { schoolId: schoolA, studentId: 'mismatched', date: today, status: AttendanceStatus.ABSENT },
];

function includesText(value: string, expected: { contains: string }) {
  return value.toLowerCase().includes(expected.contains.toLowerCase());
}

function studentMatches(student: Student, where: Record<string, any>): boolean {
  if (where.schoolId && student.schoolId !== where.schoolId) return false;
  if (where.status && student.status !== where.status) return false;
  if (where.classId && student.classId !== where.classId) return false;
  if (where.sectionId && student.sectionId !== where.sectionId) return false;
  if (where.OR) {
    const matched = where.OR.some((clause: Record<string, any>) => {
      if (clause.fullName) return includesText(student.fullName, clause.fullName);
      if (clause.admissionNo) return includesText(student.admissionNo, clause.admissionNo);
      return false;
    });
    if (!matched) return false;
  }
  if (where.attendances?.none) {
    const none = where.attendances.none;
    const marked = rows.some(
      (row) =>
        row.studentId === student.id &&
        row.schoolId === none.schoolId &&
        row.date.getTime() === none.date.getTime(),
    );
    if (marked) return false;
  }
  return true;
}

function attendanceMatches(row: Row, where: Record<string, any>): boolean {
  if (where.schoolId && row.schoolId !== where.schoolId) return false;
  if (where.status && row.status !== where.status) return false;
  if (where.date && row.date.getTime() !== where.date.getTime()) return false;
  if (where.student) {
    const student = students.find((item) => item.id === row.studentId);
    if (!student || !studentMatches(student, where.student)) return false;
  }
  return true;
}

function decorate(student: Student) {
  return {
    id: student.id,
    fullName: student.fullName,
    admissionNo: student.admissionNo,
    class: student.classId ? { id: student.classId, name: student.classId } : null,
    section: student.sectionId ? { id: student.sectionId, name: student.sectionId } : null,
  };
}

function service() {
  const prisma = {
    school: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id === schoolA) return { id: schoolA, timezone: 'Asia/Karachi' };
        if (where.id === schoolB) return { id: schoolB, timezone: 'Asia/Karachi' };
        return null;
      },
    },
    class: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === classA || where.id === classB ? { id: where.id, schoolId: schoolA } : null,
    },
    section: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id === 'sec-1') return { id: 'sec-1', schoolId: schoolA, classId: classA };
        if (where.id === 'sec-b') return { id: 'sec-b', schoolId: schoolA, classId: classB };
        return null;
      },
    },
    student: {
      count: async ({ where }: { where: Record<string, any> }) =>
        students.filter((student) => studentMatches(student, where)).length,
      findMany: async ({ where, take, skip }: { where: Record<string, any>; take: number; skip: number }) =>
        students
          .filter((student) => studentMatches(student, where))
          .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.admissionNo.localeCompare(b.admissionNo))
          .slice(skip, skip + take)
          .map(decorate),
    },
    studentAttendance: {
      groupBy: async ({ where }: { where: Record<string, any> }) => {
        const counts = new Map<AttendanceStatus, number>();
        for (const row of rows.filter((item) => attendanceMatches(item, where))) {
          counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
        }
        return [...counts.entries()].map(([status, id]) => ({ status, _count: { id } }));
      },
      count: async ({ where }: { where: Record<string, any> }) =>
        rows.filter((row) => attendanceMatches(row, where)).length,
      findMany: async ({ where, take, skip }: { where: Record<string, any>; take: number; skip: number }) =>
        rows
          .filter((row) => attendanceMatches(row, where))
          .map((row) => ({ row, student: students.find((student) => student.id === row.studentId)! }))
          .sort(
            (a, b) =>
              a.student.fullName.localeCompare(b.student.fullName) ||
              a.student.admissionNo.localeCompare(b.student.admissionNo),
          )
          .slice(skip, skip + take)
          .map((item) => ({ student: decorate(item.student) })),
    },
  };
  return new AttendanceService(prisma as never, { dispatch: () => undefined } as never);
}

describe("school admin today's attendance", () => {
  it('uses the school-local date just after UTC midnight', async () => {
    const overview = await service().getTodayOverview(admin, {}, justAfterUtcMidnight);
    assert.equal(overview.date, '2026-09-17');
    assert.equal(overview.timeZone, 'Asia/Karachi');
    assert.notEqual(overview.date, '2026-09-16');
  });

  it('counts only active students and keeps Late out of Not Marked', async () => {
    const overview = await service().getTodayOverview(admin, {}, justAfterUtcMidnight);
    assert.equal(overview.totalActive, 8);
    assert.equal(overview.present, 2);
    assert.equal(overview.absent, 1);
    assert.equal(overview.leave, 1);
    assert.equal(overview.late, 1);
    assert.equal(overview.notMarked, 3);
    assert.equal(
      overview.present + overview.absent + overview.leave + overview.late + overview.notMarked,
      overview.totalActive,
    );
  });

  it('rejects another school and non-admin roles', async () => {
    await assert.rejects(
      () => service().getTodayOverview(admin, { schoolId: schoolB }, justAfterUtcMidnight),
      (error: unknown) => error instanceof ForbiddenException,
    );
    const otherAdmin = { ...admin, id: 'admin-b', schoolId: schoolB };
    await assert.rejects(
      () => service().getTodayOverview(otherAdmin, { schoolId: schoolA }, justAfterUtcMidnight),
      (error: unknown) => error instanceof ForbiddenException,
    );
    const otherSchool = await service().getTodayOverview(otherAdmin, {}, justAfterUtcMidnight);
    assert.equal(otherSchool.totalActive, 2);
    assert.equal(otherSchool.present, 1);
    assert.equal(otherSchool.absent, 0);
    assert.equal(otherSchool.notMarked, 1);
    const otherRoster = await service().getTodayRoster(otherAdmin, { category: 'PRESENT' }, justAfterUtcMidnight);
    assert.deepEqual(otherRoster.data.map((student) => student.id), ['other-school']);
    await assert.rejects(
      () => service().getTodayOverview(accountant, {}, justAfterUtcMidnight),
      (error: unknown) => error instanceof ForbiddenException,
    );
    await assert.rejects(
      () => service().getTodayRoster(receptionist, { category: 'ABSENT' }, justAfterUtcMidnight),
      (error: unknown) => error instanceof ForbiddenException,
    );
  });

  it('requires a section to belong to the selected class and school', async () => {
    await assert.rejects(
      () =>
        service().getTodayRoster(
          admin,
          { category: 'PRESENT', classId: classA, sectionId: 'sec-b' },
          justAfterUtcMidnight,
        ),
      (error: unknown) => error instanceof BadRequestException && /Section does not belong/.test(error.message),
    );
    await assert.rejects(
      () => service().getTodayRoster(admin, { category: 'PRESENT', classId: 'missing' }, justAfterUtcMidnight),
      (error: unknown) => error instanceof Error && /Class not found/.test(error.message),
    );
  });

  it('pages Not Marked students and excludes every marked status', async () => {
    const first = await service().getTodayRoster(
      admin,
      { category: 'NOT_MARKED', limit: 2, skip: 0 },
      justAfterUtcMidnight,
    );
    assert.equal(first.total, 3);
    assert.equal(first.limit, 2);
    assert.equal(first.skip, 0);
    assert.deepEqual(first.data.map((student) => student.id), ['page-3', 'page-2']);

    const second = await service().getTodayRoster(
      admin,
      { category: 'NOT_MARKED', limit: 2, skip: 2 },
      justAfterUtcMidnight,
    );
    assert.equal(second.data.length, 1);
    assert.equal(second.data[0]?.id, 'unmarked');
    assert.equal(second.total, 3);
    for (const student of [...first.data, ...second.data]) {
      assert.equal(student.id === 'inactive', false);
      assert.equal(['present', 'absent', 'leave', 'late', 'other-class', 'other-school'].includes(student.id), false);
    }
  });

  it('returns an empty roster when the category has no students in the class', async () => {
    const empty = await service().getTodayRoster(
      admin,
      { category: 'ABSENT', classId: classB },
      justAfterUtcMidnight,
    );
    assert.equal(empty.total, 0);
    assert.deepEqual(empty.data, []);
    assert.equal(empty.date, '2026-09-17');
  });

  it('filters a marked category by class and search without other schools', async () => {
    const present = await service().getTodayRoster(
      admin,
      { category: 'PRESENT', classId: classA, sectionId: 'sec-1', search: 'bea' },
      justAfterUtcMidnight,
    );
    assert.equal(present.total, 1);
    assert.equal(present.data[0]?.id, 'present');
    assert.equal(present.data[0]?.admissionNo, 'A-2');
    assert.equal(present.data[0]?.class?.id, classA);
    assert.equal(present.data[0]?.section?.id, 'sec-1');
  });

  it('ignores an attendance row whose student belongs to another school', async () => {
    const overview = await service().getTodayOverview(admin, {}, justAfterUtcMidnight);
    assert.equal(overview.absent, 1);
    const absent = await service().getTodayRoster(admin, { category: 'ABSENT' }, justAfterUtcMidnight);
    assert.deepEqual(absent.data.map((student) => student.id), ['absent']);
    const notMarked = await service().getTodayRoster(admin, { category: 'NOT_MARKED' }, justAfterUtcMidnight);
    assert.equal(notMarked.data.some((student) => student.id === 'mismatched'), false);
  });

  it('keeps overview and roster on one school-local date for the same instant', async () => {
    const categories = ['PRESENT', 'ABSENT', 'LEAVE', 'LATE', 'NOT_MARKED'] as const;
    const overview = await service().getTodayOverview(admin, {}, justAfterUtcMidnight);
    let summed = 0;
    for (const category of categories) {
      const roster = await service().getTodayRoster(admin, { category }, justAfterUtcMidnight);
      assert.equal(roster.date, overview.date);
      const expected = category === 'NOT_MARKED' ? overview.notMarked : overview[category.toLowerCase() as 'present'];
      assert.equal(roster.total, expected, category);
      summed += roster.total;
    }
    assert.equal(summed, overview.totalActive);
  });

  it('does not reuse an earlier overview date after the school-local day changes', async () => {
    const beforeMidnight = new Date('2026-09-16T18:30:00.000Z');
    const afterMidnight = new Date('2026-09-16T19:30:00.000Z');
    const overview = await service().getTodayOverview(admin, {}, beforeMidnight);
    const sameInstant = await service().getTodayRoster(admin, { category: 'NOT_MARKED' }, beforeMidnight);
    assert.equal(overview.date, '2026-09-16');
    assert.equal(sameInstant.date, overview.date);
    const nextDay = await service().getTodayRoster(admin, { category: 'NOT_MARKED' }, afterMidnight);
    assert.equal(nextDay.date, '2026-09-17');
    assert.notEqual(nextDay.date, overview.date);
  });
});
