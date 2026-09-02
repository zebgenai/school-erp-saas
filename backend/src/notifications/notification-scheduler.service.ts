import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationCampaignService } from './notification-campaign.service';
import { NotificationEngineService } from './notification-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    private campaigns: NotificationCampaignService,
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private notificationEngine: NotificationEngineService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledCampaigns() {
    try {
      const result = await this.campaigns.processDueCampaigns();
      if (result.processed > 0) {
        this.logger.log(`Processed ${result.processed} scheduled campaign(s)`);
      }
    } catch (err: unknown) {
      this.logger.error(
        `Scheduled campaign processing failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Retry FAILED outbound logs that still have retry budget. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async retryFailedMessages() {
    try {
      const failed = await this.prisma.notificationLog.findMany({
        where: {
          status: 'FAILED',
          retryCount: { lt: 3 },
          channel: { not: 'IN_APP' },
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        take: 50,
        orderBy: { createdAt: 'asc' },
      });

      for (const log of failed) {
        await this.prisma.notificationLog.update({
          where: { id: log.id },
          data: { status: 'RETRYING', retryCount: { increment: 1 }, error: null },
        });
        try {
          await this.notifications.send({
            channel: log.channel as 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH',
            recipient: log.recipient,
            subject: log.subject ?? undefined,
            body: log.body,
            schoolId: log.schoolId ?? undefined,
            eventType: (log.eventType as any) ?? 'GENERAL_ANNOUNCEMENT',
            campaignId: log.campaignId ?? undefined,
            senderId: log.senderId ?? undefined,
            templateId: log.templateId ?? undefined,
            skipLogCreate: true,
            existingLogId: log.id,
          });
        } catch (err: unknown) {
          await this.prisma.notificationLog.update({
            where: { id: log.id },
            data: {
              status: 'FAILED',
              error: err instanceof Error ? err.message : 'Retry failed',
            },
          });
        }
      }

      if (failed.length) {
        this.logger.log(`Retried ${failed.length} failed notification(s)`);
      }
    } catch (err: unknown) {
      this.logger.error(`Retry job failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  /** Homework due tomorrow + overdue reminders (daily 7am). */
  @Cron('0 7 * * *')
  async homeworkDueReminders() {
    try {
      const tomorrowStart = new Date();
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      tomorrowStart.setHours(0, 0, 0, 0);
      const tomorrowEnd = new Date(tomorrowStart);
      tomorrowEnd.setHours(23, 59, 59, 999);

      const dueTomorrow = await this.prisma.homework.findMany({
        where: {
          status: 'PUBLISHED',
          dueDate: { gte: tomorrowStart, lte: tomorrowEnd },
        },
        take: 100,
      });

      for (const hw of dueTomorrow) {
        await this.notificationEngine.emitHomeworkDueTomorrow(
          hw.schoolId,
          hw.id,
          hw.title,
          hw.classId,
          hw.sectionId,
        );
      }

      const overdueStart = new Date();
      overdueStart.setHours(0, 0, 0, 0);
      const overdue = await this.prisma.homework.findMany({
        where: {
          status: 'PUBLISHED',
          dueDate: {
            gte: new Date(overdueStart.getTime() - 24 * 60 * 60 * 1000),
            lt: overdueStart,
          },
        },
        take: 100,
      });

      for (const hw of overdue) {
        await this.notificationEngine.emitHomeworkOverdue(
          hw.schoolId,
          hw.title,
          hw.classId,
          hw.sectionId,
        );
      }
    } catch (err: unknown) {
      this.logger.error(
        `Homework reminder job failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Online class reminders (1h before) + auto-start notifications (every 10 min). */
  @Cron('*/10 * * * *')
  async onlineClassReminders() {
    try {
      const now = new Date();
      const in55 = new Date(now.getTime() + 55 * 60 * 1000);
      const in65 = new Date(now.getTime() + 65 * 60 * 1000);

      const upcoming = await this.prisma.onlineClass.findMany({
        where: {
          status: 'SCHEDULED',
          reminderSentAt: null,
          startAt: { gte: in55, lte: in65 },
        },
        take: 100,
      });

      for (const oc of upcoming) {
        await this.notificationEngine.emitOnlineClassReminder(
          oc.schoolId,
          oc.classId,
          oc.title,
          oc.meetingLink,
          oc.sectionId,
        );
        await this.prisma.onlineClass.update({
          where: { id: oc.id },
          data: { reminderSentAt: now },
        });
      }

      const starting = await this.prisma.onlineClass.findMany({
        where: {
          status: 'SCHEDULED',
          startedNotifiedAt: null,
          startAt: { lte: now },
          endAt: { gte: now },
        },
        take: 50,
      });

      for (const oc of starting) {
        await this.prisma.onlineClass.update({
          where: { id: oc.id },
          data: { status: 'LIVE', startedNotifiedAt: now },
        });
        await this.notificationEngine.emitOnlineClassStarted(
          oc.schoolId,
          oc.classId,
          oc.title,
          oc.meetingLink,
          oc.sectionId,
        );
      }
    } catch (err: unknown) {
      this.logger.error(
        `Online class reminder job failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Academic calendar reminders at 7 / 3 / 1 / 0 days before an event (daily 6am). */
  @Cron('0 6 * * *')
  async calendarEventReminders() {
    const offsets: { days: number; field: 'reminderSent7At' | 'reminderSent3At' | 'reminderSent1At' | 'reminderSent0At' }[] = [
      { days: 7, field: 'reminderSent7At' },
      { days: 3, field: 'reminderSent3At' },
      { days: 1, field: 'reminderSent1At' },
      { days: 0, field: 'reminderSent0At' },
    ];

    for (const { days, field } of offsets) {
      try {
        const target = new Date();
        target.setUTCDate(target.getUTCDate() + days);
        const dayStart = new Date(
          Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()),
        );
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

        const due = await this.prisma.academicCalendarEvent.findMany({
          where: {
            status: 'PUBLISHED',
            startDate: { gte: dayStart, lte: dayEnd },
            [field]: null,
          },
          take: 200,
        });

        for (const event of due) {
          await this.notificationEngine.emitCalendarEventReminder(
            event.schoolId,
            event.id,
            event.title,
            days,
            event.startDate,
            event.classId,
            event.sectionId,
            (event.visibility ?? '').split(',').filter(Boolean),
          );
          await this.prisma.academicCalendarEvent.update({
            where: { id: event.id },
            data: { [field]: new Date() },
          });
        }
      } catch (err: unknown) {
        this.logger.error(
          `Calendar reminder job (${days}d) failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }
}
