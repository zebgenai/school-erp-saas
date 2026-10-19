import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  AttendanceStatus,
  Prisma,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import {
  assertAttendanceItIdentity,
  createAttendanceItLockSession,
  createAttendanceItPrisma,
} from './attendance-it-db';

const DATE = '2026-09-17';
const DAY = new Date('2026-09-17T00:00:00.000Z');

type Fixture = {
  schoolId: string;
  otherSchoolId?: string;
  userId: string;
  classId: string;
  sectionId: string;
  slug: string;
};

type Recorder = {
  absent: number;
  submitted: number;
  sawCommittedAbsent: boolean[];
  pending: Promise<void>[];
  dispatch: (fn: () => Promise<void>) => void;
  emitAttendanceAbsent: () => Promise<void>;
  emitAttendanceSubmitted: () => Promise<void>;
};

let prisma: PrismaClient;

before(async () => {
  prisma = createAttendanceItPrisma();
  await assertAttendanceItIdentity(prisma);
});

after(async () => {
  await removeInsertBarrier(prisma);
  await prisma.$disconnect();
});

describe('attendance PostgreSQL integration', { concurrency: false }, () => {
  it('creates and updates a bulk register', async () => {
    const fixture = await createFixture(prisma, 'bulk');
    const recorder = createRecorder();
    try {
      const students = await createStudents(prisma, fixture, 2);
      const service = makeService(prisma, recorder);
      const created = await service.markBulk(
        {
          classId: fixture.classId,
          date: DATE,
          records: students.map((student) => ({
            studentId: student.id,
            status: AttendanceStatus.PRESENT,
          })),
        },
        admin(fixture),
      );
      assert.equal(created.createdCount, 2);
      assert.equal(created.updatedCount, 0);
      const updated = await service.markBulk(
        {
          classId: fixture.classId,
          date: DATE,
          records: [
            { studentId: students[0].id, status: AttendanceStatus.LATE },
            { studentId: students[1].id, status: AttendanceStatus.ABSENT },
          ],
        },
        admin(fixture),
      );
      assert.equal(updated.createdCount, 0);
      assert.equal(updated.updatedCount, 2);
      const rows = await rowsFor(prisma, fixture.schoolId);
      assert.equal(rows.length, 2);
      assert.equal(statusFor(rows, students[0].id), AttendanceStatus.LATE);
      assert.equal(statusFor(rows, students[1].id), AttendanceStatus.ABSENT);
      await Promise.all(recorder.pending);
      assert.equal(recorder.absent, 1);
      assert.ok(recorder.sawCommittedAbsent.every(Boolean));
    } finally {
      await cleanup(prisma, fixture);
    }
  });

  it('replaces explicit remarks and preserves omitted remarks', async () => {
    const fixture = await createFixture(prisma, 'remarks');
    try {
      const students = await createStudents(prisma, fixture, 2);
      await prisma.studentAttendance.createMany({
        data: [
          row(fixture, students[0].id, AttendanceStatus.PRESENT, 'old note'),
          row(fixture, students[1].id, AttendanceStatus.PRESENT, 'keep me'),
        ],
      });
      const service = makeService(prisma, createRecorder());
      await service.markBulk(
        {
          classId: fixture.classId,
          date: DATE,
          records: [
            { studentId: students[0].id, status: AttendanceStatus.ABSENT, remarks: 'parent called' },
            { studentId: students[1].id, status: AttendanceStatus.ABSENT },
          ],
        },
        admin(fixture),
      );
      const rows = await rowsFor(prisma, fixture.schoolId);
      assert.equal(rows.find((item) => item.studentId === students[0].id)?.remarks, 'parent called');
      assert.equal(rows.find((item) => item.studentId === students[1].id)?.remarks, 'keep me');
    } finally {
      await cleanup(prisma, fixture);
    }
  });

  it('rejects a repeated student before writing', async () => {
    const fixture = await createFixture(prisma, 'duplicate');
    const recorder = createRecorder();
    try {
      const [student] = await createStudents(prisma, fixture, 1);
      const service = makeService(prisma, recorder);
      await assert.rejects(
        () =>
          service.markBulk(
            {
              classId: fixture.classId,
              date: DATE,
              records: [
                { studentId: student.id, status: AttendanceStatus.ABSENT, remarks: 'first' },
                { studentId: student.id, status: AttendanceStatus.LATE, remarks: 'second' },
              ],
            },
            admin(fixture),
          ),
        (error: unknown) => error instanceof BadRequestException && /only appear once/.test(error.message),
      );
      assert.equal(await countRows(prisma, fixture.schoolId), 0);
      assert.equal(recorder.absent, 0);
      assert.equal(recorder.submitted, 0);
    } finally {
      await cleanup(prisma, fixture);
    }
  });

  it('lets one of two concurrent inserts win and notifies only once', async () => {
    const fixture = await createFixture(prisma, 'race-insert');
    const holder = createAttendanceItLockSession();
    const recorder = createRecorder(() => absentIsVisible(prisma, fixture.schoolId));
    try {
      await assertAttendanceItIdentity(holder);
      const [student] = await createStudents(prisma, fixture, 1);
      await installInsertBarrier(prisma);
      await prisma.$executeRaw`
        INSERT INTO attendance_it_barrier (school_id, active)
        VALUES (${fixture.schoolId}, true)
      `;
      await holder.$executeRaw`SELECT pg_advisory_lock(42, 42)`;
      const service = makeService(prisma, recorder);
      const payload = {
        classId: fixture.classId,
        date: DATE,
        records: [{ studentId: student.id, status: AttendanceStatus.ABSENT }],
      };
      const first = service.markBulk(payload, admin(fixture));
      const second = service.markBulk(payload, admin(fixture));
      await waitUntil(async () => (await waitingAdvisoryLocks(prisma)) >= 2, 'both inserts to wait');
      await holder.$executeRaw`SELECT pg_advisory_unlock(42, 42)`;
      await Promise.all([first, second]);
      await Promise.all(recorder.pending);
      const rows = await rowsFor(prisma, fixture.schoolId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.status, AttendanceStatus.ABSENT);
      assert.equal(recorder.absent, 1);
      assert.deepEqual(recorder.sawCommittedAbsent, [true]);
    } finally {
      await holder.$executeRaw`SELECT pg_advisory_unlock(42, 42)`.catch(() => undefined);
      await holder.$disconnect();
      await removeInsertBarrier(prisma);
      await cleanup(prisma, fixture);
    }
  });

  it('does not notify twice when two updates race from PRESENT to ABSENT', async () => {
    const fixture = await createFixture(prisma, 'race-update');
    const recorder = createRecorder(() => absentIsVisible(prisma, fixture.schoolId));
    try {
      const [student] = await createStudents(prisma, fixture, 1);
      await prisma.studentAttendance.create({
        data: row(fixture, student.id, AttendanceStatus.PRESENT, null),
      });
      const service = makeService(prisma, recorder);
      const payload = {
        classId: fixture.classId,
        date: DATE,
        records: [{ studentId: student.id, status: AttendanceStatus.ABSENT }],
      };
      await Promise.all([
        service.markBulk(payload, admin(fixture)),
        service.markBulk(payload, admin(fixture)),
      ]);
      await Promise.all(recorder.pending);
      const rows = await rowsFor(prisma, fixture.schoolId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.status, AttendanceStatus.ABSENT);
      assert.equal(recorder.absent, 1);
      assert.deepEqual(recorder.sawCommittedAbsent, [true]);
    } finally {
      await cleanup(prisma, fixture);
    }
  });

  it('does not notify again when the student is already ABSENT', async () => {
    const fixture = await createFixture(prisma, 'repeat-absent');
    try {
      const [student] = await createStudents(prisma, fixture, 1);
      const firstRecorder = createRecorder();
      const service = makeService(prisma, firstRecorder);
      const payload = {
        classId: fixture.classId,
        date: DATE,
        records: [{ studentId: student.id, status: AttendanceStatus.ABSENT }],
      };
      await service.markBulk(payload, admin(fixture));
      await Promise.all(firstRecorder.pending);
      const secondRecorder = createRecorder();
      const again = makeService(prisma, secondRecorder);
      await again.markBulk(payload, admin(fixture));
      await Promise.all(secondRecorder.pending);
      assert.equal(firstRecorder.absent, 1);
      assert.equal(secondRecorder.absent, 0);
      assert.equal(secondRecorder.submitted, 1);
      assert.equal(await countRows(prisma, fixture.schoolId), 1);
    } finally {
      await cleanup(prisma, fixture);
    }
  });

  it('rolls back the whole batch when the write transaction times out', async () => {
    const fixture = await createFixture(prisma, 'rollback');
    const holder = createAttendanceItLockSession();
    const recorder = createRecorder();
    try {
      await assertAttendanceItIdentity(holder);
      const students = await createStudents(prisma, fixture, 2);
      const existing = await prisma.studentAttendance.create({
        data: row(fixture, students[0].id, AttendanceStatus.PRESENT, 'keep me'),
      });
      let locked = false;
      const hold = holder.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "StudentAttendance" WHERE id = ${existing.id} FOR UPDATE`;
          locked = true;
          await tx.$queryRaw`SELECT pg_sleep(7)::text AS done`;
        },
        { timeout: 20_000, maxWait: 5_000 },
      );
      await waitUntil(async () => locked, 'row lock');
      const service = makeService(prisma, recorder);
      await assert.rejects(
        () =>
          service.markBulk(
            {
              classId: fixture.classId,
              date: DATE,
              records: [
                { studentId: students[0].id, status: AttendanceStatus.ABSENT, remarks: 'should not stick' },
                { studentId: students[1].id, status: AttendanceStatus.ABSENT },
              ],
            },
            admin(fixture),
          ),
        (error: unknown) => error instanceof InternalServerErrorException,
      );
      await hold;
      const rows = await rowsFor(prisma, fixture.schoolId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.status, AttendanceStatus.PRESENT);
      assert.equal(rows[0]?.remarks, 'keep me');
      assert.equal(recorder.absent, 0);
      assert.equal(recorder.submitted, 0);
    } finally {
      await holder.$disconnect();
      await cleanup(prisma, fixture);
    }
  });

  it('rejects another school and a missing student before writing, and the foreign key rejects a dangling student', async () => {
    const fixture = await createFixture(prisma, 'scope');
    const recorder = createRecorder();
    try {
      const [student] = await createStudents(prisma, fixture, 1);
      const other = await prisma.school.create({
        data: { name: `${fixture.slug}-other`, slug: `${fixture.slug}-other`, timezone: 'Asia/Karachi' },
      });
      fixture.otherSchoolId = other.id;
      const otherClass = await prisma.class.create({
        data: { schoolId: other.id, name: 'Other' },
      });
      const otherStudent = await prisma.student.create({
        data: {
          schoolId: other.id,
          classId: otherClass.id,
          admissionNo: `${fixture.slug}-other`,
          fullName: 'Other School',
          status: 'ACTIVE',
        },
      });
      const service = makeService(prisma, recorder);
      await assert.rejects(
        () =>
          service.markBulk(
            {
              classId: fixture.classId,
              date: DATE,
              records: [
                { studentId: student.id, status: AttendanceStatus.PRESENT },
                { studentId: otherStudent.id, status: AttendanceStatus.ABSENT },
              ],
            },
            admin(fixture),
          ),
        (error: unknown) => error instanceof ForbiddenException,
      );
      await assert.rejects(
        () =>
          service.markBulk(
            {
              classId: fixture.classId,
              date: DATE,
              records: [{ studentId: randomUUID(), status: AttendanceStatus.PRESENT }],
            },
            admin(fixture),
          ),
        (error: unknown) => error instanceof NotFoundException,
      );
      await assert.rejects(
        () =>
          prisma.studentAttendance.create({
            data: {
              schoolId: fixture.schoolId,
              studentId: randomUUID(),
              date: DAY,
              status: AttendanceStatus.PRESENT,
            },
          }),
        (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003',
      );
      assert.equal(await countRows(prisma, fixture.schoolId), 0);
      assert.equal(await countRows(prisma, other.id), 0);
      assert.equal(recorder.absent, 0);
      assert.equal(recorder.submitted, 0);
    } finally {
      await cleanup(prisma, fixture);
    }
  });
});

function makeService(client: PrismaClient, recorder: Recorder) {
  return new AttendanceService(client as never, recorder as never);
}

function createRecorder(readCommitted?: () => Promise<boolean>): Recorder {
  const recorder: Recorder = {
    absent: 0,
    submitted: 0,
    sawCommittedAbsent: [],
    pending: [],
    dispatch(fn) {
      const task = (async () => {
        const source = fn.toString();
        if (source.includes('emitAttendanceAbsent') && readCommitted) {
          recorder.sawCommittedAbsent.push(await readCommitted());
        }
        await fn();
      })();
      recorder.pending.push(task);
    },
    async emitAttendanceAbsent() {
      recorder.absent += 1;
    },
    async emitAttendanceSubmitted() {
      recorder.submitted += 1;
    },
  };
  return recorder;
}

function admin(fixture: Fixture) {
  return {
    id: fixture.userId,
    email: `${fixture.slug}@attendance-it.local`,
    name: 'Integration Marker',
    role: UserRole.SCHOOL_ADMIN,
    schoolId: fixture.schoolId,
  };
}

async function createFixture(client: PrismaClient, label: string): Promise<Fixture> {
  const slug = `attendance-it-${label}-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const school = await client.school.create({
    data: { name: slug, slug, timezone: 'Asia/Karachi' },
  });
  const user = await client.user.create({
    data: {
      schoolId: school.id,
      name: 'Integration Marker',
      email: `${slug}@attendance-it.local`,
      password: 'integration-not-used',
      role: UserRole.SCHOOL_ADMIN,
    },
  });
  const classRow = await client.class.create({
    data: { schoolId: school.id, name: 'Class 1' },
  });
  const section = await client.section.create({
    data: { schoolId: school.id, classId: classRow.id, name: 'A' },
  });
  return { schoolId: school.id, userId: user.id, classId: classRow.id, sectionId: section.id, slug };
}

async function createStudents(client: PrismaClient, fixture: Fixture, count: number) {
  return client.student.createManyAndReturn({
    data: Array.from({ length: count }, (_, index) => ({
      schoolId: fixture.schoolId,
      classId: fixture.classId,
      sectionId: fixture.sectionId,
      admissionNo: `${fixture.slug}-${index}`,
      fullName: `Student ${index}`,
      status: 'ACTIVE',
    })),
    select: { id: true },
  });
}

function row(
  fixture: Fixture,
  studentId: string,
  status: AttendanceStatus,
  remarks: string | null,
) {
  return {
    schoolId: fixture.schoolId,
    studentId,
    classId: fixture.classId,
    sectionId: fixture.sectionId,
    date: DAY,
    status,
    remarks,
    markedById: fixture.userId,
  };
}

async function rowsFor(client: PrismaClient, schoolId: string) {
  return client.studentAttendance.findMany({ where: { schoolId } });
}

function statusFor(rows: Array<{ studentId: string; status: AttendanceStatus }>, studentId: string) {
  return rows.find((row) => row.studentId === studentId)?.status;
}

async function countRows(client: PrismaClient, schoolId: string) {
  return client.studentAttendance.count({ where: { schoolId } });
}

async function absentIsVisible(client: PrismaClient, schoolId: string) {
  const count = await client.studentAttendance.count({
    where: { schoolId, status: AttendanceStatus.ABSENT },
  });
  return count > 0;
}

async function cleanup(client: PrismaClient, fixture: Fixture) {
  if (!fixture.slug.startsWith('attendance-it-')) {
    throw new Error('Refusing cleanup of a school this test did not create.');
  }
  const schoolIds = [fixture.schoolId, fixture.otherSchoolId].filter((id): id is string => Boolean(id));
  const owned = await client.school.findMany({
    where: { id: { in: schoolIds }, slug: { startsWith: fixture.slug } },
    select: { id: true },
  });
  const ids = owned.map((school) => school.id);
  if (ids.length === 0) return;
  await client.studentAttendance.deleteMany({ where: { schoolId: { in: ids } } });
  await client.student.deleteMany({ where: { schoolId: { in: ids } } });
  await client.section.deleteMany({ where: { schoolId: { in: ids } } });
  await client.class.deleteMany({ where: { schoolId: { in: ids } } });
  await client.user.deleteMany({ where: { schoolId: { in: ids } } });
  await client.school.deleteMany({ where: { id: { in: ids } } });
}

async function installInsertBarrier(client: PrismaClient) {
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS attendance_it_barrier (
      school_id text PRIMARY KEY,
      active boolean NOT NULL
    )
  `);
  await client.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION attendance_it_insert_barrier()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM attendance_it_barrier
        WHERE school_id = NEW."schoolId" AND active
      ) THEN
        PERFORM pg_advisory_xact_lock(42, 42);
      END IF;
      RETURN NEW;
    END;
    $fn$
  `);
  await client.$executeRawUnsafe(`
    DROP TRIGGER IF EXISTS attendance_it_insert_barrier ON "StudentAttendance"
  `);
  await client.$executeRawUnsafe(`
    CREATE TRIGGER attendance_it_insert_barrier
    BEFORE INSERT ON "StudentAttendance"
    FOR EACH ROW
    EXECUTE FUNCTION attendance_it_insert_barrier()
  `);
}

async function removeInsertBarrier(client: PrismaClient) {
  await client.$executeRawUnsafe(`
    DROP TRIGGER IF EXISTS attendance_it_insert_barrier ON "StudentAttendance"
  `);
  await client.$executeRawUnsafe(`DROP FUNCTION IF EXISTS attendance_it_insert_barrier()`);
  await client.$executeRawUnsafe(`DROP TABLE IF EXISTS attendance_it_barrier`);
}

async function waitingAdvisoryLocks(client: PrismaClient) {
  const rows = await client.$queryRaw<Array<{ waiting: number }>>`
    SELECT COUNT(*)::int AS waiting
    FROM pg_locks
    WHERE locktype = 'advisory'
      AND NOT granted
      AND classid = 42
      AND objid = 42
  `;
  return Number(rows[0]?.waiting ?? 0);
}

async function waitUntil(read: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (await read()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
