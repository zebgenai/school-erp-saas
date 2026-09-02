import * as crypto from 'crypto';

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_MAX_PER_USER_HOUR = 8;
export const OTP_MAX_PER_IP_HOUR = 20;

export function generateOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(OTP_LENGTH, '0');
}

export function hashOtpCode(pepper: string, challengeId: string, code: string): string {
  return crypto.createHmac('sha256', pepper).update(`${challengeId}:${code}`).digest('hex');
}

export function otpCodesMatch(expectedHash: string, candidateHash: string): boolean {
  try {
    const a = Buffer.from(expectedHash, 'hex');
    const b = Buffer.from(candidateHash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

export function isValidOtpCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}
