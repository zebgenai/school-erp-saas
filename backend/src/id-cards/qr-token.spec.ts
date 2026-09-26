import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  generateQrToken,
  generateTeacherQrToken,
  isQrToken,
  isTeacherQrToken,
  normalizeScannedQr,
  normalizeScannedTeacherQr,
  QR_TEACHER_TOKEN_PREFIX,
  QR_TOKEN_PREFIX,
} from './qr-token';

describe('QR token', () => {
  it('generates cryptographically random unique tokens with a campus prefix', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const token = generateQrToken();
      assert.equal(token.startsWith(QR_TOKEN_PREFIX), true);
      assert.equal(isQrToken(token), true);
      tokens.add(token);
    }
    assert.equal(tokens.size, 80);
  });

  it('rejects raw student ids, empty values, and tokens from other formats', () => {
    assert.equal(normalizeScannedQr(''), null);
    assert.equal(normalizeScannedQr('student-uuid'), null);
    assert.equal(normalizeScannedQr('CC1.short'), null);
    assert.equal(normalizeScannedQr('CC1.%%%'), null);
  });

  it('student normalize never accepts teacher TCC1 tokens', () => {
    const teacherToken = generateTeacherQrToken();
    assert.equal(normalizeScannedQr(teacherToken), null);
    assert.equal(isQrToken(teacherToken), false);
  });
});

describe('Teacher QR token', () => {
  it('generates unique TCC1 tokens distinguishable from student CC1 tokens', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const token = generateTeacherQrToken();
      assert.equal(token.startsWith(QR_TEACHER_TOKEN_PREFIX), true);
      assert.equal(token.startsWith(QR_TOKEN_PREFIX), false);
      assert.equal(isTeacherQrToken(token), true);
      assert.equal(isQrToken(token), false);
      tokens.add(token);
    }
    assert.equal(tokens.size, 40);
  });

  it('rejects student tokens and garbage for teacher normalize', () => {
    assert.equal(normalizeScannedTeacherQr(generateQrToken()), null);
    assert.equal(normalizeScannedTeacherQr(''), null);
    assert.equal(normalizeScannedTeacherQr('TCC1.short'), null);
    assert.equal(normalizeScannedTeacherQr('teacher-uuid'), null);
  });
});
