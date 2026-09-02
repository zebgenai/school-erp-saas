import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  NotificationCategory,
  NotificationChannel,
  NotificationSeverity,
  Prisma,
  PushPlatform,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  EVENT_CATEGORY_MAP,
  EVENT_SEVERITY_MAP,
  InAppNotificationPayload,
  NotificationPayload,
  SchoolNotificationSettings,
} from './notification.types';
import {
  EmailChannelProvider,
  NotificationChannelRegistry,
  OutboundChannel,
} from './providers/notification-channel.provider';

const ALL_CATEGORIES: NotificationCategory[] = [
  'STUDENT',
  'FEE',
  'PAYROLL',
  'ATTENDANCE',
  'EXAM',
  'LIBRARY',
  'TRANSPORT',
  'SYSTEM',
  'ANNOUNCEMENT',
  'HOMEWORK',
  'TIMETABLE',
  'HOLIDAY',
  'EMERGENCY',
  'BIRTHDAY',
];

function mapNotification(item: {
  id: string;
  title: string;
  body: string;
  type: NotificationSeverity;
  category: NotificationCategory;
  linkUrl: string | null;
  eventType: string;
  isRead: boolean;
  isArchived?: boolean;
  createdAt: Date;
  schoolId: string | null;
  userId: string;
  readAt?: Date | null;
  archivedAt?: Date | null;
}) {
  return {
    id: item.id,
    schoolId: item.schoolId,
    userId: item.userId,
    title: item.title,
    message: item.body,
    type: item.type,
    category: item.category,
    isRead: item.isRead,
    isArchived: item.isArchived ?? false,
    createdAt: item.createdAt,
    readAt: item.readAt ?? null,
    archivedAt: item.archivedAt ?? null,
    actionUrl: item.linkUrl,
    eventType: item.eventType,
    body: item.body,
    linkUrl: item.linkUrl,
  };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private channels: NotificationChannelRegistry,
    private emailChannel: EmailChannelProvider,
  ) {}

  async getSchoolSettings(schoolId: string): Promise<SchoolNotificationSettings> {
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
    return {
      emailEnabled: school?.emailNotificationsEnabled ?? true,
      smsEnabled: school?.smsNotificationsEnabled ?? false,
      whatsappEnabled: school?.whatsappNotificationsEnabled ?? false,
    };
  }

  async send(payload: NotificationPayload): Promise<void> {
    if (payload.channel === 'IN_APP') {
      if (!payload.userId) return;
      await this.sendInApp({
        userId: payload.userId,
        schoolId: payload.schoolId,
        eventType: payload.eventType ?? 'GENERAL_ANNOUNCEMENT',
        title: payload.subject ?? 'Notification',
        body: payload.body,
      });
      return;
    }

    if (payload.schoolId) {
      const settings = await this.getSchoolSettings(payload.schoolId);
      if (payload.channel === 'EMAIL' && !settings.emailEnabled) return;
      if (payload.channel === 'SMS' && !settings.smsEnabled) return;
      if (payload.channel === 'WHATSAPP' && !settings.whatsappEnabled) return;
    }

    // Enforce per-user channel preferences when userId is known
    if (payload.userId && payload.eventType) {
      const category =
        EVENT_CATEGORY_MAP[payload.eventType] ?? NotificationCategory.SYSTEM;
      const prefOk = await this.isChannelEnabled(payload.userId, category, payload.channel);
      if (!prefOk) return;
    }

    let logId = payload.existingLogId;
    if (!payload.skipLogCreate) {
      const log = await this.prisma.notificationLog.create({
        data: {
          schoolId: payload.schoolId,
          eventType: payload.eventType,
          channel: payload.channel as NotificationChannel,
          recipient: payload.recipient,
          subject: payload.subject,
          body: payload.body,
          status: 'PENDING',
          senderId: payload.senderId,
          campaignId: payload.campaignId,
          templateId: payload.templateId,
        },
      });
      logId = log.id;
    }

    try {
      const provider = this.channels.get(payload.channel as OutboundChannel);
      const result = await provider.send({
        to: payload.recipient,
        subject: payload.subject,
        body: payload.body,
        deviceToken: payload.deviceToken,
      });

      if (result.skipped) {
        if (logId) {
          await this.prisma.notificationLog.update({
            where: { id: logId },
            data: { status: 'FAILED', error: result.error ?? 'Channel not configured' },
          });
        }
        return;
      }

      if (!result.success) {
        throw new Error(result.error ?? 'Send failed');
      }

      if (logId) {
        await this.prisma.notificationLog.update({
          where: { id: logId },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            deliveredAt: new Date(),
            providerMessageId: result.providerMessageId,
            error: null,
          },
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Notification failed [${payload.channel}] to ${payload.recipient}: ${message}`);
      if (logId) {
        await this.prisma.notificationLog.update({
          where: { id: logId },
          data: { status: 'FAILED', error: message },
        });
      }
    }
  }

  async isCategoryEnabled(userId: string, category: NotificationCategory): Promise<boolean> {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId_category: { userId, category } },
    });
    return pref?.inAppEnabled ?? true;
  }

  async isChannelEnabled(
    userId: string,
    category: NotificationCategory,
    channel: string,
  ): Promise<boolean> {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId_category: { userId, category } },
    });
    if (!pref) {
      if (channel === 'SMS' || channel === 'PUSH') return false;
      return true;
    }
    if (channel === 'EMAIL') return pref.emailEnabled;
    if (channel === 'SMS' || channel === 'WHATSAPP') return pref.smsEnabled;
    if (channel === 'PUSH') return pref.pushEnabled;
    return pref.inAppEnabled;
  }

  async sendInApp(payload: InAppNotificationPayload): Promise<void> {
    const category =
      payload.category ?? EVENT_CATEGORY_MAP[payload.eventType] ?? NotificationCategory.SYSTEM;
    const type =
      payload.type ?? EVENT_SEVERITY_MAP[payload.eventType] ?? NotificationSeverity.INFO;

    const enabled = await this.isCategoryEnabled(payload.userId, category);
    if (!enabled) return;

    if (payload.dedupeKey) {
      const existing = await this.prisma.userNotification.findUnique({
        where: { userId_dedupeKey: { userId: payload.userId, dedupeKey: payload.dedupeKey } },
      });
      if (existing) return;
    }

    try {
      await this.prisma.userNotification.create({
        data: {
          userId: payload.userId,
          schoolId: payload.schoolId,
          eventType: payload.eventType,
          title: payload.title,
          body: payload.body,
          type,
          category,
          linkUrl: payload.linkUrl,
          dedupeKey: payload.dedupeKey,
        },
      });
    } catch (err: unknown) {
      if (
        payload.dedupeKey &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return;
      }
      throw err;
    }

    await this.prisma.notificationLog.create({
      data: {
        schoolId: payload.schoolId,
        eventType: payload.eventType,
        channel: 'IN_APP',
        recipient: payload.userId,
        subject: payload.title,
        body: payload.body,
        status: 'SENT',
        sentAt: new Date(),
        deliveredAt: new Date(),
      },
    });
  }

  async listForUser(
    userId: string,
    opts?: {
      limit?: number;
      offset?: number;
      category?: NotificationCategory;
      isRead?: boolean;
      unreadOnly?: boolean;
      archived?: boolean;
      search?: string;
    },
  ) {
    const limit = opts?.limit ?? 30;
    const offset = opts?.offset ?? 0;
    const where: Prisma.UserNotificationWhereInput = {
      userId,
      isArchived: opts?.archived === true,
    };
    if (opts?.category) where.category = opts.category;
    if (opts?.isRead !== undefined) where.isRead = opts.isRead;
    if (opts?.unreadOnly) where.isRead = false;
    if (opts?.search?.trim()) {
      where.OR = [
        { title: { contains: opts.search.trim(), mode: 'insensitive' } },
        { body: { contains: opts.search.trim(), mode: 'insensitive' } },
      ];
    }

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.userNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.userNotification.count({ where }),
      this.prisma.userNotification.count({
        where: { userId, isRead: false, isArchived: false },
      }),
    ]);

    return {
      items: items.map(mapNotification),
      total,
      unreadCount,
    };
  }

  async getUnreadCount(userId: string) {
    return this.prisma.userNotification.count({
      where: { userId, isRead: false, isArchived: false },
    });
  }

  async markRead(userId: string, id: string) {
    const n = await this.prisma.userNotification.findFirst({ where: { id, userId } });
    if (!n) return null;
    const updated = await this.prisma.userNotification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
    // Mirror read time onto matching delivery log when possible
    await this.prisma.notificationLog.updateMany({
      where: {
        recipient: userId,
        channel: 'IN_APP',
        subject: n.title,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return mapNotification(updated);
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.userNotification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  async archive(userId: string, id: string) {
    const n = await this.prisma.userNotification.findFirst({ where: { id, userId } });
    if (!n) throw new NotFoundException('Notification not found');
    const updated = await this.prisma.userNotification.update({
      where: { id },
      data: { isArchived: true, archivedAt: new Date(), isRead: true, readAt: n.readAt ?? new Date() },
    });
    return mapNotification(updated);
  }

  async unarchive(userId: string, id: string) {
    const n = await this.prisma.userNotification.findFirst({ where: { id, userId } });
    if (!n) throw new NotFoundException('Notification not found');
    const updated = await this.prisma.userNotification.update({
      where: { id },
      data: { isArchived: false, archivedAt: null },
    });
    return mapNotification(updated);
  }

  async deleteNotification(userId: string, id: string) {
    const n = await this.prisma.userNotification.findFirst({ where: { id, userId } });
    if (!n) throw new NotFoundException('Notification not found');
    await this.prisma.userNotification.delete({ where: { id } });
    return { deleted: true };
  }

  async getPreferences(userId: string) {
    const existing = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const map = new Map(existing.map((p) => [p.category, p]));
    return ALL_CATEGORIES.map((category) => {
      const pref = map.get(category);
      return {
        category,
        inAppEnabled: pref?.inAppEnabled ?? true,
        emailEnabled: pref?.emailEnabled ?? true,
        smsEnabled: pref?.smsEnabled ?? false,
        pushEnabled: pref?.pushEnabled ?? false,
      };
    });
  }

  async updatePreferences(
    userId: string,
    prefs: Array<{
      category: NotificationCategory;
      inAppEnabled?: boolean;
      emailEnabled?: boolean;
      smsEnabled?: boolean;
      pushEnabled?: boolean;
    }>,
  ) {
    await Promise.all(
      prefs.map((p) =>
        this.prisma.notificationPreference.upsert({
          where: { userId_category: { userId, category: p.category } },
          create: {
            userId,
            category: p.category,
            inAppEnabled: p.inAppEnabled ?? true,
            emailEnabled: p.emailEnabled ?? true,
            smsEnabled: p.smsEnabled ?? false,
            pushEnabled: p.pushEnabled ?? false,
          },
          update: {
            ...(p.inAppEnabled !== undefined ? { inAppEnabled: p.inAppEnabled } : {}),
            ...(p.emailEnabled !== undefined ? { emailEnabled: p.emailEnabled } : {}),
            ...(p.smsEnabled !== undefined ? { smsEnabled: p.smsEnabled } : {}),
            ...(p.pushEnabled !== undefined ? { pushEnabled: p.pushEnabled } : {}),
          },
        }),
      ),
    );
    return this.getPreferences(userId);
  }

  async listLogs(
    schoolId: string | null,
    limit = 50,
    offset = 0,
    opts?: { status?: string; channel?: NotificationChannel },
  ) {
    const where: Prisma.NotificationLogWhereInput = {};
    if (schoolId) where.schoolId = schoolId;
    if (opts?.status) where.status = opts.status as any;
    if (opts?.channel) where.channel = opts.channel;

    const [items, total] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.notificationLog.count({ where }),
    ]);
    return { items, total };
  }

  async registerPushToken(userId: string, token: string, platform: PushPlatform = 'WEB') {
    return this.prisma.pushDeviceToken.upsert({
      where: { userId_token: { userId, token } },
      create: { userId, token, platform, isActive: true, lastUsedAt: new Date() },
      update: { platform, isActive: true, lastUsedAt: new Date() },
    });
  }

  async unregisterPushToken(userId: string, token: string) {
    await this.prisma.pushDeviceToken.updateMany({
      where: { userId, token },
      data: { isActive: false },
    });
    return { removed: true };
  }

  async sendPasswordResetEmail(to: string, resetUrl: string) {
    await this.send({
      channel: 'EMAIL',
      recipient: to,
      subject: 'Reset your Clever Campus password',
      body: `You requested a password reset.\n\nClick the link below to set a new password (valid for 1 hour):\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
      eventType: 'PASSWORD_RESET',
    });
  }

  /**
   * Login OTP email. The code is never written to notification logs.
   */
  async sendLoginOtpEmail(opts: {
    to: string;
    recipientName: string;
    code: string;
    expiryMinutes: number;
    appName?: string;
  }): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
    const configured = await this.emailChannel.isConfigured();
    if (!configured) {
      return { success: false, skipped: true, error: 'SMTP not configured' };
    }

    const appName = opts.appName || 'Clever Campus';
    const subject = `${appName} sign-in verification code`;
    const text = [
      `Hello ${opts.recipientName || 'there'},`,
      '',
      `Your ${appName} verification code is: ${opts.code}`,
      '',
      `This code expires in ${opts.expiryMinutes} minutes.`,
      'Do not share this code with anyone. We will never ask for it by phone or chat.',
      '',
      'If you did not try to sign in, you can ignore this email.',
    ].join('\n');

    const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6fb;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e5e7eb;">
        <tr><td style="font-size:20px;font-weight:700;padding-bottom:8px;">${escapeHtml(appName)}</td></tr>
        <tr><td style="font-size:14px;color:#6b7280;padding-bottom:24px;">Sign-in verification</td></tr>
        <tr><td style="font-size:15px;padding-bottom:16px;">Hello ${escapeHtml(opts.recipientName || 'there')},</td></tr>
        <tr><td style="font-size:15px;padding-bottom:20px;">Use this code to finish signing in. It expires in <strong>${opts.expiryMinutes} minutes</strong>.</td></tr>
        <tr><td align="center" style="padding:12px 0 24px;">
          <div style="display:inline-block;letter-spacing:8px;font-size:28px;font-weight:700;background:#eef2ff;color:#1e3a8a;padding:14px 22px;border-radius:12px;">${escapeHtml(opts.code)}</div>
        </td></tr>
        <tr><td style="font-size:13px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px;">Do not share this code with anyone. ${escapeHtml(appName)} will never ask for it by phone or chat.</td></tr>
        <tr><td style="font-size:12px;color:#9ca3af;padding-top:20px;">If you did not try to sign in, you can ignore this email.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    return this.emailChannel.send({
      to: opts.to,
      subject,
      body: text,
      html,
    });
  }

  async channelStatus() {
    return this.channels.status();
  }

  async isLoginEmailConfigured() {
    return this.emailChannel.isConfigured();
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
