import { randomBytes } from 'node:crypto';

export const QR_TOKEN_PREFIX = 'CC1.';

const TOKEN_BODY = /^[A-Za-z0-9_-]{32,64}$/;

export function generateQrToken(): string {
  return `${QR_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function normalizeScannedQr(raw: string): string | null {
  const token = raw.trim();
  if (!token.startsWith(QR_TOKEN_PREFIX)) return null;
  const body = token.slice(QR_TOKEN_PREFIX.length);
  if (!TOKEN_BODY.test(body)) return null;
  return token;
}

export function isQrToken(value: string): boolean {
  return normalizeScannedQr(value) !== null;
}
