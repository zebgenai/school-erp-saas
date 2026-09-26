import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { TeacherAttendanceSource, UserRole } from '@prisma/client';
import {
  TEACHER_CHECKOUT_MIN_MS,
  TeacherAttendanceService,
} from './teacher-attendance.service';
import { generateTeacherQrToken, generateQrToken } from '../id-cards/qr-token';

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
  designation: 'Junior',
  photoUrl: null,
};

function baseInclude(record: Record<string, unknown>, teacher = teacherA) {
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

describe('Teacher QR attendance punchFromQr', () => {
  it('valid TCC1 token creates CHECK_IN with server timestamp and QR source', async () => {
    const token = generateTeacherQrToken();
    const now = new Date('2026-09-26T04:30:00.000Z');
    const created: { data?: Record<string, unknown> } = {};
    const svc = new TeacherAttendanceService({
      teacherIdCard: {
        findUnique: async () => ({
          id: 'card-1',
          qrToken: token,
          schoolId: schoolA,
          isActive: true,
          revokedAt: null,
          teacher: teacherA,
        }),
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
    } as any);

    const result = await svc.punchFromQr({ qrToken: token }, admin as any, now);
    assert.equal(result.result, 'CHECK_IN');
    assert.equal(created.data?.checkInAt, now);
    assert.equal(created.data?.source, TeacherAttendanceSource.QR);
    assert.equal(result.teacher?.fullName, 'Ali Teacher');
    assert.equal(result.teacher?.employeeNo, 'T-001');
    assert.equal(result.checkInAt, now);
    assert.equal(result.workDate?.toISOString(), '2026-09-26T00:00:00.000Z');
  });

  it('rejects student CC1 tokens as INVALID_CARD', async () => {
    const svc = new TeacherAttendanceService({} as any);
    const result = await svc.punchFromQr({ qrToken: generateQrToken() }, admin as any);
    assert.equal(result.result, 'INVALID_CARD');
  });

  it('second scan before 10 minutes returns ALREADY_CHECKED_IN with remainingSeconds', async () => {
    const token = generateTeacherQrToken();
    const checkInAt = new Date('2026-09-26T05:00:00.000Z');
    const tooEarly = new Date(checkInAt.getTime() + 5 * 60 * 1000);
    const existing = baseInclude({
      id: 'att-1',
      schoolId: schoolA,
      teacherId: teacherA.id,
      workDate: new Date('2026-09-26T00:00:00.000Z'),
      checkInAt,
      checkOutAt: null,
      source: TeacherAttendanceSource.QR,
    });
    const svc = new TeacherAttendanceService({
      teacherIdCard: {
        findUnique: async () => ({
          id: 'card-1',
          qrToken: token,
          schoolId: schoolA,
          isActive: true,
          revokedAt: null,
          teacher: teacherA,
        }),
      },
      school: { findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }) },
      teacherAttendance: {
        findUnique: async () => existing,
        update: async () => {
          throw new Error('should not update');
        },
      },
    } as any);

    const result = await svc.punchFromQr({ qrToken: token }, admin as any, tooEarly);
    assert.equal(result.result, 'ALREADY_CHECKED_IN');
    assert.equal(result.checkInAt, checkInAt);
    assert.ok((result.remainingSeconds ?? 0) > 0);
    assert.equal(result.checkOutAt, null);
  });

  it('second scan at exactly 10 minutes allows CHECK_OUT', async () => {
    const token = generateTeacherQrToken();
    const checkInAt = new Date('2026-09-26T05:00:00.000Z');
    const exactly = new Date(checkInAt.getTime() + TEACHER_CHECKOUT_MIN_MS);
    const existing = baseInclude({
      id: 'att-1',
      schoolId: schoolA,
      teacherId: teacherA.id,
      workDate: new Date('2026-09-26T00:00:00.000Z'),
      checkInAt,
      checkOutAt: null,
      source: TeacherAttendanceSource.QR,
    });
    const svc = new TeacherAttendanceService({
      teacherIdCard: {
        findUnique: async () => ({
          id: 'card-1',
          qrToken: token,
          schoolId: schoolA,
          isActive: true,
          revokedAt: null,
          teacher: teacherA,
        }),
      },
      school: { findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }) },
      teacherAttendance: {
        findUnique: async () => existing,
        update: async ({ data }: { data: Record<string, unknown> }) =>
          baseInclude({ ...existing, ...data }),
      },
    } as any);

    const result = await svc.punchFromQr({ qrToken: token }, admin as any, exactly);
    assert.equal(result.result, 'CHECK_OUT');
    assert.equal(result.checkOutAt, exactly);
    assert.equal(result.workingMinutes, 10);
  });

  it('second scan after 10 minutes allows CHECK_OUT with workingMinutes', async () => {
    const token = generateTeacherQrToken();
    const checkInAt = new Date('2026-09-26T05:00:00.000Z');
    const later = new Date(checkInAt.getTime() + 95 * 60 * 1000);
    const existing = baseInclude({
      id: 'att-1',
      schoolId: schoolA,
      teacherId: teacherA.id,
      workDate: new Date('2026-09-26T00:00:00.000Z'),
      checkInAt,
      checkOutAt: null,
      source: TeacherAttendanceSource.QR,
    });
    const svc = new TeacherAttendanceService({
      teacherIdCard: {
        findUnique: async () => ({
          id: 'card-1',
          qrToken: token,
          schoolId: schoolA,
          isActive: true,
          revokedAt: null,
          teacher: teacherA,
        }),
      },
      school: { findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }) },
      teacherAttendance: {
        findUnique: async () => existing,
        update: async ({ data }: { data: Record<string, unknown> }) =>
          baseInclude({ ...existing, ...data }),
      },
    } as any);

    const result = await svc.punchFromQr({ qrToken: token }, admin as any, later);
    assert.equal(result.result, 'CHECK_OUT');
    assert.equal(result.workingMinutes, 95);
  });

  it('already checked-out teacher returns ALREADY_COMPLETED', async () => {
    const token = generateTeacherQrToken();
    const checkInAt = new Date('2026-09-26T05:00:00.000Z');
    const checkOutAt = new Date('2026-09-26T13:00:00.000Z');
    const existing = baseInclude({
      id: 'att-1',
      schoolId: schoolA,
      teacherId: teacherA.id,
      workDate: new Date('2026-09-26T00:00:00.000Z'),
      checkInAt,
      checkOutAt,
      source: TeacherAttendanceSource.QR,
    });
    const svc = new TeacherAttendanceService({
      teacherIdCard: {
        findUnique: async () => ({
          id: 'card-1',
          qrToken: token,
          schoolId: schoolA,
          isActive: true,
          revokedAt: null,
          teacher: teacherA,
        }),
      },
      school: { findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }) },
      teacherAttendance: { findUnique: async () => existing },
    } as any);

    const result = await svc.punchFromQr({ qrToken: token }, admin as any, new Date());
    assert.equal(result.result, 'ALREADY_COMPLETED');
    assert.equal(result.workingMinutes, 480);
  });

  it('revoked TeacherIdCard returns REVOKED_CARD', async () => {
    const token = generateTeacherQrToken();
    const svc = new TeacherAttendanceService({
      teacherIdCard: {
        findUnique: async () => ({
          id: 'card-1',
          qrToken: token,
          schoolId: schoolA,
          isActive: false,
          revokedAt: new Date(),
          teacher: teacherA,
        }),
      },
    } as any);
    const result = await svc.punchFromQr({ qrToken: token }, admin as any);
    assert.equal(result.result, 'REVOKED_CARD');
  });

  it('inactive teacher returns INACTIVE_TEACHER', async () => {
    const token = generateTeacherQrToken();
    const svc = new TeacherAttendanceService({
      teacherIdCard: {
        findUnique: async () => ({
          id: 'card-1',
          qrToken: token,
          schoolId: schoolA,
          isActive: true,
          revokedAt: null,
          teacher: { ...teacherA, status: 'INACTIVE' },
        }),
      },
    } as any);
    const result = await svc.punchFromQr({ qrToken: token }, admin as any);
    assert.equal(result.result, 'INACTIVE_TEACHER');
  });

  it('teacher card from another school returns INVALID_CARD', async () => {
    const token = generateTeacherQrToken();
    const svc = new TeacherAttendanceService({
      teacherIdCard: {
        findUnique: async () => ({
          id: 'card-1',
          qrToken: token,
          schoolId: schoolB,
          isActive: true,
          revokedAt: null,
          teacher: { ...teacherA, schoolId: schoolB },
        }),
      },
    } as any);
    const result = await svc.punchFromQr({ qrToken: token }, admin as any);
    assert.equal(result.result, 'INVALID_CARD');
  });

  it('TEACHER role cannot scan another teacher card', async () => {
    const token = generateTeacherQrToken();
    const svc = new TeacherAttendanceService({
      teacherIdCard: {
        findUnique: async () => ({
          id: 'card-1',
          qrToken: token,
          schoolId: schoolA,
          isActive: true,
          revokedAt: null,
          teacher: teacherB,
        }),
      },
    } as any);
    await assert.rejects(
      () => svc.punchFromQr({ qrToken: token }, teacherUser as any),
      ForbiddenException,
    );
  });

  it('TEACHER role can scan their own card', async () => {
    const token = generateTeacherQrToken();
    const now = new Date('2026-09-26T04:30:00.000Z');
    const svc = new TeacherAttendanceService({
      teacherIdCard: {
        findUnique: async () => ({
          id: 'card-1',
          qrToken: token,
          schoolId: schoolA,
          isActive: true,
          revokedAt: null,
          teacher: teacherA,
        }),
      },
      school: { findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }) },
      teacherAttendance: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) =>
          baseInclude({ id: 'att-1', ...data }),
      },
    } as any);
    const result = await svc.punchFromQr({ qrToken: token }, teacherUser as any, now);
    assert.equal(result.result, 'CHECK_IN');
  });

  it('SCHOOL_ADMIN can scan teacher cards in their school', async () => {
    const token = generateTeacherQrToken();
    const svc = new TeacherAttendanceService({
      teacherIdCard: {
        findUnique: async () => ({
          id: 'card-1',
          qrToken: token,
          schoolId: schoolA,
          isActive: true,
          revokedAt: null,
          teacher: teacherB,
        }),
      },
      school: { findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }) },
      teacherAttendance: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) =>
          baseInclude({ id: 'att-1', ...data }, teacherB),
      },
    } as any);
    const result = await svc.punchFromQr({ qrToken: token }, admin as any);
    assert.equal(result.result, 'CHECK_IN');
    assert.equal(result.teacher?.id, teacherB.id);
  });

  it('workDate respects Asia/Karachi near midnight UTC', async () => {
    const token = generateTeacherQrToken();
    // 2026-09-25 23:30 UTC = 2026-09-26 04:30 Asia/Karachi
    const now = new Date('2026-09-25T23:30:00.000Z');
    const created: { data?: Record<string, unknown> } = {};
    const svc = new TeacherAttendanceService({
      teacherIdCard: {
        findUnique: async () => ({
          id: 'card-1',
          qrToken: token,
          schoolId: schoolA,
          isActive: true,
          revokedAt: null,
          teacher: teacherA,
        }),
      },
      school: { findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }) },
      teacherAttendance: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.data = data;
          return baseInclude({ id: 'att-1', ...data });
        },
      },
    } as any);
    await svc.punchFromQr({ qrToken: token }, admin as any, now);
    assert.equal((created.data?.workDate as Date).toISOString(), '2026-09-26T00:00:00.000Z');
  });

  it('two different teachers can scan independently', async () => {
    const tokenA = generateTeacherQrToken();
    const tokenB = generateTeacherQrToken();
    const now = new Date('2026-09-26T05:00:00.000Z');
    const store = new Map<string, any>();

    const makeSvc = (token: string, teacher: typeof teacherA) =>
      new TeacherAttendanceService({
        teacherIdCard: {
          findUnique: async () => ({
            id: `card-${teacher.id}`,
            qrToken: token,
            schoolId: schoolA,
            isActive: true,
            revokedAt: null,
            teacher,
          }),
        },
        school: { findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }) },
        teacherAttendance: {
          findUnique: async ({ where }: any) =>
            store.get(where.schoolId_teacherId_workDate.teacherId) ?? null,
          create: async ({ data }: any) => {
            const row = baseInclude({ id: `att-${data.teacherId}`, ...data }, teacher);
            store.set(data.teacherId, row);
            return row;
          },
        },
      } as any);

    const a = await makeSvc(tokenA, teacherA).punchFromQr({ qrToken: tokenA }, admin as any, now);
    const b = await makeSvc(tokenB, teacherB).punchFromQr({ qrToken: tokenB }, admin as any, now);
    assert.equal(a.result, 'CHECK_IN');
    assert.equal(b.result, 'CHECK_IN');
    assert.equal(store.size, 2);
  });

  it('SUPER_ADMIN cannot use QR scan endpoint path', async () => {
    const token = generateTeacherQrToken();
    const svc = new TeacherAttendanceService({} as any);
    await assert.rejects(
      () =>
        svc.punchFromQr(
          { qrToken: token },
          { ...admin, role: UserRole.SUPER_ADMIN, schoolId: null } as any,
        ),
      /school staff|school context/i,
    );
  });
});
