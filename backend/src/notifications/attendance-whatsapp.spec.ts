import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { NotificationChannel, NotificationStatus } from '@prisma/client';

/**
 * Behavioral tests for AttendanceWhatsAppService enqueue rules.
 * Stubbed Prisma + Queue — no Redis required.
 */

describe('AttendanceWhatsAppService enqueue rules', () => {
  it('skips when school WhatsApp is disabled', async () => {
    const { AttendanceWhatsAppService } = await import('./attendance-whatsapp.service');
    const prisma: any = {
      school: {
        findUnique: mock.fn(async () => ({
          id: 'sch1',
          name: 'Demo',
          timezone: 'Asia/Karachi',
          whatsappNotificationsEnabled: false,
        })),
      },
      notificationLog: {
        findUnique: mock.fn(async () => null),
        create: mock.fn(async () => {
          throw new Error('should not create');
        }),
      },
      student: { findFirst: mock.fn(async () => null) },
    };
    const queue: any = { add: mock.fn(async () => null) };
    const svc = new AttendanceWhatsAppService(prisma, queue);
    await svc.enqueueAbsentNotification({
      schoolId: 'sch1',
      studentId: 'stu1',
      attendanceId: 'att1',
      attendanceDate: new Date('2026-09-20T00:00:00.000Z'),
    });
    assert.equal(prisma.notificationLog.create.mock.calls.length, 0);
    assert.equal(queue.add.mock.calls.length, 0);
  });

  it('does not create a duplicate when idempotency key exists', async () => {
    const { AttendanceWhatsAppService } = await import('./attendance-whatsapp.service');
    const prisma: any = {
      school: {
        findUnique: mock.fn(async () => ({
          id: 'sch1',
          name: 'Demo',
          timezone: 'Asia/Karachi',
          whatsappNotificationsEnabled: true,
        })),
      },
      notificationLog: {
        findUnique: mock.fn(async () => ({ id: 'existing' })),
        create: mock.fn(async () => {
          throw new Error('should not create');
        }),
      },
      student: { findFirst: mock.fn(async () => null) },
    };
    const queue: any = { add: mock.fn(async () => null) };
    const svc = new AttendanceWhatsAppService(prisma, queue);
    await svc.enqueueAbsentNotification({
      schoolId: 'sch1',
      studentId: 'stu1',
      attendanceId: 'att1',
      attendanceDate: new Date('2026-09-20T00:00:00.000Z'),
    });
    assert.equal(prisma.notificationLog.create.mock.calls.length, 0);
    assert.equal(queue.add.mock.calls.length, 0);
  });

  it('creates a SKIPPED log for missing phone and does not enqueue', async () => {
    const { AttendanceWhatsAppService } = await import('./attendance-whatsapp.service');
    const created: any[] = [];
    const prisma: any = {
      school: {
        findUnique: mock.fn(async () => ({
          id: 'sch1',
          name: 'Demo School',
          timezone: 'Asia/Karachi',
          whatsappNotificationsEnabled: true,
        })),
      },
      notificationLog: {
        findUnique: mock.fn(async () => null),
        create: mock.fn(async ({ data }: any) => {
          created.push(data);
          return { id: 'log1', ...data };
        }),
      },
      student: {
        findFirst: mock.fn(async () => ({
          id: 'stu1',
          fullName: 'Sara Student',
          fatherName: 'Father',
          whatsappNumber: null,
          guardianPhone: null,
          class: { name: '5' },
          section: { name: 'A' },
          parents: [],
        })),
      },
    };
    const queue: any = { add: mock.fn(async () => null) };
    const svc = new AttendanceWhatsAppService(prisma, queue);
    await svc.enqueueAbsentNotification({
      schoolId: 'sch1',
      studentId: 'stu1',
      attendanceId: 'att1',
      attendanceDate: new Date('2026-09-20T00:00:00.000Z'),
    });
    assert.equal(created.length, 1);
    assert.equal(created[0].status, NotificationStatus.SKIPPED);
    assert.equal(created[0].channel, NotificationChannel.WHATSAPP);
    assert.equal(queue.add.mock.calls.length, 0);
  });

  it('listForSchool always scopes by schoolId', async () => {
    const { AttendanceWhatsAppService } = await import('./attendance-whatsapp.service');
    let whereUsed: any = null;
    const prisma: any = {
      notificationLog: {
        findMany: mock.fn(async ({ where }: any) => {
          whereUsed = where;
          return [];
        }),
        count: mock.fn(async () => 0),
      },
    };
    const queue: any = { add: mock.fn(async () => null) };
    const svc = new AttendanceWhatsAppService(prisma, queue);
    await svc.listForSchool('school-a', { limit: 10 });
    assert.equal(whereUsed.schoolId, 'school-a');
    assert.equal(whereUsed.channel, NotificationChannel.WHATSAPP);
  });
});

describe('AttendanceWhatsApp enqueue never throws to callers', () => {
  it('swallows unexpected prisma errors', async () => {
    const { AttendanceWhatsAppService } = await import('./attendance-whatsapp.service');
    const prisma: any = {
      school: {
        findUnique: mock.fn(async () => {
          throw new Error('db down');
        }),
      },
    };
    const queue: any = { add: mock.fn(async () => null) };
    const svc = new AttendanceWhatsAppService(prisma, queue);
    await assert.doesNotReject(() =>
      svc.enqueueAbsentNotification({
        schoolId: 'sch1',
        studentId: 'stu1',
        attendanceId: 'att1',
        attendanceDate: new Date('2026-09-20T00:00:00.000Z'),
      }),
    );
  });
});
