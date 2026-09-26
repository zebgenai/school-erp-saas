import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { Prisma, TeacherAttendanceSource, UserRole } from '@prisma/client';
import {
  TEACHER_CHECKOUT_MIN_MS,
  TeacherAttendanceService,
} from './teacher-attendance.service';

const schoolA = 'school-a';
const schoolB = 'school-b';

const admin = {
  id: 'admin-1',
  email: 'admin@test',
  name: 'Admin',
  role: UserRole.SCHOOL_ADMIN,
  schoolId: schoolA,
};

const teacherUser = {
  id: 'user-teacher-1',
  email: 'teacher@test',
  name: 'Teacher User',
  role: UserRole.TEACHER,
  schoolId: schoolA,
};

const teacherA = {
  id: 'teacher-a',
  schoolId: schoolA,
  userId: teacherUser.id,
  fullName: 'Ali Teacher',
  status: 'ACTIVE',
  employeeNo: 'T-001',
  designation: 'Senior',
  photoUrl: null,
};

const teacherB = {
  id: 'teacher-b',
  schoolId: schoolA,
  userId: 'user-teacher-2',
  fullName: 'Sara Teacher',
  status: 'ACTIVE',
  employeeNo: 'T-002',
  designation: null,
  photoUrl: null,
};

const inactiveTeacher = {
  ...teacherA,
  id: 'teacher-inactive',
  userId: 'user-inactive',
  fullName: 'Inactive Teacher',
  status: 'INACTIVE',
};

function serviceWith(prisma: Record<string, unknown>) {
  return new TeacherAttendanceService(prisma as any);
}

function baseInclude(
  record: Record<string, unknown>,
  teacher: {
    id: string;
    fullName: string;
    employeeNo: string | null;
    designation: string | null;
    status: string;
    photoUrl: string | null;
  } = teacherA,
) {
  return {
    ...record,
    teacher: {
      id: teacher.id,
      fullName: teacher.fullName,
      employeeNo: teacher.employeeNo,
      designation: teacher.designation,
      status: teacher.status,
      photoUrl: teacher.photoUrl,
    },
    markedBy: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
  };
}

describe('Teacher attendance punch', () => {
  it('first punch creates check-in with server timestamp', async () => {
    const now = new Date('2026-09-26T04:30:00.000Z'); // 09:30 Asia/Karachi
    const created: { data?: Record<string, unknown> } = {};
    const svc = serviceWith({
      teacher: {
        findUnique: async () => teacherA,
      },
      school: {
        findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }),
      },
      teacherAttendance: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.data = data;
          return baseInclude({ id: 'att-1', ...data });
        },
      },
    });

    const result = await svc.punch({ teacherId: teacherA.id }, admin as any, now);
    assert.equal(result.result, 'CHECK_IN');
    assert.equal(created.data?.checkInAt, now);
    assert.equal(created.data?.checkOutAt, undefined);
    assert.equal(created.data?.source, TeacherAttendanceSource.MANUAL);
    assert.equal(created.data?.schoolId, schoolA);
    assert.equal(created.data?.teacherId, teacherA.id);
    assert.deepEqual(created.data?.workDate, new Date('2026-09-26T00:00:00.000Z'));
    assert.equal(created.data?.markedById, admin.id);
  });

  it('workDate respects school timezone near midnight UTC', async () => {
    // 2026-09-25 22:30 UTC = 2026-09-26 03:30 Asia/Karachi
    const now = new Date('2026-09-25T22:30:00.000Z');
    const created: { data?: Record<string, unknown> } = {};
    const svc = serviceWith({
      teacher: { findUnique: async () => teacherA },
      school: {
        findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }),
      },
      teacherAttendance: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.data = data;
          return baseInclude({ id: 'att-tz', ...data });
        },
      },
    });

    await svc.punch({ teacherId: teacherA.id }, admin as any, now);
    assert.deepEqual(created.data?.workDate, new Date('2026-09-26T00:00:00.000Z'));
  });

  it('second punch before 10 minutes returns ALREADY_CHECKED_IN', async () => {
    const checkInAt = new Date('2026-09-26T04:00:00.000Z');
    const now = new Date(checkInAt.getTime() + TEACHER_CHECKOUT_MIN_MS - 1);
    const existing = baseInclude({
      id: 'att-1',
      schoolId: schoolA,
      teacherId: teacherA.id,
      workDate: new Date('2026-09-26T00:00:00.000Z'),
      checkInAt,
      checkOutAt: null,
      source: TeacherAttendanceSource.MANUAL,
    });
    let updated = false;
    const svc = serviceWith({
      teacher: { findUnique: async () => teacherA },
      school: {
        findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }),
      },
      teacherAttendance: {
        findUnique: async () => existing,
        update: async () => {
          updated = true;
          return existing;
        },
      },
    });

    const result = await svc.punch({ teacherId: teacherA.id }, admin as any, now);
    assert.equal(result.result, 'ALREADY_CHECKED_IN');
    assert.equal(updated, false);
    assert.ok((result.checkoutAllowedInMs ?? 0) >= 1);
  });

  it('second punch at exactly 10 minutes allows checkout', async () => {
    const checkInAt = new Date('2026-09-26T04:00:00.000Z');
    const now = new Date(checkInAt.getTime() + TEACHER_CHECKOUT_MIN_MS);
    const existing = baseInclude({
      id: 'att-1',
      schoolId: schoolA,
      teacherId: teacherA.id,
      workDate: new Date('2026-09-26T00:00:00.000Z'),
      checkInAt,
      checkOutAt: null,
      source: TeacherAttendanceSource.MANUAL,
    });
    const svc = serviceWith({
      teacher: { findUnique: async () => teacherA },
      school: {
        findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }),
      },
      teacherAttendance: {
        findUnique: async () => existing,
        update: async ({ data }: { data: Record<string, unknown> }) =>
          baseInclude({ ...existing, ...data }),
      },
    });

    const result = await svc.punch({ teacherId: teacherA.id }, admin as any, now);
    assert.equal(result.result, 'CHECK_OUT');
    assert.equal(result.attendance?.checkOutAt?.getTime(), now.getTime());
  });

  it('second punch after 10 minutes allows checkout', async () => {
    const checkInAt = new Date('2026-09-26T04:00:00.000Z');
    const now = new Date(checkInAt.getTime() + TEACHER_CHECKOUT_MIN_MS + 60_000);
    const existing = baseInclude({
      id: 'att-1',
      schoolId: schoolA,
      teacherId: teacherA.id,
      workDate: new Date('2026-09-26T00:00:00.000Z'),
      checkInAt,
      checkOutAt: null,
      source: TeacherAttendanceSource.MANUAL,
    });
    const svc = serviceWith({
      teacher: { findUnique: async () => teacherA },
      school: {
        findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }),
      },
      teacherAttendance: {
        findUnique: async () => existing,
        update: async ({ data }: { data: Record<string, unknown> }) =>
          baseInclude({ ...existing, ...data }),
      },
    });

    const result = await svc.punch({ teacherId: teacherA.id }, admin as any, now);
    assert.equal(result.result, 'CHECK_OUT');
  });

  it('already checked-out teacher cannot punch again', async () => {
    const existing = baseInclude({
      id: 'att-1',
      schoolId: schoolA,
      teacherId: teacherA.id,
      workDate: new Date('2026-09-26T00:00:00.000Z'),
      checkInAt: new Date('2026-09-26T04:00:00.000Z'),
      checkOutAt: new Date('2026-09-26T12:00:00.000Z'),
      source: TeacherAttendanceSource.MANUAL,
    });
    let updated = false;
    const svc = serviceWith({
      teacher: { findUnique: async () => teacherA },
      school: {
        findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }),
      },
      teacherAttendance: {
        findUnique: async () => existing,
        update: async () => {
          updated = true;
          return existing;
        },
      },
    });

    const result = await svc.punch(
      { teacherId: teacherA.id },
      admin as any,
      new Date('2026-09-26T13:00:00.000Z'),
    );
    assert.equal(result.result, 'ALREADY_COMPLETED');
    assert.equal(updated, false);
  });

  it('two different teachers can punch independently', async () => {
    const now = new Date('2026-09-26T05:00:00.000Z');
    const store = new Map<string, any>();
    const svc = serviceWith({
      teacher: {
        findUnique: async ({ where: { id } }: any) =>
          id === teacherA.id ? teacherA : id === teacherB.id ? teacherB : null,
      },
      school: {
        findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }),
      },
      teacherAttendance: {
        findUnique: async ({ where }: any) => {
          const key = `${where.schoolId_teacherId_workDate.teacherId}`;
          return store.get(key) ?? null;
        },
        create: async ({ data }: any) => {
          const row = baseInclude(
            { id: `att-${data.teacherId}`, ...data },
            data.teacherId === teacherA.id ? teacherA : teacherB,
          );
          store.set(data.teacherId, row);
          return row;
        },
      },
    });

    const a = await svc.punch({ teacherId: teacherA.id }, admin as any, now);
    const b = await svc.punch({ teacherId: teacherB.id }, admin as any, now);
    assert.equal(a.result, 'CHECK_IN');
    assert.equal(b.result, 'CHECK_IN');
    assert.equal(store.size, 2);
  });

  it('inactive teacher is rejected', async () => {
    const svc = serviceWith({
      teacher: { findUnique: async () => inactiveTeacher },
      school: { findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }) },
      teacherAttendance: {
        findUnique: async () => null,
        create: async () => {
          throw new Error('should not create');
        },
      },
    });

    const result = await svc.punch(
      { teacherId: inactiveTeacher.id },
      admin as any,
      new Date('2026-09-26T05:00:00.000Z'),
    );
    assert.equal(result.result, 'INACTIVE_TEACHER');
  });

  it('wrong-school teacher cannot be accessed', async () => {
    const foreign = { ...teacherA, schoolId: schoolB };
    const svc = serviceWith({
      teacher: { findUnique: async () => foreign },
      school: { findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }) },
      teacherAttendance: {
        create: async () => {
          throw new Error('should not create');
        },
      },
    });

    await assert.rejects(
      () => svc.punch({ teacherId: foreign.id }, admin as any, new Date()),
      ForbiddenException,
    );
  });

  it('teacher cannot punch another teacher', async () => {
    const svc = serviceWith({
      teacher: { findUnique: async () => teacherB },
      school: { findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }) },
      teacherAttendance: {
        create: async () => {
          throw new Error('should not create');
        },
      },
    });

    await assert.rejects(
      () => svc.punch({ teacherId: teacherB.id }, teacherUser as any, new Date()),
      ForbiddenException,
    );
  });

  it('missing teacher returns INVALID_TEACHER', async () => {
    const svc = serviceWith({
      teacher: { findUnique: async () => null },
    });
    const result = await svc.punch({ teacherId: 'missing' }, admin as any, new Date());
    assert.equal(result.result, 'INVALID_TEACHER');
  });

  it('concurrent create race falls back without duplicate create retry success path', async () => {
    const now = new Date('2026-09-26T05:00:00.000Z');
    const raced = baseInclude({
      id: 'att-raced',
      schoolId: schoolA,
      teacherId: teacherA.id,
      workDate: new Date('2026-09-26T00:00:00.000Z'),
      checkInAt: now,
      checkOutAt: null,
      source: TeacherAttendanceSource.MANUAL,
    });
    let createCalls = 0;
    const svc = serviceWith({
      teacher: { findUnique: async () => teacherA },
      school: {
        findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }),
      },
      teacherAttendance: {
        findUnique: async () => {
          // First lookup empty, second lookup after P2002 returns raced row.
          return createCalls === 0 ? null : raced;
        },
        create: async () => {
          createCalls += 1;
          const err = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
            code: 'P2002',
            clientVersion: 'test',
          });
          throw err;
        },
        update: async () => raced,
      },
    });

    const result = await svc.punch({ teacherId: teacherA.id }, admin as any, now);
    assert.equal(createCalls, 1);
    assert.equal(result.result, 'ALREADY_CHECKED_IN');
  });
});
