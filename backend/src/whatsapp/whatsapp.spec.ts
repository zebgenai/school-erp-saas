import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeE164Phone } from './phone.util';
import {
  ATTENDANCE_ABSENT_TYPE,
  attendanceAbsentIdempotencyKey,
  buildAttendanceAbsentMessage,
} from './whatsapp.types';
import { attendanceWhatsAppBackoffStrategy } from '../notifications/attendance-whatsapp.processor';

describe('normalizeE164Phone', () => {
  it('normalizes Pakistani local mobiles to E.164', () => {
    assert.equal(normalizeE164Phone('03001234567'), '+923001234567');
  });

  it('keeps already-E.164 numbers', () => {
    assert.equal(normalizeE164Phone('+923001234567'), '+923001234567');
  });

  it('accepts country code without plus', () => {
    assert.equal(normalizeE164Phone('923001234567'), '+923001234567');
  });

  it('returns null for missing / invalid values', () => {
    assert.equal(normalizeE164Phone(null), null);
    assert.equal(normalizeE164Phone(''), null);
    assert.equal(normalizeE164Phone('123'), null);
    assert.equal(normalizeE164Phone('not-a-phone'), null);
  });
});

describe('attendanceAbsentIdempotencyKey', () => {
  it('is deterministic for school+student+date+type', () => {
    const a = attendanceAbsentIdempotencyKey('sch1', 'stu1', '2026-09-20');
    const b = attendanceAbsentIdempotencyKey('sch1', 'stu1', '2026-09-20');
    assert.equal(a, b);
    assert.match(a, new RegExp(ATTENDANCE_ABSENT_TYPE));
    assert.match(a, /WHATSAPP$/);
  });

  it('differs across students and dates', () => {
    const base = attendanceAbsentIdempotencyKey('sch1', 'stu1', '2026-09-20');
    assert.notEqual(base, attendanceAbsentIdempotencyKey('sch1', 'stu2', '2026-09-20'));
    assert.notEqual(base, attendanceAbsentIdempotencyKey('sch1', 'stu1', '2026-09-21'));
    assert.notEqual(base, attendanceAbsentIdempotencyKey('sch2', 'stu1', '2026-09-20'));
  });
});

describe('buildAttendanceAbsentMessage', () => {
  it('includes parent, student, class, date, and school', () => {
    const text = buildAttendanceAbsentMessage({
      recipient: '+923001234567',
      parentName: 'Ali Parent',
      studentName: 'Sara Student',
      className: 'Class 5 A',
      date: '2026-09-20',
      schoolName: 'Demo School',
    });
    assert.match(text, /Ali Parent/);
    assert.match(text, /Sara Student/);
    assert.match(text, /Class 5 A/);
    assert.match(text, /2026-09-20/);
    assert.match(text, /Demo School/);
  });
});

describe('attendanceWhatsAppBackoffStrategy', () => {
  it('uses ~30s then ~2m', () => {
    assert.equal(attendanceWhatsAppBackoffStrategy(1), 30_000);
    assert.equal(attendanceWhatsAppBackoffStrategy(2), 120_000);
    assert.equal(attendanceWhatsAppBackoffStrategy(3), 120_000);
  });
});
