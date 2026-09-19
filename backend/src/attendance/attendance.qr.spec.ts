import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AttendanceStatus, UserRole } from '@prisma/client';
import { AttendanceService, QR_SCAN_REMARKS } from './attendance.service';
import { generateQrToken } from '../id-cards/qr-token';

const schoolA = 'school-a';
const schoolB = 'school-b';
const studentA = {
  id: 'stu-a',
  schoolId: schoolA,
  fullName: 'Ali Khan',
  admissionNo: 'ADM-01',
  status: 'ACTIVE',
  classId: 'class-1',
  sectionId: 'sec-1',
};

const teacher = {
  id: 'user-1',
  email: 'teacher@test',
  name: 'Teacher',
  role: UserRole.TEACHER,
  schoolId: schoolA,
};

function serviceWith(prisma: Record<string, unknown>) {
  return new AttendanceService(prisma as any, { dispatch: () => undefined } as any);
}

describe('QR attendance scan', () => {
  it('creates PRESENT attendance from a school-scoped active card', async () => {
    const token = generateQrToken();
    const created: { data?: Record<string, unknown> } = {};
    const svc = serviceWith({
      studentIdCard: {
        findUnique: async () => ({
          qrToken: token,
          schoolId: schoolA,
          isActive: true,
          revokedAt: null,
          student: studentA,
        }),
      },
      studentAttendance: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.data = data;
          return { id: 'att-1', ...data };
        },
      },
      school: {
        findUnique: async () => ({
          id: schoolA,
          timezone: 'Asia/Karachi',
          attendancePresentUntil: null,
          attendanceLateUntil: null,
        }),
      },
    });

    const result = await svc.markFromQrScan({ token }, teacher as any);
    assert.equal(result.result, 'SUCCESS');
    assert.match(String(result.message), /Ali Khan.*Present/i);
    assert.equal(created.data?.studentId, studentA.id);
    assert.equal(created.data?.schoolId, schoolA);
    assert.equal(created.data?.status, AttendanceStatus.PRESENT);
    assert.equal(created.data?.remarks, QR_SCAN_REMARKS);
  });

  it('stores attendance date in Asia/Karachi, not UTC', async () => {
    const token = generateQrToken();
    const created: { data?: Record<string, unknown> } = {};
    const svc = serviceWith({
      studentIdCard: {
        findUnique: async () => ({
          qrToken: token,
          schoolId: schoolA,
          isActive: true,
          revokedAt: null,
          student: studentA,
        }),
      },
      studentAttendance: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.data = data;
          return { id: 'att-1', ...data };
        },
      },
      school: {
        findUnique: async () => ({
          id: schoolA,
          timezone: 'Asia/Karachi',
          attendancePresentUntil: null,
          attendanceLateUntil: null,
        }),
      },
    });

    // 22:30 UTC Sep 16 = 03:30 PKT Sep 17
    await svc.markFromQrScan({ token }, teacher as any, new Date('2026-09-16T22:30:00.000Z'));
    const date = created.data?.date as Date;
    assert.ok(date instanceof Date);
    assert.equal(date.toISOString().slice(0, 10), '2026-09-17');
  });

  it('applies present/late cutoffs in school timezone', async () => {
    const token = generateQrToken();
    const created: { data?: Record<string, unknown> } = {};
    const svc = serviceWith({
      studentIdCard: {
        findUnique: async () => ({
          qrToken: token,
          schoolId: schoolA,
          isActive: true,
          revokedAt: null,
          student: studentA,
        }),
      },
      studentAttendance: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.data = data;
          return { id: 'att-1', ...data };
        },
      },
      school: {
        findUnique: async () => ({
          id: schoolA,
          timezone: 'Asia/Karachi',
          attendancePresentUntil: '08:00',
          attendanceLateUntil: '08:15',
        }),
      },
    });

    // 08:10 PKT = 03:10 UTC → LATE
    await svc.markFromQrScan({ token }, teacher as any, new Date('2026-09-17T03:10:00.000Z'));
    assert.equal(created.data?.status, AttendanceStatus.LATE);
  });

  it('never resolves a card from another school', async () => {
    const token = generateQrToken();
    const svc = serviceWith({
      studentIdCard: {
        findUnique: async () => ({
          qrToken: token,
          schoolId: schoolB,
          isActive: true,
          revokedAt: null,
          student: { ...studentA, schoolId: schoolB },
        }),
      },
    });
    const result = await svc.markFromQrScan({ token }, teacher as any);
    assert.equal(result.result, 'INVALID');
  });

  it('rejects a revoked card', async () => {
    const token = generateQrToken();
    const svc = serviceWith({
      studentIdCard: {
        findUnique: async () => ({
          qrToken: token,
          schoolId: schoolA,
          isActive: false,
          revokedAt: new Date(),
          student: studentA,
        }),
      },
    });
    const result = await svc.markFromQrScan({ token }, teacher as any);
    assert.equal(result.result, 'REVOKED');
  });

  it('rejects an inactive student', async () => {
    const token = generateQrToken();
    const svc = serviceWith({
      studentIdCard: {
        findUnique: async () => ({
          qrToken: token,
          schoolId: schoolA,
          isActive: true,
          revokedAt: null,
          student: { ...studentA, status: 'INACTIVE' },
        }),
      },
    });
    const result = await svc.markFromQrScan({ token }, teacher as any);
    assert.equal(result.result, 'INACTIVE_STUDENT');
  });

  it('does not create a second row or flip PRESENT on duplicate scan', async () => {
    const token = generateQrToken();
    let createCalls = 0;
    let updateCalls = 0;
    const svc = serviceWith({
      studentIdCard: {
        findUnique: async () => ({
          qrToken: token,
          schoolId: schoolA,
          isActive: true,
          revokedAt: null,
          student: studentA,
        }),
      },
      studentAttendance: {
        findUnique: async () => ({
          id: 'att-1',
          status: AttendanceStatus.PRESENT,
          schoolId: schoolA,
          studentId: studentA.id,
        }),
        create: async () => {
          createCalls += 1;
          return {};
        },
        update: async () => {
          updateCalls += 1;
          return {};
        },
      },
      school: {
        findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }),
      },
    });
    const result = await svc.markFromQrScan({ token }, teacher as any);
    assert.equal(result.result, 'DUPLICATE');
    assert.equal(createCalls, 0);
    assert.equal(updateCalls, 0);
  });

  it('does not let QR override a manual ABSENT record', async () => {
    const token = generateQrToken();
    let updateCalls = 0;
    const svc = serviceWith({
      studentIdCard: {
        findUnique: async () => ({
          qrToken: token,
          schoolId: schoolA,
          isActive: true,
          revokedAt: null,
          student: studentA,
        }),
      },
      studentAttendance: {
        findUnique: async () => ({ id: 'att-1', status: AttendanceStatus.ABSENT }),
        update: async () => {
          updateCalls += 1;
          return {};
        },
      },
      school: {
        findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }),
      },
    });
    const result = await svc.markFromQrScan({ token }, teacher as any);
    assert.equal(result.result, 'DUPLICATE');
    assert.equal(updateCalls, 0);
  });

  it('rejects SUPER_ADMIN QR scans (school-staff only)', async () => {
    const token = generateQrToken();
    const svc = serviceWith({
      studentIdCard: {
        findUnique: async () => ({
          qrToken: token,
          schoolId: schoolA,
          isActive: true,
          revokedAt: null,
          student: studentA,
        }),
      },
      school: { findUnique: async () => ({ id: schoolA, timezone: 'Asia/Karachi' }) },
    });
    const superAdmin = {
      id: 'sa-1',
      email: 'sa@test',
      name: 'Super',
      role: UserRole.SUPER_ADMIN,
      schoolId: null,
    };
    await assert.rejects(
      () => svc.markFromQrScan({ token }, superAdmin as any),
      /school staff|school context/i,
    );
  });
});

describe('manual attendance still upserts', () => {
  it('updates an existing daily row instead of inserting a duplicate', async () => {
    let updated = false;
    const svc = serviceWith({
      student: {
        findUnique: async () => studentA,
      },
      studentAttendance: {
        findUnique: async () => ({ id: 'att-1', status: AttendanceStatus.PRESENT }),
        update: async ({ data }: { data: { status: AttendanceStatus } }) => {
          updated = true;
          return {
            id: 'att-1',
            ...data,
            student: studentA,
            class: null,
            section: null,
            markedBy: null,
          };
        },
      },
    });
    const row = await svc.mark(
      { studentId: studentA.id, date: '2026-09-17', status: AttendanceStatus.ABSENT },
      teacher as any,
    );
    assert.equal(updated, true);
    assert.equal(row.status, AttendanceStatus.ABSENT);
  });
});
