import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateQrToken, isQrToken, normalizeScannedQr, QR_TOKEN_PREFIX } from './qr-token';

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
});
