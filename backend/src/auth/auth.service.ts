import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { SchoolAuditService } from '../audit-logs/school-audit.service';
import { assertStrongPassword } from '../common/validators/password.validator';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEngineService } from '../notifications/notification-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesService } from '../roles/roles.service';
import { isTenantLoginRejected } from '../common/tenant/tenant-login';
import type { TenantSchool } from '../common/tenant/tenant.types';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto-login';
import {
  generateOtpCode,
  hashOtpCode,
  isValidOtpCode,
  maskEmail,
  otpCodesMatch,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_PER_IP_HOUR,
  OTP_MAX_PER_USER_HOUR,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
} from './otp.util';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private schoolAudit: SchoolAuditService,
    private auditLogs: AuditLogsService,
    private rolesService: RolesService,
    private notifications: NotificationsService,
    private notificationEngine: NotificationEngineService,
  ) {}

  private static readonly MAX_ATTEMPTS = 5;
  private static readonly LOCKOUT_MINUTES = 15;

  async login(
    dto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
    tenantSchool?: TenantSchool | null,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { school: true },
    });

    if (isTenantLoginRejected(user, tenantSchool?.id) || !user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('User account is inactive');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new ForbiddenException(
        `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute(s).`,
      );
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      const attempts = (user.loginAttempts ?? 0) + 1;
      const shouldLock = attempts >= AuthService.MAX_ATTEMPTS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          loginAttempts: attempts,
          lockedUntil: shouldLock
            ? new Date(Date.now() + AuthService.LOCKOUT_MINUTES * 60 * 1000)
            : null,
        },
      });

      if (user.schoolId) {
        await this.schoolAudit.log({
          schoolId: user.schoolId,
          userId: user.id,
          action: shouldLock ? 'LOGIN_LOCKED' : 'LOGIN_FAILED',
          entity: 'User',
          entityId: user.id,
          ipAddress,
          details: { email: user.email, attempts },
        });
      }

      if (shouldLock) {
        throw new ForbiddenException(
          `Too many failed login attempts. Account locked for ${AuthService.LOCKOUT_MINUTES} minutes.`,
        );
      }
      throw new UnauthorizedException('Invalid email or password');
    }

    if (await this.notifications.isLoginEmailConfigured()) {
      return this.startOtpChallenge(user, ipAddress, userAgent);
    }

    return this.completeLogin(user, ipAddress, userAgent, 'password');
  }

  async verifyLoginOtp(
    challengeId: string,
    code: string,
    ipAddress?: string,
    userAgent?: string,
    tenantSchool?: TenantSchool | null,
  ) {
    const trimmed = String(code || '').trim();
    if (!isValidOtpCode(trimmed)) {
      throw new BadRequestException('Enter the 6-digit code from your email');
    }

    const challenge = await this.prisma.loginOtpChallenge.findUnique({
      where: { id: challengeId },
      include: { user: { include: { school: true } } },
    });
    if (!challenge) {
      throw new BadRequestException('This verification session is invalid. Please sign in again.');
    }
    if (challenge.usedAt) {
      throw new BadRequestException('This code is no longer valid. Please sign in again.');
    }
    if (challenge.expiresAt < new Date()) {
      await this.prisma.loginOtpChallenge.update({
        where: { id: challenge.id },
        data: { usedAt: new Date() },
      });
      await this.logOtpEvent('LOGIN_OTP_EXPIRED', challenge.user, ipAddress, { challengeId });
      throw new BadRequestException('This code has expired. Request a new one.');
    }

    this.assertUserCanAuthenticate(challenge.user);
    this.assertLoginTenant(challenge.user, tenantSchool);

    const candidate = hashOtpCode(this.otpPepper(), challenge.id, trimmed);
    const maxAttempts = challenge.maxAttempts || OTP_MAX_ATTEMPTS;
    if (!otpCodesMatch(challenge.codeHash, candidate)) {
      const attempts = challenge.attempts + 1;
      const invalidate = attempts >= maxAttempts;
      await this.prisma.loginOtpChallenge.update({
        where: { id: challenge.id },
        data: { attempts, ...(invalidate ? { usedAt: new Date() } : {}) },
      });
      await this.logOtpEvent('LOGIN_OTP_VERIFY_FAILURE', challenge.user, ipAddress, {
        challengeId,
        attempts,
        invalidated: invalidate,
      });
      if (invalidate) {
        throw new BadRequestException('Too many incorrect attempts. Please sign in again.');
      }
      throw new BadRequestException(
        `Incorrect verification code. ${maxAttempts - attempts} attempt(s) remaining.`,
      );
    }

    await this.prisma.loginOtpChallenge.update({
      where: { id: challenge.id },
      data: { usedAt: new Date() },
    });

    await this.logOtpEvent('LOGIN_OTP_VERIFY_SUCCESS', challenge.user, ipAddress, { challengeId });
    return this.completeLogin(challenge.user, ipAddress, userAgent, 'email_otp');
  }

  async resendLoginOtp(
    challengeId: string,
    ipAddress?: string,
    userAgent?: string,
    tenantSchool?: TenantSchool | null,
  ) {
    const challenge = await this.prisma.loginOtpChallenge.findUnique({
      where: { id: challengeId },
      include: { user: true },
    });
    if (!challenge || challenge.usedAt) {
      throw new BadRequestException('This verification session is invalid. Please sign in again.');
    }

    this.assertUserCanAuthenticate(challenge.user);
    this.assertLoginTenant(challenge.user, tenantSchool);

    const waitMs = OTP_RESEND_COOLDOWN_MS - (Date.now() - challenge.lastSentAt.getTime());
    if (waitMs > 0) {
      throw new HttpException(
        `Please wait ${Math.ceil(waitMs / 1000)} second(s) before requesting a new code.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.assertOtpSendBudget(challenge.userId, ipAddress);

    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    await this.prisma.loginOtpChallenge.update({
      where: { id: challenge.id },
      data: {
        codeHash: hashOtpCode(this.otpPepper(), challenge.id, code),
        expiresAt,
        attempts: 0,
        lastSentAt: new Date(),
        ipAddress: ipAddress ?? challenge.ipAddress,
        userAgent: userAgent ?? challenge.userAgent,
      },
    });

    await this.logOtpEvent('LOGIN_OTP_RESEND', challenge.user, ipAddress, { challengeId: challenge.id });
    await this.dispatchOtpEmail(challenge.user, code);
    await this.logOtpEvent('LOGIN_OTP_SENT', challenge.user, ipAddress, { challengeId: challenge.id, resend: true });

    return {
      requiresOtp: true,
      challengeId: challenge.id,
      email: maskEmail(challenge.user.email),
      expiresAt: expiresAt.toISOString(),
      resendAvailableAt: new Date(Date.now() + OTP_RESEND_COOLDOWN_MS).toISOString(),
      message: 'A new verification code was sent to your email.',
    };
  }

  async refresh(refreshToken: string, ipAddress?: string, tenantSchool?: TenantSchool | null) {
    const hash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: { user: { include: { school: true } } },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = stored.user;
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('User account is inactive');
    }
    this.assertLoginTenant(user, tenantSchool);

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(user, ipAddress);
  }

  async logout(refreshToken: string) {
    const hash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: 'Logged out' };
  }

  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: 'All sessions revoked' };
  }

  async requestPasswordReset(email: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return { message: 'If this email exists, a reset link has been sent.' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: token,
        passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    if (user.schoolId) {
      await this.schoolAudit.log({
        schoolId: user.schoolId,
        userId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        entity: 'User',
        entityId: user.id,
        ipAddress,
      });
    }

    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:8080';
    const resetUrl = `${frontendUrl.replace(/\/$/, '')}/reset-password?token=${token}`;
    await this.notifications.sendPasswordResetEmail(user.email, resetUrl);

    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitPasswordReset(user.id, user.email),
    );

    if (this.config.get('NODE_ENV') !== 'production') {
      this.loggerWarnDev(`Password reset link for ${email}: ${resetUrl}`);
    }

    return { message: 'If this email exists, a reset link has been sent.' };
  }

  async resetPassword(token: string, newPassword: string, ipAddress?: string) {
    assertStrongPassword(newPassword);

    const user = await this.prisma.user.findUnique({ where: { passwordResetToken: token } });
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        loginAttempts: 0,
        lockedUntil: null,
        forcePasswordChange: false,
      },
    });

    await this.revokeAllRefreshTokens(user.id);

    if (user.schoolId) {
      await this.schoolAudit.log({
        schoolId: user.schoolId,
        userId: user.id,
        action: 'PASSWORD_RESET_COMPLETED',
        entity: 'User',
        entityId: user.id,
        ipAddress,
      });
    }

    return { message: 'Password reset successfully' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    assertStrongPassword(dto.newPassword);

    const hashed = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed, forcePasswordChange: false },
    });

    await this.revokeAllRefreshTokens(userId);

    if (user.schoolId) {
      await this.schoolAudit.log({
        schoolId: user.schoolId,
        userId,
        action: 'PASSWORD_CHANGED',
        entity: 'User',
        entityId: userId,
        ipAddress,
      });
    }

    return { message: 'Password updated successfully' };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { school: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const permissions = await this.rolesService.getEffectivePermissions({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      schoolId: user.schoolId,
    });

    return { ...this.safeUser(user), permissions };
  }

  private async issueTokens(user: any, ipAddress?: string, userAgent?: string) {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      schoolId: user.schoolId,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = crypto.randomBytes(48).toString('hex');
    const refreshDays = parseInt(this.config.get<string>('JWT_REFRESH_EXPIRES_DAYS') || '7', 10);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000),
        ipAddress,
        userAgent,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN') || '15m',
      user: this.safeUser(user),
    };
  }

  private hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async revokeAllRefreshTokens(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private safeUser(user: any) {
    const { password, passwordResetToken, passwordResetExpiresAt, ...safe } = user;
    return safe;
  }

  private async completeLogin(
    user: any,
    ipAddress: string | undefined,
    userAgent: string | undefined,
    method: 'email_otp' | 'password',
  ) {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    if (user.schoolId) {
      await this.schoolAudit.log({
        schoolId: user.schoolId,
        userId: user.id,
        action: 'LOGIN_SUCCESS',
        entity: 'User',
        entityId: user.id,
        ipAddress,
        details: { email: user.email, method },
      });
    }

    const tokens = await this.issueTokens(user, ipAddress, userAgent);
    return method === 'password' ? { ...tokens, otpSkipped: true } : tokens;
  }

  private otpPepper(): string {
    return this.config.get<string>('OTP_PEPPER') || this.config.get<string>('JWT_SECRET') || 'otp-pepper';
  }

  private assertUserCanAuthenticate(user: { status: UserStatus; lockedUntil: Date | null }) {
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('User account is inactive');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new ForbiddenException(
        `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute(s).`,
      );
    }
  }

  private assertLoginTenant(
    user: { role: UserRole; schoolId?: string | null },
    tenantSchool?: TenantSchool | null,
  ) {
    if (isTenantLoginRejected(user, tenantSchool?.id)) {
      throw new UnauthorizedException('Invalid email or password');
    }
  }

  private async assertOtpSendBudget(userId: string, ipAddress?: string) {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const userCount = await this.prisma.loginOtpChallenge.count({
      where: { userId, createdAt: { gte: since } },
    });
    if (userCount >= OTP_MAX_PER_USER_HOUR) {
      throw new HttpException(
        'Too many verification emails for this account. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (ipAddress) {
      const ipCount = await this.prisma.loginOtpChallenge.count({
        where: { ipAddress, createdAt: { gte: since } },
      });
      if (ipCount >= OTP_MAX_PER_IP_HOUR) {
        throw new HttpException(
          'Too many verification emails from this network. Try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  private async startOtpChallenge(user: any, ipAddress?: string, userAgent?: string) {
    await this.assertOtpSendBudget(user.id, ipAddress);

    await this.prisma.loginOtpChallenge.updateMany({
      where: { userId: user.id, usedAt: null, purpose: 'LOGIN' },
      data: { usedAt: new Date() },
    });

    const id = crypto.randomUUID();
    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.prisma.loginOtpChallenge.create({
      data: {
        id,
        userId: user.id,
        purpose: 'LOGIN',
        codeHash: hashOtpCode(this.otpPepper(), id, code),
        expiresAt,
        maxAttempts: OTP_MAX_ATTEMPTS,
        lastSentAt: new Date(),
        ipAddress: ipAddress || null,
        userAgent: userAgent ? userAgent.slice(0, 512) : null,
      },
    });

    await this.logOtpEvent('LOGIN_OTP_GENERATED', user, ipAddress, { challengeId: id });

    try {
      await this.dispatchOtpEmail(user, code);
      await this.logOtpEvent('LOGIN_OTP_SENT', user, ipAddress, { challengeId: id });
    } catch (err) {
      await this.prisma.loginOtpChallenge.update({
        where: { id },
        data: { usedAt: new Date() },
      });
      throw err;
    }

    return {
      requiresOtp: true,
      challengeId: id,
      email: maskEmail(user.email),
      expiresAt: expiresAt.toISOString(),
      resendAvailableAt: new Date(Date.now() + OTP_RESEND_COOLDOWN_MS).toISOString(),
      message: 'We sent a 6-digit verification code to your email.',
    };
  }

  private async dispatchOtpEmail(user: { name: string; email: string }, code: string) {
    const appName =
      (await this.prisma.platformSetting.findUnique({ where: { key: 'company_name' } }))?.value ||
      'Clever Campus';
    const sent = await this.notifications.sendLoginOtpEmail({
      to: user.email,
      recipientName: user.name,
      code,
      expiryMinutes: Math.round(OTP_TTL_MS / 60000),
      appName,
    });
    if (!sent.success) {
      if (sent.skipped) {
        throw new BadRequestException(
          'Email delivery is not configured. Add EMAIL_API_KEY or RESEND_API_KEY in backend/.env.',
        );
      }
      throw new BadRequestException('We could not send the verification code. Please try again.');
    }
  }

  private async logOtpEvent(
    action: AuditAction,
    user: { id: string; name?: string; email: string; schoolId?: string | null; school?: { name?: string } | null },
    ip?: string,
    extra?: Record<string, unknown>,
  ) {
    const metadata = {
      email: maskEmail(user.email),
      purpose: 'LOGIN',
      ...extra,
    };
    try {
      await this.auditLogs.log({
        action,
        actorId: user.id,
        actorName: user.name,
        schoolId: user.schoolId ?? undefined,
        schoolName: user.school?.name,
        ip,
        metadata,
      });
    } catch {
      /* audit must never block login */
    }
    if (user.schoolId) {
      try {
        await this.schoolAudit.log({
          schoolId: user.schoolId,
          userId: user.id,
          action,
          entity: 'LoginOtpChallenge',
          entityId: typeof extra?.challengeId === 'string' ? extra.challengeId : undefined,
          ipAddress: ip,
          details: metadata,
        });
      } catch {
        /* audit must never block login */
      }
    }
  }

  private loggerWarnDev(msg: string) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(`[DEV] ${msg}`);
    }
  }
}
