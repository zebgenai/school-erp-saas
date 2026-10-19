import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AttendanceStatus, UserRole } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceService, ATTENDANCE_REGISTER_LIMIT } from './attendance.service';

const schoolA = 'school-a';
const classA = 'class-a';
const classB = 'class-b';

const admin = {
  id: 'admin-1',
  email: 'admin@test',
  name: 'Admin',
  role: UserRole.SCHOOL_ADMIN,
  schoolId: schoolA,
};

const teacherUser = {
  id: 'user-teacher',
  email: 'teacher@test',
  name: 'Teacher',
  role: UserRole.TEACHER,
  schoolId: schoolA,
};

const superAdmin = {
  id: 'super-1',
  email: 'super@test',
  name: 'Super',
  role: UserRole.SUPER_ADMIN,
  schoolId: null,
};

const accountant = {
  id: 'acct-1',
  email: 'acct@test',
  name: 'Accountant',
  role: UserRole.ACCOUNTANT,
  schoolId: schoolA,
};

type StudentRow = {
  id: string;
  schoolId: string;
  fullName: string;
  admissionNo: string;
  status: string;
  classId: string | null;
  sectionId: string | null;
};

type AttendanceRow = {
  id: string;
  schoolId: string;
  studentId: string;
  classId: string | null;
  sectionId: string | null;
  date: Date;
  status: AttendanceStatus;
  remarks?: string;
  markedById?: string;
};

function student(index: number, overrides: Partial<StudentRow> = {}): StudentRow {
  return {
    id: `s-${index}`,
    schoolId: schoolA,
    fullName: `Student ${String(index).padStart(4, '0')}`,
    admissionNo: `A-${index}`,
    status: 'ACTIVE',
    classId: classA,
    sectionId: 'sec-1',
    ...overrides,
  };
}

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [key, expected] of Object.entries(where)) {
    if (expected && typeof expected === 'object' && 'in' in (expected as object)) {
      const values = (expected as { in: unknown[] }).in;
      if (!values.includes(row[key])) return false;
      continue;
    }
    if (row[key] !== expected) return false;
  }
  return true;
}

function attendanceKey(schoolId: string, studentId: string, date: Date) {
  return `${schoolId}:${studentId}:${date.toISOString()}`;
}

function matchesAttendance(row: AttendanceRow, where: Record<string, unknown>): boolean {
  for (const [key, expected] of Object.entries(where)) {
    const actual = row[key as keyof AttendanceRow];
    if (expected instanceof Date) {
      if (!(actual instanceof Date) || actual.getTime() !== expected.getTime()) return false;
      continue;
    }
    if (expected && typeof expected === 'object' && 'in' in expected) {
      if (!(expected as { in: unknown[] }).in.includes(actual)) return false;
      continue;
    }
    if (expected && typeof expected === 'object' && ('gte' in expected || 'lte' in expected)) {
      const value = actual instanceof Date ? actual : null;
      const range = expected as { gte?: Date; lte?: Date };
      if (!value) return false;
      if (range.gte && value < range.gte) return false;
      if (range.lte && value > range.lte) return false;
      continue;
    }
    if (actual !== expected) return false;
  }
  return true;
}

function harness(options?: {
  students?: StudentRow[];
  attendance?: AttendanceRow[];
  assignedClassIds?: string[];
  failStudentId?: string;
  uniqueOnce?: boolean;
  uniqueAlways?: boolean;
  winnerAlreadyAbsent?: boolean;
  timeout?: boolean;
  schools?: Record<string, { timezone: string | null }>;
}) {
  const students = options?.students ?? [student(1)];
  const committed = new Map<string, AttendanceRow>();
  for (const row of options?.attendance ?? []) {
    committed.set(attendanceKey(row.schoolId, row.studentId, row.date), row);
  }
  const assigned = new Set(options?.assignedClassIds ?? [classA]);
  const calls = {
    transaction: 0,
    studentFindMany: 0,
    studentCount: 0,
    attendanceFindMany: 0,
    updateMany: 0,
    createMany: 0,
    dispatch: [] as string[],
    lockSql: [] as string[],
  };
  let uniqueThrown = false;

  const readStudents = (where: Record<string, unknown>) =>
    students.filter((row) => matchesWhere(row as unknown as Record<string, unknown>, where));

  const prisma = {
    class: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === classA || where.id === classB
          ? { id: where.id, schoolId: schoolA, name: where.id }
          : null,
    },
    section: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id === 'sec-1') return { id: 'sec-1', schoolId: schoolA, classId: classA, name: 'A' };
        if (where.id === 'sec-b') return { id: 'sec-b', schoolId: schoolA, classId: classB, name: 'B' };
        return null;
      },
    },
    school: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (options?.schools) {
          if (!(where.id in options.schools)) return null;
          return { id: where.id, timezone: options.schools[where.id].timezone };
        }
        return where.id === schoolA ? { id: schoolA, timezone: 'Asia/Karachi' } : null;
      },
    },
    teacher: {
      findFirst: async () => ({ id: 'teacher-profile' }),
    },
    timetableEntry: {
      findFirst: async ({ where }: { where: { classId: string } }) =>
        assigned.has(where.classId) ? { id: 'tt-1', classId: where.classId } : null,
      findMany: async () => [...assigned].map((classId) => ({ classId })),
    },
    student: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        students.find((row) => row.id === where.id) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        calls.studentFindMany += 1;
        return readStudents(where);
      },
      count: async ({ where }: { where: Record<string, unknown> }) => {
        calls.studentCount += 1;
        return readStudents(where).length;
      },
    },
    studentAttendance: {
      findUnique: async ({
        where,
      }: {
        where: { id?: string; schoolId_studentId_date?: { schoolId: string; studentId: string; date: Date } };
      }) => {
        if (where.id) return [...committed.values()].find((row) => row.id === where.id) ?? null;
        if (where.schoolId_studentId_date) {
          const key = attendanceKey(
            where.schoolId_studentId_date.schoolId,
            where.schoolId_studentId_date.studentId,
            where.schoolId_studentId_date.date,
          );
          return committed.get(key) ?? null;
        }
        return null;
      },
      findMany: async ({
        where,
        take,
        skip,
      }: {
        where: Record<string, unknown>;
        take?: number;
        skip?: number;
      }) => {
        calls.attendanceFindMany += 1;
        const rows = [...committed.values()].filter((row) => matchesAttendance(row, where));
        const start = skip ?? 0;
        return take === undefined ? rows.slice(start) : rows.slice(start, start + take);
      },
      count: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        where
          ? [...committed.values()].filter((row) => matchesAttendance(row, where)).length
          : committed.size,
      groupBy: async ({ where }: { where: Record<string, unknown> }) => {
        const counts = new Map<AttendanceStatus, number>();
        for (const row of [...committed.values()].filter((item) => matchesAttendance(item, where))) {
          counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
        }
        return [...counts.entries()].map(([status, id]) => ({ status, _count: { id } }));
      },
    },
    $transaction: (() => {
      let chain: Promise<void> = Promise.resolve();
      return (fn: (tx: unknown) => Promise<unknown>) => {
        if (options?.timeout) {
          calls.transaction += 1;
          return Promise.reject(
            new Error(
              'Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5001 ms passed since the start of the transaction.',
            ),
          );
        }
        const previous = chain;
        let release: () => void = () => undefined;
        chain = new Promise<void>((resolve) => {
          release = resolve;
        });
        return previous.then(async () => {
          calls.transaction += 1;
          const draft = new Map([...committed.entries()].map(([key, row]) => [key, { ...row }]));
          const createRow = (data: AttendanceRow) => {
            const key = attendanceKey(data.schoolId, data.studentId, data.date);
            if (options?.failStudentId && data.studentId === options.failStudentId) {
              throw new Error('disk full');
            }
            const collide =
              options?.uniqueAlways || (options?.uniqueOnce && !uniqueThrown && !draft.has(key));
            if (collide) {
              uniqueThrown = true;
              if (options?.winnerAlreadyAbsent) {
                committed.set(key, {
                  id: `winner-${data.studentId}`,
                  schoolId: data.schoolId,
                  studentId: data.studentId,
                  classId: data.classId ?? null,
                  sectionId: data.sectionId ?? null,
                  date: data.date,
                  status: AttendanceStatus.ABSENT,
                });
              }
              const error = new Error('Unique constraint failed');
              (error as { code?: string }).code = 'P2002';
              throw error;
            }
            if (draft.has(key)) {
              const error = new Error('Unique constraint failed');
              (error as { code?: string }).code = 'P2002';
              throw error;
            }
            const next: AttendanceRow = {
              ...data,
              id: data.id || `att-${data.studentId}-${data.date.toISOString()}`,
            };
            draft.set(key, next);
            return next;
          };
          const updateRow = (id: string, data: Partial<AttendanceRow>) => {
            const row = [...draft.values()].find((item) => item.id === id);
            if (!row) throw new Error(`attendance ${id} was not locked`);
            Object.assign(row, data);
            return row;
          };
          const tx = {
            $queryRaw: async (query: { strings?: readonly string[]; values?: unknown[] }) => {
              const sql = (query.strings ?? []).join(' ');
              calls.lockSql.push(sql);
              if (sql.includes('WHERE id =')) {
                const id = query.values?.[0];
                return [...draft.values()].filter((row) => row.id === id);
              }
              const schoolId = query.values?.[0];
              const date = query.values?.[1];
              return [...draft.values()].filter(
                (row) =>
                  row.schoolId === schoolId &&
                  date instanceof Date &&
                  row.date.getTime() === date.getTime(),
              );
            },
            studentAttendance: {
              create: async ({ data }: { data: AttendanceRow }) => createRow(data),
              update: async ({ where, data }: { where: { id: string }; data: Partial<AttendanceRow> }) =>
                updateRow(where.id, data),
              updateMany: async ({
                where,
                data,
              }: {
                where: { id: { in: string[] } };
                data: Partial<AttendanceRow>;
              }) => {
                calls.updateMany += 1;
                for (const id of where.id.in) updateRow(id, data);
                return { count: where.id.in.length };
              },
              createManyAndReturn: async ({ data }: { data: AttendanceRow[] }) => {
                calls.createMany += 1;
                return data.map((row) => createRow(row));
              },
            },
          };
          try {
            const result = await fn(tx);
            committed.clear();
            for (const [key, value] of draft) committed.set(key, value);
            return result;
          } finally {
            release();
          }
        });
      };
    })(),
  };

  const engine = {
    dispatch(fn: () => Promise<void>) {
      calls.dispatch.push(`${calls.transaction}|${fn.toString()}`);
    },
    emitAttendanceAbsent() {
      return Promise.resolve();
    },
    emitAttendanceSubmitted() {
      return Promise.resolve();
    },
  };

  return {
    service: new AttendanceService(prisma as never, engine as never),
    committed,
    calls,
  };
}

function bulk(records: Array<{ studentId: string; status: AttendanceStatus }>, classId = classA) {
  return {
    classId,
    date: '2026-09-17',
    records,
  };
}

describe('attendance register loading', () => {
  it('returns an ABSENT record beyond the first 50 students', async () => {
    const rows = Array.from({ length: 60 }, (_, index) => student(index + 1));
    const date = new Date('2026-09-17T00:00:00.000Z');
    const { service } = harness({
      students: rows,
      attendance: [
        {
          id: 'att-51',
          schoolId: schoolA,
          studentId: 's-51',
          classId: classA,
          sectionId: 'sec-1',
          date,
          status: AttendanceStatus.ABSENT,
        },
      ],
    });
    const register = await service.getRegister(admin, { classId: classA, date: '2026-09-17' });
    assert.equal(register.students.length, 60);
    assert.equal(register.students.find((row) => row.id === 's-51')?.status, AttendanceStatus.ABSENT);
    assert.equal(register.students.find((row) => row.id === 's-1')?.status, null);
    assert.equal(register.summary.absent, 1);
    assert.equal(register.summary.notMarked, 59);
    assert.equal(register.summary.present, 0);
  });

  it('returns every active student in a class larger than 200', async () => {
    const rows = Array.from({ length: 201 }, (_, index) => student(index + 1));
    const date = new Date('2026-09-17T00:00:00.000Z');
    const { service } = harness({
      students: rows,
      attendance: [
        {
          id: 'att-201',
          schoolId: schoolA,
          studentId: 's-201',
          classId: classA,
          sectionId: 'sec-1',
          date,
          status: AttendanceStatus.LEAVE,
        },
      ],
    });
    const register = await service.getRegister(admin, { classId: classA, date: '2026-09-17' });
    assert.equal(register.students.length, 201);
    assert.equal(register.students.find((row) => row.id === 's-201')?.status, AttendanceStatus.LEAVE);
  });

  it('rejects a class above the explicit register limit instead of returning a partial list', async () => {
    const rows = Array.from({ length: ATTENDANCE_REGISTER_LIMIT + 1 }, (_, index) => student(index + 1));
    const { service, calls } = harness({ students: rows });
    await assert.rejects(
      () => service.getRegister(admin, { classId: classA, date: '2026-09-17' }),
      (error: unknown) => {
        assert.ok(error instanceof BadRequestException);
        assert.match(error.message, /register limit/);
        return true;
      },
    );
    assert.equal(calls.studentFindMany, 0);
  });

  it('excludes inactive students from the register and from bulk marking', async () => {
    const { service, calls } = harness({
      students: [student(1), student(2, { status: 'INACTIVE' })],
    });
    const register = await service.getRegister(admin, { classId: classA, date: '2026-09-17' });
    assert.deepEqual(register.students.map((row) => row.id), ['s-1']);
    await assert.rejects(
      () =>
        service.markBulk(
          bulk([
            { studentId: 's-1', status: AttendanceStatus.PRESENT },
            { studentId: 's-2', status: AttendanceStatus.ABSENT },
          ]),
          admin,
        ),
      (error: unknown) => error instanceof BadRequestException && /Inactive/.test(error.message),
    );
    assert.equal(calls.transaction, 0);
  });
});

describe('bulk attendance atomicity', () => {
  it('rolls back every write when a later row fails', async () => {
    const { service, committed, calls } = harness({
      students: [student(1), student(2), student(3)],
      failStudentId: 's-2',
    });
    await assert.rejects(
      () =>
        service.markBulk(
          bulk([
            { studentId: 's-1', status: AttendanceStatus.PRESENT },
            { studentId: 's-2', status: AttendanceStatus.ABSENT },
            { studentId: 's-3', status: AttendanceStatus.LATE },
          ]),
          admin,
        ),
      (error: unknown) => error instanceof InternalServerErrorException,
    );
    assert.equal(committed.size, 0);
    assert.equal(calls.dispatch.length, 0);
  });

  it('retries a concurrent unique conflict once and still saves the class', async () => {
    const { service, committed, calls } = harness({
      students: [student(1), student(2)],
      uniqueOnce: true,
    });
    const result = await service.markBulk(
      bulk([
        { studentId: 's-1', status: AttendanceStatus.PRESENT },
        { studentId: 's-2', status: AttendanceStatus.LATE },
      ]),
      admin,
    );
    assert.equal(result.createdCount + result.updatedCount, 2);
    assert.equal(calls.transaction, 2);
    assert.equal(committed.size, 2);
    assert.equal(committed.get(attendanceKey(schoolA, 's-2', new Date('2026-09-17T00:00:00.000Z')))?.status, AttendanceStatus.LATE);
  });

  it('does not report success when a duplicate conflict keeps failing', async () => {
    const { service, committed, calls } = harness({
      students: [student(1)],
      uniqueAlways: true,
    });
    await assert.rejects(
      () => service.markBulk(bulk([{ studentId: 's-1', status: AttendanceStatus.PRESENT }]), admin),
      (error: unknown) => error instanceof ConflictException,
    );
    assert.equal(committed.size, 0);
    assert.equal(calls.dispatch.length, 0);
  });

  it('does not notify parents again when the student is already absent', async () => {
    const date = new Date('2026-09-17T00:00:00.000Z');
    const { service, calls } = harness({
      students: [student(1)],
      attendance: [
        {
          id: 'att-1',
          schoolId: schoolA,
          studentId: 's-1',
          classId: classA,
          sectionId: 'sec-1',
          date,
          status: AttendanceStatus.ABSENT,
        },
      ],
    });
    await service.markBulk(bulk([{ studentId: 's-1', status: AttendanceStatus.ABSENT }]), admin);
    assert.equal(calls.dispatch.some((body) => body.includes('emitAttendanceAbsent')), false);
    assert.equal(calls.dispatch.some((body) => body.includes('emitAttendanceSubmitted')), true);
    assert.ok(calls.lockSql.some((sql) => sql.includes("AT TIME ZONE 'UTC'")));
  });

  it('replaces existing remarks when the request supplies them', async () => {
    const date = new Date('2026-09-17T00:00:00.000Z');
    const { service, committed, calls } = harness({
      students: [student(1), student(2)],
      attendance: [
        {
          id: 'att-1',
          schoolId: schoolA,
          studentId: 's-1',
          classId: classA,
          sectionId: 'sec-1',
          date,
          status: AttendanceStatus.PRESENT,
          remarks: 'old note',
        },
        {
          id: 'att-2',
          schoolId: schoolA,
          studentId: 's-2',
          classId: classA,
          sectionId: 'sec-1',
          date,
          status: AttendanceStatus.PRESENT,
          remarks: 'keep me',
        },
      ],
    });
    await service.markBulk(
      {
        classId: classA,
        date: '2026-09-17',
        records: [
          { studentId: 's-1', status: AttendanceStatus.ABSENT, remarks: 'parent called' },
          { studentId: 's-2', status: AttendanceStatus.ABSENT },
        ],
      },
      admin,
    );
    assert.equal(committed.get(attendanceKey(schoolA, 's-1', date))?.remarks, 'parent called');
    assert.equal(committed.get(attendanceKey(schoolA, 's-1', date))?.status, AttendanceStatus.ABSENT);
    assert.equal(committed.get(attendanceKey(schoolA, 's-2', date))?.remarks, 'keep me');
    assert.equal(calls.updateMany, 2);
    assert.equal(calls.createMany, 0);
  });

  it('rejects a repeated student before any write or notification', async () => {
    const date = new Date('2026-09-17T00:00:00.000Z');
    const { service, committed, calls } = harness({
      students: [student(1)],
      attendance: [
        {
          id: 'att-1',
          schoolId: schoolA,
          studentId: 's-1',
          classId: classA,
          sectionId: 'sec-1',
          date,
          status: AttendanceStatus.PRESENT,
          remarks: 'old note',
        },
      ],
    });
    await assert.rejects(
      () =>
        service.markBulk(
          {
            classId: classA,
            date: '2026-09-17',
            records: [
              { studentId: 's-1', status: AttendanceStatus.ABSENT, remarks: 'first' },
              { studentId: 's-1', status: AttendanceStatus.LATE, remarks: 'second' },
            ],
          },
          admin,
        ),
      (error: unknown) =>
        error instanceof BadRequestException && /only appear once/.test(error.message),
    );
    assert.equal(calls.transaction, 0);
    assert.equal(calls.studentFindMany, 0);
    assert.equal(calls.updateMany, 0);
    assert.equal(calls.createMany, 0);
    assert.equal(calls.lockSql.length, 0);
    assert.equal(calls.dispatch.length, 0);
    assert.equal(committed.get(attendanceKey(schoolA, 's-1', date))?.status, AttendanceStatus.PRESENT);
    assert.equal(committed.get(attendanceKey(schoolA, 's-1', date))?.remarks, 'old note');
  });

  it('notifies when a student becomes absent, including a different date', async () => {
    const { service, calls } = harness({ students: [student(1)] });
    await service.markBulk(bulk([{ studentId: 's-1', status: AttendanceStatus.ABSENT }]), admin);
    assert.equal(calls.dispatch.filter((body) => body.includes('emitAttendanceAbsent')).length, 1);

    calls.dispatch.length = 0;
    await service.markBulk(
      { classId: classA, date: '2026-09-18', records: [{ studentId: 's-1', status: AttendanceStatus.ABSENT }] },
      admin,
    );
    assert.equal(calls.dispatch.filter((body) => body.includes('emitAttendanceAbsent')).length, 1);
  });

  it('forbids a teacher from bulk-marking a class that is not on their timetable', async () => {
    const { service, calls } = harness({
      students: [student(1, { classId: classB })],
      assignedClassIds: [classA],
    });
    await assert.rejects(
      () => service.markBulk(bulk([{ studentId: 's-1', status: AttendanceStatus.PRESENT }], classB), teacherUser),
      (error: unknown) => error instanceof ForbiddenException && /assigned/.test(error.message),
    );
    assert.equal(calls.transaction, 0);
  });

  it('allows a teacher to bulk-mark a timetable class', async () => {
    const { service, committed } = harness({
      students: [student(1)],
      assignedClassIds: [classA],
    });
    const result = await service.markBulk(
      bulk([{ studentId: 's-1', status: AttendanceStatus.PRESENT }]),
      teacherUser,
    );
    assert.equal(result.createdCount, 1);
    assert.equal(committed.size, 1);
  });
});

describe('school-local attendance date', () => {
  it('uses Asia/Karachi when UTC is still the previous day', async () => {
    const { service } = harness();
    const today = await service.getSchoolToday(admin, undefined, new Date('2026-09-16T22:30:00.000Z'));
    assert.equal(today.date, '2026-09-17');
    assert.equal(today.timeZone, 'Asia/Karachi');

    const register = await service.getRegister(
      admin,
      { classId: classA },
      new Date('2026-09-16T22:30:00.000Z'),
    );
    assert.equal(register.date, '2026-09-17');
    assert.notEqual(register.date, '2026-09-16');
  });

  it('rejects a school user who passes a different school id', async () => {
    const { service } = harness();
    await assert.rejects(
      () => service.getSchoolToday(admin, 'school-other'),
      (error: unknown) => error instanceof ForbiddenException,
    );
  });

  it('rejects a super admin school-today request with no school id', async () => {
    const { service } = harness();
    await assert.rejects(
      () => service.getSchoolToday(superAdmin, undefined),
      (error: unknown) => error instanceof BadRequestException && /schoolId is required/.test(error.message),
    );
    await assert.rejects(
      () => service.getSchoolToday(superAdmin, '   '),
      (error: unknown) => error instanceof BadRequestException && /schoolId is required/.test(error.message),
    );
  });

  it('rejects an unknown school id instead of using Asia/Karachi', async () => {
    const { service } = harness();
    await assert.rejects(
      () => service.getSchoolToday(superAdmin, 'missing-school', new Date('2026-06-15T20:30:00.000Z')),
      (error: unknown) => error instanceof NotFoundException && /School not found/.test(error.message),
    );
  });

  it('uses a valid school timezone other than Asia/Karachi', async () => {
    const { service } = harness({
      schools: { 'school-ny': { timezone: 'America/New_York' } },
    });
    const today = await service.getSchoolToday(
      superAdmin,
      'school-ny',
      new Date('2026-06-15T20:30:00.000Z'),
    );
    assert.equal(today.timeZone, 'America/New_York');
    assert.equal(today.date, '2026-06-15');
    assert.notEqual(today.date, '2026-06-16');
  });

  it('uses Asia/Karachi only when the valid school has no timezone', async () => {
    const { service } = harness({
      schools: { 'school-blank': { timezone: null } },
    });
    const today = await service.getSchoolToday(
      superAdmin,
      'school-blank',
      new Date('2026-06-15T20:30:00.000Z'),
    );
    assert.equal(today.timeZone, 'Asia/Karachi');
    assert.equal(today.date, '2026-06-16');
  });
});

describe('teacher attendance read scope', () => {
  const day = new Date('2026-09-17T00:00:00.000Z');
  const reportQuery = { startDate: '2026-09-01', endDate: '2026-09-30' };

  function twoClasses(assignedClassIds: string[] = [classA]) {
    return harness({
      students: [student(1), student(2, { classId: classB, sectionId: 'sec-b' })],
      attendance: [
        {
          id: 'att-a',
          schoolId: schoolA,
          studentId: 's-1',
          classId: classA,
          sectionId: 'sec-1',
          date: day,
          status: AttendanceStatus.PRESENT,
        },
        {
          id: 'att-b',
          schoolId: schoolA,
          studentId: 's-2',
          classId: classB,
          sectionId: 'sec-b',
          date: day,
          status: AttendanceStatus.ABSENT,
        },
      ],
      assignedClassIds,
    });
  }

  it('does not let a teacher list, summarize, or report another class', async () => {
    const listed = twoClasses();
    await assert.rejects(
      () => listed.service.findAll(teacherUser, { classId: classB }),
      (error: unknown) => error instanceof ForbiddenException && /assigned/.test(error.message),
    );
    assert.equal(listed.calls.attendanceFindMany, 0);

    const summarized = twoClasses();
    await assert.rejects(
      () => summarized.service.getSummary(teacherUser, { classId: classB, date: '2026-09-17' }),
      (error: unknown) => error instanceof ForbiddenException && /assigned/.test(error.message),
    );
    assert.equal(summarized.calls.studentCount, 0);
    assert.equal(summarized.calls.attendanceFindMany, 0);

    const reported = twoClasses();
    await assert.rejects(
      () => reported.service.getClassReport(teacherUser, { classId: classB, ...reportQuery }),
      (error: unknown) => error instanceof ForbiddenException && /assigned/.test(error.message),
    );
    assert.equal(reported.calls.studentFindMany, 0);
  });

  it('does not let a teacher read another class through its section', async () => {
    const listed = twoClasses();
    await assert.rejects(
      () => listed.service.findAll(teacherUser, { sectionId: 'sec-b' }),
      (error: unknown) => error instanceof ForbiddenException && /assigned/.test(error.message),
    );

    const withClass = twoClasses();
    await assert.rejects(
      () => withClass.service.findAll(teacherUser, { classId: classB, sectionId: 'sec-b' }),
      (error: unknown) => error instanceof ForbiddenException && /assigned/.test(error.message),
    );

    const summarized = twoClasses();
    await assert.rejects(
      () => summarized.service.getSummary(teacherUser, { sectionId: 'sec-b', date: '2026-09-17' }),
      (error: unknown) => error instanceof ForbiddenException && /assigned/.test(error.message),
    );

    const reported = twoClasses();
    await assert.rejects(
      () =>
        reported.service.getClassReport(teacherUser, {
          classId: classB,
          sectionId: 'sec-b',
          ...reportQuery,
        }),
      (error: unknown) => error instanceof ForbiddenException && /assigned/.test(error.message),
    );
    assert.equal(listed.calls.attendanceFindMany, 0);
    assert.equal(summarized.calls.attendanceFindMany, 0);
    assert.equal(reported.calls.studentFindMany, 0);
  });

  it('rejects a section that does not belong to the requested class', async () => {
    const { service } = twoClasses();
    await assert.rejects(
      () => service.findAll(admin, { classId: classA, sectionId: 'sec-b' }),
      (error: unknown) =>
        error instanceof BadRequestException && /Section does not belong/.test(error.message),
    );
    await assert.rejects(
      () => service.getSummary(teacherUser, { classId: classA, sectionId: 'sec-b', date: '2026-09-17' }),
      (error: unknown) => error instanceof BadRequestException && /Section does not belong/.test(error.message),
    );
    await assert.rejects(
      () =>
        service.getClassReport(teacherUser, {
          classId: classA,
          sectionId: 'sec-b',
          ...reportQuery,
        }),
      (error: unknown) => error instanceof BadRequestException && /Section does not belong/.test(error.message),
    );
  });

  it('returns only assigned classes for an unscoped teacher read', async () => {
    const { service } = twoClasses();
    const page = await service.findAll(teacherUser, { studentId: 's-2' });
    assert.deepEqual(page.data, []);

    const unscoped = await service.findAll(teacherUser, {});
    assert.deepEqual(
      unscoped.data.map((row) => row.id),
      ['att-a'],
    );

    const summary = await service.getSummary(teacherUser, { date: '2026-09-17' });
    assert.equal(summary.totalStudents, 1);
    assert.equal(summary.present, 1);
    assert.equal(summary.absent, 0);
  });

  it('still returns an assigned class, including by section', async () => {
    const { service } = twoClasses();
    const byClass = await service.findAll(teacherUser, { classId: classA });
    assert.equal(byClass.data[0]?.id, 'att-a');
    const bySection = await service.findAll(teacherUser, { sectionId: 'sec-1' });
    assert.equal(bySection.data[0]?.id, 'att-a');

    const summary = await service.getSummary(teacherUser, { classId: classA, date: '2026-09-17' });
    assert.equal(summary.totalStudents, 1);
    assert.equal(summary.present, 1);

    const report = await service.getClassReport(teacherUser, { classId: classA, ...reportQuery });
    assert.equal(report.students.length, 1);
    assert.equal(report.students[0]?.student.id, 's-1');
  });

  it('does not apply the timetable limit to a school admin or accountant', async () => {
    const { service } = twoClasses([]);
    const page = await service.findAll(admin, { classId: classB });
    assert.equal(page.data[0]?.id, 'att-b');
    const summary = await service.getSummary(admin, { classId: classB, date: '2026-09-17' });
    assert.equal(summary.totalStudents, 1);
    assert.equal(summary.absent, 1);
    const report = await service.getClassReport(admin, { classId: classB, ...reportQuery });
    assert.equal(report.students[0]?.student.id, 's-2');

    const accounts = await service.findAll(accountant, { classId: classB, sectionId: 'sec-b' });
    assert.equal(accounts.data[0]?.id, 'att-b');
  });
});

/**
 * This process serializes transaction callbacks. It does not prove that
 * PostgreSQL waits on FOR UPDATE. Integration plan, on a disposable database:
 * 1. One school, one student, one PRESENT row. Two parallel transactions each
 *    SELECT the row FOR UPDATE, set ABSENT, commit, then notify. Expect one
 *    row and one absence notification.
 * 2. Repeat with no existing row so both insert. Expect one row, one
 *    notification, and the unique-constraint loser to retry without a second
 *    notification.
 * 3. Seed 500, 2000, and 5000 active students and POST /attendance/bulk once
 *    each. Expect the whole class to commit or the whole request to roll
 *    back. A timeout must leave no new rows and send no notifications.
 *    Writes are grouped, not one statement per student. If 5000 still exceeds
 *    Prisma's 5 second interactive timeout, replace the groups with one locked
 *    UPDATE ... FROM (VALUES ...) plus one insert. Do not raise the timeout first.
 */
describe('attendance write concurrency and transaction failure', () => {
  const day = new Date('2026-09-17T00:00:00.000Z');

  it('sends one absence notification when two bulk saves race to create the same row', async () => {
    const { service, calls, committed } = harness({ students: [student(1)] });
    await Promise.all([
      service.markBulk(bulk([{ studentId: 's-1', status: AttendanceStatus.ABSENT }]), admin),
      service.markBulk(bulk([{ studentId: 's-1', status: AttendanceStatus.ABSENT }]), admin),
    ]);
    assert.equal(calls.dispatch.filter((body) => body.includes('emitAttendanceAbsent')).length, 1);
    assert.equal(committed.size, 1);
    assert.equal(committed.get(attendanceKey(schoolA, 's-1', day))?.status, AttendanceStatus.ABSENT);
    assert.equal(calls.lockSql.some((sql) => sql.includes('FOR UPDATE')), true);
  });

  it('sends one absence notification when two manual marks race on a new row', async () => {
    const { service, calls, committed } = harness({ students: [student(1)] });
    await Promise.all([
      service.mark({ studentId: 's-1', date: '2026-09-17', status: AttendanceStatus.ABSENT }, admin),
      service.mark({ studentId: 's-1', date: '2026-09-17', status: AttendanceStatus.ABSENT }, admin),
    ]);
    assert.equal(calls.dispatch.filter((body) => body.includes('emitAttendanceAbsent')).length, 1);
    assert.equal(committed.size, 1);
    assert.equal(calls.lockSql.some((sql) => sql.includes('FOR UPDATE')), true);
  });

  it('sends one absence notification when two updates race on the same present row', async () => {
    const { service, calls, committed } = harness({
      students: [student(1)],
      attendance: [
        {
          id: 'att-1',
          schoolId: schoolA,
          studentId: 's-1',
          classId: classA,
          sectionId: 'sec-1',
          date: day,
          status: AttendanceStatus.PRESENT,
        },
      ],
    });
    await Promise.all([
      service.update('att-1', { status: AttendanceStatus.ABSENT }, admin),
      service.update('att-1', { status: AttendanceStatus.ABSENT }, admin),
    ]);
    assert.equal(calls.dispatch.filter((body) => body.includes('emitAttendanceAbsent')).length, 1);
    assert.equal(committed.get(attendanceKey(schoolA, 's-1', day))?.status, AttendanceStatus.ABSENT);
    assert.equal(calls.lockSql.some((sql) => sql.includes('FOR UPDATE')), true);
  });

  it('does not notify when a retried insert finds the row already absent', async () => {
    const { service, calls, committed } = harness({
      students: [student(1)],
      uniqueOnce: true,
      winnerAlreadyAbsent: true,
    });
    await service.markBulk(bulk([{ studentId: 's-1', status: AttendanceStatus.ABSENT }]), admin);
    assert.equal(calls.transaction, 2);
    assert.equal(calls.dispatch.filter((body) => body.includes('emitAttendanceAbsent')).length, 0);
    assert.equal(calls.dispatch.some((body) => body.includes('emitAttendanceSubmitted')), true);
    assert.equal(committed.get(attendanceKey(schoolA, 's-1', day))?.status, AttendanceStatus.ABSENT);
  });

  it('rolls back a timed-out bulk write and does not notify', async () => {
    const { service, calls, committed } = harness({
      students: [student(1), student(2)],
      attendance: [
        {
          id: 'att-1',
          schoolId: schoolA,
          studentId: 's-1',
          classId: classA,
          sectionId: 'sec-1',
          date: day,
          status: AttendanceStatus.PRESENT,
        },
      ],
      timeout: true,
    });
    await assert.rejects(
      () =>
        service.markBulk(
          bulk([
            { studentId: 's-1', status: AttendanceStatus.ABSENT },
            { studentId: 's-2', status: AttendanceStatus.ABSENT },
          ]),
          admin,
        ),
      (error: unknown) => {
        assert.ok(error instanceof InternalServerErrorException);
        assert.match(error.message, /could not be saved/);
        assert.doesNotMatch(error.message, /expired transaction/);
        return true;
      },
    );
    assert.equal(committed.size, 1);
    assert.equal(committed.get(attendanceKey(schoolA, 's-1', day))?.status, AttendanceStatus.PRESENT);
    assert.equal(calls.dispatch.length, 0);
  });

  it('groups identical updates and new rows into one write each', async () => {
    const { service, calls, committed } = harness({
      students: [student(1), student(2), student(3), student(4)],
      attendance: [
        {
          id: 'att-1',
          schoolId: schoolA,
          studentId: 's-1',
          classId: classA,
          sectionId: 'sec-1',
          date: day,
          status: AttendanceStatus.PRESENT,
          remarks: 'keep',
        },
        {
          id: 'att-2',
          schoolId: schoolA,
          studentId: 's-2',
          classId: classA,
          sectionId: 'sec-1',
          date: day,
          status: AttendanceStatus.PRESENT,
        },
      ],
    });
    const result = await service.markBulk(
      bulk([
        { studentId: 's-1', status: AttendanceStatus.ABSENT },
        { studentId: 's-2', status: AttendanceStatus.LATE },
        { studentId: 's-3', status: AttendanceStatus.ABSENT },
        { studentId: 's-4', status: AttendanceStatus.ABSENT },
      ]),
      admin,
    );
    assert.equal(result.updatedCount, 2);
    assert.equal(result.createdCount, 2);
    assert.equal(calls.updateMany, 2);
    assert.equal(calls.createMany, 1);
    assert.equal(calls.lockSql.filter((sql) => sql.includes('FOR UPDATE')).length, 1);
    assert.equal(committed.get(attendanceKey(schoolA, 's-1', day))?.remarks, 'keep');
    assert.equal(committed.get(attendanceKey(schoolA, 's-1', day))?.status, AttendanceStatus.ABSENT);
    assert.equal(committed.get(attendanceKey(schoolA, 's-2', day))?.status, AttendanceStatus.LATE);
    const absentNotices = calls.dispatch.filter((body) => body.includes('emitAttendanceAbsent'));
    assert.equal(absentNotices.length, 3);
    assert.ok(absentNotices.every((body) => body.startsWith('1|')));
    assert.equal(committed.size, 4);
  });
});

describe('attendance summary aggregation', () => {
  const day = new Date('2026-09-17T00:00:00.000Z');

  it('aggregates in the database and still counts an inactive student row', async () => {
    const { service, calls } = harness({
      students: [student(1), student(2, { status: 'INACTIVE' })],
      attendance: [
        {
          id: 'att-1',
          schoolId: schoolA,
          studentId: 's-1',
          classId: classA,
          sectionId: 'sec-1',
          date: day,
          status: AttendanceStatus.PRESENT,
        },
        {
          id: 'att-2',
          schoolId: schoolA,
          studentId: 's-2',
          classId: classA,
          sectionId: 'sec-1',
          date: day,
          status: AttendanceStatus.ABSENT,
        },
      ],
    });
    const summary = await service.getSummary(admin, { date: '2026-09-17' });
    assert.equal(summary.totalStudents, 1);
    assert.equal(summary.present, 1);
    assert.equal(summary.absent, 1);
    assert.equal(summary.leave, 0);
    assert.equal(summary.late, 0);
    assert.equal(summary.notMarked, 0);
    assert.equal(calls.attendanceFindMany, 0);
  });

  it('does not count another school for a school admin', async () => {
    const { service } = harness({
      students: [student(1), student(2, { schoolId: 'school-b' })],
      attendance: [
        {
          id: 'att-1',
          schoolId: schoolA,
          studentId: 's-1',
          classId: classA,
          sectionId: 'sec-1',
          date: day,
          status: AttendanceStatus.LATE,
        },
        {
          id: 'att-b',
          schoolId: 'school-b',
          studentId: 's-2',
          classId: classA,
          sectionId: 'sec-1',
          date: day,
          status: AttendanceStatus.ABSENT,
        },
      ],
    });
    const summary = await service.getSummary(admin, { date: '2026-09-17' });
    assert.equal(summary.totalStudents, 1);
    assert.equal(summary.late, 1);
    assert.equal(summary.absent, 0);
    await assert.rejects(
      () => service.getSummary(admin, { schoolId: 'school-b', date: '2026-09-17' }),
      (error: unknown) => error instanceof ForbiddenException,
    );
  });
});
