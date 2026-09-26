import { randomBytes } from 'node:crypto';

/** Student ID-card QR prefix. Do not change — attendance scanners depend on this. */
export const QR_TOKEN_PREFIX = 'CC1.';

/**
 * Teacher ID-card QR prefix.
 * Chosen so it does NOT `startsWith('CC1.')`, preserving the student scanner contract.
 */
export const QR_TEACHER_TOKEN_PREFIX = 'TCC1.';

const TOKEN_BODY = /^[A-Za-z0-9_-]{32,64}$/;

export function generateQrToken(): string {
  return `${QR_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function generateTeacherQrToken(): string {
  return `${QR_TEACHER_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function normalizeScannedQr(raw: string): string | null {
  const token = raw.trim();
  if (!token.startsWith(QR_TOKEN_PREFIX)) return null;
  const body = token.slice(QR_TOKEN_PREFIX.length);
  if (!TOKEN_BODY.test(body)) return null;
  return token;
}

export function normalizeScannedTeacherQr(raw: string): string | null {
  const token = raw.trim();
  if (!token.startsWith(QR_TEACHER_TOKEN_PREFIX)) return null;
  const body = token.slice(QR_TEACHER_TOKEN_PREFIX.length);
  if (!TOKEN_BODY.test(body)) return null;
  return token;
}

export function isQrToken(value: string): boolean {
  return normalizeScannedQr(value) !== null;
}

export function isTeacherQrToken(value: string): boolean {
  return normalizeScannedTeacherQr(value) !== null;
}
