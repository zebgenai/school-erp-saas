import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AttendanceStatus } from '@prisma/client';
import { resolveQrAttendanceStatus } from './qr-status';

describe('QR attendance timing', () => {
  it('marks PRESENT when no cutoff times are configured', () => {
    assert.equal(resolveQrAttendanceStatus({}), AttendanceStatus.PRESENT);
  });

  it('uses school timezone (Asia/Karachi), not server-local hours', () => {
    // 07:50 PKT = 02:50 UTC; 08:10 PKT = 03:10 UTC
    const morningUtc = new Date('2026-09-17T02:50:00.000Z');
    const lateUtc = new Date('2026-09-17T03:10:00.000Z');
    assert.equal(
      resolveQrAttendanceStatus({
        now: morningUtc,
        timeZone: 'Asia/Karachi',
        presentUntil: '08:00',
        lateUntil: '08:15',
      }),
      AttendanceStatus.PRESENT,
    );
    assert.equal(
      resolveQrAttendanceStatus({
        now: lateUtc,
        timeZone: 'Asia/Karachi',
        presentUntil: '08:00',
        lateUntil: '08:15',
      }),
      AttendanceStatus.LATE,
    );
  });

  it('marks PRESENT inside the present window', () => {
    assert.equal(
      resolveQrAttendanceStatus({
        minutesOfDay: 7 * 60 + 50,
        presentUntil: '08:00',
        lateUntil: '08:15',
      }),
      AttendanceStatus.PRESENT,
    );
  });

  it('marks LATE inside the late window when presentUntil is also set', () => {
    assert.equal(
      resolveQrAttendanceStatus({
        minutesOfDay: 8 * 60 + 10,
        presentUntil: '08:00',
        lateUntil: '08:15',
      }),
      AttendanceStatus.LATE,
    );
  });

  it('lateUntil-only: on or before lateUntil is PRESENT', () => {
    assert.equal(
      resolveQrAttendanceStatus({
        minutesOfDay: 8 * 60,
        lateUntil: '08:15',
      }),
      AttendanceStatus.PRESENT,
    );
    assert.equal(
      resolveQrAttendanceStatus({
        minutesOfDay: 8 * 60 + 15,
        lateUntil: '08:15',
      }),
      AttendanceStatus.PRESENT,
    );
  });

  it('lateUntil-only: after lateUntil is LATE (never ABSENT)', () => {
    assert.equal(
      resolveQrAttendanceStatus({
        minutesOfDay: 8 * 60 + 16,
        lateUntil: '08:15',
      }),
      AttendanceStatus.LATE,
    );
  });

  it('does not mark ABSENT from a QR scan after the late window', () => {
    // 10:00 PKT = 05:00 UTC
    const after = new Date('2026-09-17T05:00:00.000Z');
    assert.equal(
      resolveQrAttendanceStatus({
        now: after,
        timeZone: 'Asia/Karachi',
        presentUntil: '08:00',
        lateUntil: '08:15',
      }),
      AttendanceStatus.LATE,
    );
  });

  it('still supports explicit minutesOfDay overrides for unit tests', () => {
    assert.equal(
      resolveQrAttendanceStatus({
        minutesOfDay: 7 * 60 + 50,
        presentUntil: '08:00',
        lateUntil: '08:15',
      }),
      AttendanceStatus.PRESENT,
    );
  });
});
