import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_SCHOOL_TIMEZONE,
  localDateString,
  localMinutesOfDay,
  resolveSchoolTimeZone,
} from './school-time';

describe('school-time helpers', () => {
  it('defaults to Asia/Karachi and rejects invalid zones', () => {
    assert.equal(resolveSchoolTimeZone(undefined), DEFAULT_SCHOOL_TIMEZONE);
    assert.equal(resolveSchoolTimeZone(''), DEFAULT_SCHOOL_TIMEZONE);
    assert.equal(resolveSchoolTimeZone('Not/AZone'), DEFAULT_SCHOOL_TIMEZONE);
    assert.equal(resolveSchoolTimeZone('Asia/Karachi'), 'Asia/Karachi');
  });

  it('computes attendance date in Asia/Karachi, not UTC', () => {
    // 22:30 UTC on Sep 16 = 03:30 PKT on Sep 17
    const nearUtcMidnight = new Date('2026-09-16T22:30:00.000Z');
    assert.equal(localDateString(nearUtcMidnight, 'UTC'), '2026-09-16');
    assert.equal(localDateString(nearUtcMidnight, 'Asia/Karachi'), '2026-09-17');
  });

  it('computes local minutes of day in Asia/Karachi, not server-local', () => {
    // 03:10 UTC = 08:10 PKT
    const utc = new Date('2026-09-17T03:10:00.000Z');
    assert.equal(localMinutesOfDay(utc, 'UTC'), 3 * 60 + 10);
    assert.equal(localMinutesOfDay(utc, 'Asia/Karachi'), 8 * 60 + 10);
  });
});
