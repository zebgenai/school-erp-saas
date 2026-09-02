import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/types/current-user.type';

@Injectable()
export class NotificationAnalyticsService {
  constructor(private prisma: PrismaService) {}

  private schoolFilter(user: CurrentUser, schoolId?: string): Prisma.NotificationLogWhereInput {
    if (user.role === 'SUPER_ADMIN' && !user.schoolId) {
      return schoolId ? { schoolId } : {};
    }
    return { schoolId: user.schoolId ?? '__none__' };
  }

  async dashboardWidgets(user: CurrentUser) {
    const base = this.schoolFilter(user);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [sentToday, failed, pending] = await Promise.all([
      this.prisma.notificationLog.count({
        where: { ...base, status: { in: ['SENT', 'DELIVERED'] }, createdAt: { gte: startOfDay } },
      }),
      this.prisma.notificationLog.count({
        where: { ...base, status: 'FAILED' },
      }),
      this.prisma.notificationLog.count({
        where: { ...base, status: { in: ['PENDING', 'RETRYING'] } },
      }),
    ]);

    const scheduled = await this.prisma.notificationCampaign.count({
      where: {
        ...(user.role === 'SUPER_ADMIN' && !user.schoolId
          ? {}
          : { schoolId: user.schoolId ?? '__none__' }),
        status: 'SCHEDULED',
      },
    });

    return { sentToday, failed, pending, scheduled };
  }

  async analytics(user: CurrentUser, opts?: { schoolId?: string; days?: number }) {
    const days = opts?.days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const base = { ...this.schoolFilter(user, opts?.schoolId), createdAt: { gte: since } };

    const logs = await this.prisma.notificationLog.findMany({
      where: base,
      select: { channel: true, status: true, createdAt: true, readAt: true },
    });

    const total = logs.length;
    const sent = logs.filter((l) => l.status === 'SENT' || l.status === 'DELIVERED').length;
    const failed = logs.filter((l) => l.status === 'FAILED').length;
    const opened = logs.filter((l) => !!l.readAt).length;

    const byChannel: Record<string, { total: number; sent: number; failed: number }> = {};
    for (const ch of Object.values(NotificationChannel)) {
      byChannel[ch] = { total: 0, sent: 0, failed: 0 };
    }
    for (const l of logs) {
      const bucket = byChannel[l.channel] ?? (byChannel[l.channel] = { total: 0, sent: 0, failed: 0 });
      bucket.total++;
      if (l.status === 'SENT' || l.status === 'DELIVERED') bucket.sent++;
      if (l.status === 'FAILED') bucket.failed++;
    }

    const monthly: Record<string, number> = {};
    for (const l of logs) {
      const key = `${l.createdAt.getFullYear()}-${String(l.createdAt.getMonth() + 1).padStart(2, '0')}`;
      monthly[key] = (monthly[key] ?? 0) + 1;
    }

    return {
      periodDays: days,
      total,
      sent,
      failed,
      deliveryRate: total ? Math.round((sent / total) * 1000) / 10 : 0,
      openRate: sent ? Math.round((opened / sent) * 1000) / 10 : 0,
      byChannel,
      monthlyUsage: Object.entries(monthly)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => ({ month, count })),
    };
  }

  async platformStats() {
    const [email, sms, whatsapp, push, inApp, failed, total] = await Promise.all([
      this.prisma.notificationLog.count({ where: { channel: 'EMAIL', status: { in: ['SENT', 'DELIVERED'] } } }),
      this.prisma.notificationLog.count({ where: { channel: 'SMS', status: { in: ['SENT', 'DELIVERED'] } } }),
      this.prisma.notificationLog.count({ where: { channel: 'WHATSAPP', status: { in: ['SENT', 'DELIVERED'] } } }),
      this.prisma.notificationLog.count({ where: { channel: 'PUSH', status: { in: ['SENT', 'DELIVERED'] } } }),
      this.prisma.notificationLog.count({ where: { channel: 'IN_APP', status: { in: ['SENT', 'DELIVERED'] } } }),
      this.prisma.notificationLog.count({ where: { status: 'FAILED' } }),
      this.prisma.notificationLog.count(),
    ]);

    return {
      total,
      failed,
      usage: { email, sms, whatsapp, push, inApp },
    };
  }
}
