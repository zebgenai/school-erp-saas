/**
 * End-to-end OTP authentication checks against a running API + database.
 * Does not print OTP values.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import {
  generateOtpCode,
  hashOtpCode,
  isValidOtpCode,
  maskEmail,
  otpCodesMatch,
  OTP_MAX_ATTEMPTS,
} from '../src/auth/otp.util';

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const prisma = new PrismaClient();
const API = process.env.API_URL || 'http://localhost:3000/api';
const pepper = process.env.OTP_PEPPER || process.env.JWT_SECRET || 'otp-pepper';
const EMAIL = `otp.e2e.${Date.now()}@clevercampus.test`;
const PASSWORD = 'OtpTest@123';

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function http(method: string, path: string, body?: any, token?: string) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, json };
}

async function main() {
  console.log('OTP util checks');
  const code = generateOtpCode();
  ok('CSPRNG OTP is 6 digits', isValidOtpCode(code));
  const id = crypto.randomUUID();
  const hash = hashOtpCode(pepper, id, code);
  ok('Hash is hex, not plaintext', hash !== code && /^[a-f0-9]{64}$/.test(hash));
  ok('Matching code verifies', otpCodesMatch(hash, hashOtpCode(pepper, id, code)));
  ok('Wrong code does not verify', !otpCodesMatch(hash, hashOtpCode(pepper, id, '000000')));
  ok('Email is masked', maskEmail('atif@school.com') === 'a***@school.com');

  console.log(`\nAPI checks against ${API}`);
  const health = await http('GET', '/health').catch(() => ({ status: 0, json: null }));
  if (health.status === 0) {
    throw new Error('API is not reachable. Start the backend first.');
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      name: 'OTP E2E',
      email: EMAIL,
      password: passwordHash,
      role: UserRole.TEACHER,
      status: UserStatus.ACTIVE,
    },
  });

  try {
    const wrong = await http('POST', '/auth/login', { email: EMAIL, password: 'WrongPass1' });
    ok('Wrong password does not issue tokens', !wrong.json?.accessToken && !wrong.json?.requiresOtp);
    ok('Wrong password returns 401', wrong.status === 401);
    const afterWrong = await prisma.loginOtpChallenge.count({ where: { userId: user.id, usedAt: null } });
    ok('Wrong password does not create OTP challenge', afterWrong === 0);

    const login = await http('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
    ok('Login does not return access token before OTP', !login.json?.accessToken && !login.json?.refreshToken);

    if (login.json?.requiresOtp && login.json?.challengeId) {
      ok('Correct password starts OTP challenge', login.status < 300 && typeof login.json.challengeId === 'string');
      ok('OTP is not in login response', !JSON.stringify(login.json).includes('"code"') && !/\b\d{6}\b/.test(JSON.stringify(login.json)));

      const challengeId = login.json.challengeId as string;
      const known = '482917';
      await prisma.loginOtpChallenge.update({
        where: { id: challengeId },
        data: { codeHash: hashOtpCode(pepper, challengeId, known) },
      });

      const bad = await http('POST', '/auth/verify-otp', { challengeId, code: '000000' });
      ok('Wrong OTP is rejected', bad.status >= 400 && !bad.json?.accessToken);

      const resendSoon = await http('POST', '/auth/resend-otp', { challengeId });
      ok('Resend before 60s is rejected', resendSoon.status === 429 || (resendSoon.status >= 400 && !resendSoon.json?.accessToken));

      const good = await http('POST', '/auth/verify-otp', { challengeId, code: known });
      ok('Correct OTP issues access + refresh tokens', !!good.json?.accessToken && !!good.json?.refreshToken);
      const used = await prisma.loginOtpChallenge.findUnique({ where: { id: challengeId } });
      ok('OTP is invalidated after success', !!used?.usedAt);

      const reuse = await http('POST', '/auth/verify-otp', { challengeId, code: known });
      ok('Used OTP is rejected', reuse.status >= 400 && !reuse.json?.accessToken);

      const me = await http('GET', '/auth/me', undefined, good.json.accessToken);
      ok('Access token can call /auth/me', me.status === 200);

      const loggedOut = await http('POST', '/auth/logout', { refreshToken: good.json.refreshToken });
      ok('Logout succeeds', loggedOut.status < 300);
      const refreshed = await http('POST', '/auth/refresh', { refreshToken: good.json.refreshToken });
      ok('Revoked refresh token is rejected', refreshed.status >= 400);
    } else {
      ok('Correct password does not issue tokens when email cannot be sent', !login.json?.accessToken);
      ok('SMTP missing returns a configuration error', login.status >= 400);
      const leftover = await prisma.loginOtpChallenge.count({ where: { userId: user.id, usedAt: null } });
      ok('Failed send does not leave an active challenge', leftover === 0);

      const challengeId = crypto.randomUUID();
      const known = '482917';
      await prisma.loginOtpChallenge.create({
        data: {
          id: challengeId,
          userId: user.id,
          codeHash: hashOtpCode(pepper, challengeId, known),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          lastSentAt: new Date(),
        },
      });
      const good = await http('POST', '/auth/verify-otp', { challengeId, code: known });
      ok('Planted OTP still issues tokens', !!good.json?.accessToken && !!good.json?.refreshToken);
      const reuse = await http('POST', '/auth/verify-otp', { challengeId, code: known });
      ok('Used OTP is rejected', reuse.status >= 400 && !reuse.json?.accessToken);
      if (good.json?.refreshToken) {
        await http('POST', '/auth/logout', { refreshToken: good.json.refreshToken });
        const refreshed = await http('POST', '/auth/refresh', { refreshToken: good.json.refreshToken });
        ok('Revoked refresh token is rejected', refreshed.status >= 400);
      }
    }

    const expiredId = crypto.randomUUID();
    await prisma.loginOtpChallenge.create({
      data: {
        id: expiredId,
        userId: user.id,
        codeHash: hashOtpCode(pepper, expiredId, '111111'),
        expiresAt: new Date(Date.now() - 1000),
        lastSentAt: new Date(Date.now() - 120_000),
      },
    });
    const expired = await http('POST', '/auth/verify-otp', { challengeId: expiredId, code: '111111' });
    ok('Expired OTP is rejected', expired.status >= 400 && !expired.json?.accessToken);
    const alias = await http('POST', '/auth/verify-login-otp', { challengeId: expiredId, code: '111111' });
    ok('verify-login-otp alias is wired', alias.status >= 400 && !alias.json?.accessToken);

    const attemptId = crypto.randomUUID();
    await prisma.loginOtpChallenge.create({
      data: {
        id: attemptId,
        userId: user.id,
        codeHash: hashOtpCode(pepper, attemptId, '222222'),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        lastSentAt: new Date(Date.now() - 120_000),
      },
    });
    let lastAttempt = { status: 0, json: {} as any };
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      lastAttempt = await http('POST', '/auth/verify-otp', { challengeId: attemptId, code: '000000' });
    }
    ok('Five failed attempts invalidate the OTP', lastAttempt.status >= 400);
    const afterFive = await prisma.loginOtpChallenge.findUnique({ where: { id: attemptId } });
    ok('Challenge marked used after max attempts', !!afterFive?.usedAt);
    const sixth = await http('POST', '/auth/verify-otp', { challengeId: attemptId, code: '222222' });
    ok('Correct code after lockout is rejected', sixth.status >= 400 && !sixth.json?.accessToken);

    const resendId = crypto.randomUUID();
    await prisma.loginOtpChallenge.create({
      data: {
        id: resendId,
        userId: user.id,
        codeHash: hashOtpCode(pepper, resendId, '333333'),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        lastSentAt: new Date(),
      },
    });
    const cooldown = await http('POST', '/auth/resend-otp', { challengeId: resendId });
    ok('Resend cooldown is enforced', cooldown.status === 429 || cooldown.status >= 400);

    await prisma.user.update({ where: { id: user.id }, data: { status: UserStatus.INACTIVE } });
    const inactive = await http('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
    ok('Inactive user cannot authenticate', inactive.status === 403 && !inactive.json?.accessToken);

    await prisma.user.update({
      where: { id: user.id },
      data: { status: UserStatus.ACTIVE, lockedUntil: new Date(Date.now() + 10 * 60 * 1000) },
    });
    const locked = await http('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
    ok('Locked user cannot authenticate', locked.status === 403 && !locked.json?.accessToken);

    const forgot = await http('POST', '/auth/forgot-password', { email: EMAIL });
    ok('Forgot password still accepts requests', forgot.status < 300 && !forgot.json?.accessToken);

    const anonMe = await http('GET', '/auth/me');
    ok('APIs reject unauthenticated access', anonMe.status === 401);
  } finally {
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.loginOtpChallenge.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
