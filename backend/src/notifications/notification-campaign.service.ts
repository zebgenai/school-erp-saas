import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CampaignAudience,
  CampaignStatus,
  NotificationCategory,
  NotificationChannel,
  Prisma,
  RecurrenceType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolAuditService } from '../audit-logs/school-audit.service';
import { CurrentUser } from '../common/types/current-user.type';
import { NotificationsService } from './notifications.service';
import { NotificationTemplateService } from './notification-template.service';
import { NotificationEventType } from './notification.types';

export interface ComposeCampaignDto {
  title: string;
  subject?: string;
  body: string;
  templateId?: string;
  templateCode?: string;
  category?: NotificationCategory;
  channels: NotificationChannel[];
  audienceType: CampaignAudience;
  audienceFilter?: {
    studentId?: string;
    parentId?: string;
    teacherId?: string;
    staffId?: string;
    classId?: string;
    sectionId?: string;
    userIds?: string[];
    schoolIds?: string[];
    roles?: UserRole[];
  };
  templateVars?: Record<string, string | number>;
  scheduledAt?: string;
  recurrence?: RecurrenceType;
  sendNow?: boolean;
  retryFailed?: boolean;
}

@Injectable()
export class NotificationCampaignService {
  private readonly logger = new Logger(NotificationCampaignService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private templates: NotificationTemplateService,
    private schoolAudit: SchoolAuditService,
  ) {}

  async list(user: CurrentUser, opts?: { limit?: number; offset?: number; status?: CampaignStatus }) {
    const where: Prisma.NotificationCampaignWhereInput = {};
    if (user.role === 'SUPER_ADMIN' && !user.schoolId) {
      // platform view — all campaigns, optionally filtered later
    } else {
      if (!user.schoolId) return { items: [], total: 0 };
      where.schoolId = user.schoolId;
    }
    if (opts?.status) where.status = opts.status;

    const limit = opts?.limit ?? 30;
    const offset = opts?.offset ?? 0;
    const [items, total] = await Promise.all([
      this.prisma.notificationCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.notificationCampaign.count({ where }),
    ]);
    return { items, total };
  }

  async get(id: string, user: CurrentUser) {
    const c = await this.prisma.notificationCampaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Campaign not found');
    this.assertSchoolAccess(c.schoolId, user);
    return c;
  }

  async compose(user: CurrentUser, dto: ComposeCampaignDto) {
    if (!dto.channels?.length) {
      throw new BadRequestException('At least one channel is required');
    }
    if (dto.audienceType === 'MULTI_SCHOOL' && user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only Super Admin can send to multiple schools');
    }
    if (dto.audienceType !== 'MULTI_SCHOOL' && !user.schoolId && user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('School context required');
    }

    let title = dto.title;
    let subject = dto.subject;
    let body = dto.body;
    let templateId = dto.templateId;
    const category = dto.category ?? NotificationCategory.ANNOUNCEMENT;

    if (dto.templateId || dto.templateCode) {
      const channel = dto.channels[0];
      const tpl = dto.templateId
        ? await this.templates.get(dto.templateId, user)
        : await this.templates.resolve(dto.templateCode!, channel, user.schoolId);
      if (tpl) {
        const rendered = this.templates.render(tpl, {
          schoolName: '',
          ...(dto.templateVars ?? {}),
        });
        subject = rendered.subject ?? subject;
        body = rendered.body || body;
        title = title || tpl.name;
        templateId = tpl.id;
      }
    }

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    const sendNow = dto.sendNow !== false && !scheduledAt;
    const status: CampaignStatus = scheduledAt && !sendNow ? 'SCHEDULED' : sendNow ? 'SENDING' : 'DRAFT';

    const campaign = await this.prisma.notificationCampaign.create({
      data: {
        schoolId: user.schoolId ?? null,
        createdById: user.id,
        title,
        subject,
        body,
        templateId,
        category,
        channels: dto.channels,
        audienceType: dto.audienceType,
        audienceFilter: (dto.audienceFilter ?? {}) as Prisma.InputJsonValue,
        status,
        scheduledAt,
        recurrence: dto.recurrence ?? 'NONE',
        nextRunAt: scheduledAt,
        retryFailed: dto.retryFailed ?? true,
      },
    });

    if (user.schoolId) {
      await this.schoolAudit.log({
        schoolId: user.schoolId,
        userId: user.id,
        actorName: user.name ?? user.email,
        action: scheduledAt ? 'NOTIFICATION_SCHEDULED' : 'NOTIFICATION_SENT',
        entity: 'NotificationCampaign',
        entityId: campaign.id,
        description: `${scheduledAt ? 'Scheduled' : 'Composed'} notification: ${title}`,
        details: { audienceType: dto.audienceType, channels: dto.channels },
      });
    }

    if (sendNow) {
      await this.executeCampaign(campaign.id);
      return this.get(campaign.id, user);
    }

    return campaign;
  }

  async cancel(id: string, user: CurrentUser) {
    const c = await this.get(id, user);
    if (c.status !== 'SCHEDULED' && c.status !== 'DRAFT') {
      throw new BadRequestException('Only draft/scheduled campaigns can be cancelled');
    }
    return this.prisma.notificationCampaign.update({
      where: { id },
      data: { status: 'CANCELLED', nextRunAt: null },
    });
  }

  async retryFailed(id: string, user: CurrentUser) {
    const c = await this.get(id, user);
    const failed = await this.prisma.notificationLog.findMany({
      where: { campaignId: id, status: 'FAILED' },
      take: 500,
    });
    let retried = 0;
    for (const log of failed) {
      if (log.retryCount >= (c.maxRetries ?? 3)) continue;
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: 'RETRYING', retryCount: { increment: 1 }, error: null },
      });
      try {
        await this.notifications.send({
          channel: log.channel as 'EMAIL' | 'SMS' | 'WHATSAPP' | 'IN_APP' | 'PUSH',
          recipient: log.recipient,
          subject: log.subject ?? undefined,
          body: log.body,
          schoolId: log.schoolId ?? undefined,
          eventType: (log.eventType as NotificationEventType) ?? 'GENERAL_ANNOUNCEMENT',
          userId: log.channel === 'IN_APP' ? log.recipient : undefined,
          campaignId: id,
          senderId: user.id,
          skipLogCreate: true,
          existingLogId: log.id,
        });
        retried++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Retry failed';
        await this.prisma.notificationLog.update({
          where: { id: log.id },
          data: { status: 'FAILED', error: message },
        });
      }
    }
    return { retried, totalFailed: failed.length };
  }

  async executeCampaign(campaignId: string) {
    const campaign = await this.prisma.notificationCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) return;

    await this.prisma.notificationCampaign.update({
      where: { id: campaignId },
      data: { status: 'SENDING' },
    });

    try {
      const recipients = await this.resolveAudience(campaign);
      const channels = (campaign.channels as NotificationChannel[]) ?? [];
      let sent = 0;
      let failed = 0;

      for (const recipient of recipients) {
        for (const channel of channels) {
          try {
            if (channel === 'IN_APP') {
              if (!recipient.userId) continue;
              await this.notifications.sendInApp({
                userId: recipient.userId,
                schoolId: recipient.schoolId ?? campaign.schoolId ?? undefined,
                eventType: 'GENERAL_ANNOUNCEMENT',
                title: campaign.title,
                body: campaign.body,
                category: campaign.category,
              });
              sent++;
              continue;
            }

            const address = channel === 'EMAIL' ? recipient.email : recipient.phone;
            if (!address) continue;

            await this.notifications.send({
              channel: channel as 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH',
              recipient: address,
              subject: campaign.subject ?? campaign.title,
              body: campaign.body,
              schoolId: recipient.schoolId ?? campaign.schoolId ?? undefined,
              eventType: 'GENERAL_ANNOUNCEMENT',
              userId: recipient.userId,
              campaignId: campaign.id,
              senderId: campaign.createdById,
              templateId: campaign.templateId ?? undefined,
            });
            sent++;
          } catch (err: unknown) {
            failed++;
            this.logger.warn(
              `Campaign ${campaignId} recipient failure: ${err instanceof Error ? err.message : err}`,
            );
          }
        }
      }

      const nextRunAt = this.computeNextRun(campaign.recurrence, campaign.scheduledAt);
      await this.prisma.notificationCampaign.update({
        where: { id: campaignId },
        data: {
          status: failed > 0 && sent === 0 ? 'FAILED' : failed > 0 ? 'PARTIAL' : 'SENT',
          sentAt: new Date(),
          nextRunAt,
          stats: { sent, failed, recipients: recipients.length },
          error: failed > 0 ? `${failed} delivery failures` : null,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Campaign failed';
      await this.prisma.notificationCampaign.update({
        where: { id: campaignId },
        data: { status: 'FAILED', error: message },
      });
    }
  }

  async processDueCampaigns() {
    const due = await this.prisma.notificationCampaign.findMany({
      where: {
        status: { in: ['SCHEDULED'] },
        OR: [
          { nextRunAt: { lte: new Date() } },
          { scheduledAt: { lte: new Date() }, nextRunAt: null },
        ],
      },
      take: 20,
    });
    for (const c of due) {
      await this.executeCampaign(c.id);
    }
    return { processed: due.length };
  }

  private computeNextRun(recurrence: RecurrenceType, from?: Date | null): Date | null {
    if (!recurrence || recurrence === 'NONE') return null;
    const base = from ? new Date(from) : new Date();
    const next = new Date(base);
    if (recurrence === 'DAILY') next.setDate(next.getDate() + 1);
    if (recurrence === 'WEEKLY') next.setDate(next.getDate() + 7);
    if (recurrence === 'MONTHLY') next.setMonth(next.getMonth() + 1);
    return next;
  }

  private async resolveAudience(campaign: {
    schoolId: string | null;
    audienceType: CampaignAudience;
    audienceFilter: Prisma.JsonValue;
  }): Promise<Array<{ userId?: string; email?: string | null; phone?: string | null; schoolId?: string | null }>> {
    const filter = (campaign.audienceFilter ?? {}) as {
      studentId?: string;
      parentId?: string;
      teacherId?: string;
      staffId?: string;
      classId?: string;
      sectionId?: string;
      userIds?: string[];
      schoolIds?: string[];
      roles?: UserRole[];
    };

    switch (campaign.audienceType) {
      case 'SELECTED_USERS': {
        const users = await this.prisma.user.findMany({
          where: { id: { in: filter.userIds ?? [] } },
          select: { id: true, email: true, phone: true, schoolId: true },
        });
        return users.map((u) => ({
          userId: u.id,
          email: u.email,
          phone: u.phone,
          schoolId: u.schoolId,
        }));
      }
      case 'STUDENT': {
        const student = await this.prisma.student.findFirst({
          where: { id: filter.studentId, ...(campaign.schoolId ? { schoolId: campaign.schoolId } : {}) },
          include: { user: true, parents: { include: { user: true } } },
        });
        if (!student) return [];
        const out: Array<{
          userId?: string;
          email?: string | null;
          phone?: string | null;
          schoolId?: string | null;
        }> = [
          {
            userId: student.userId ?? undefined,
            email: student.user?.email ?? null,
            phone: student.user?.phone ?? student.guardianPhone ?? student.whatsappNumber,
            schoolId: student.schoolId,
          },
        ];
        for (const p of student.parents ?? []) {
          out.push({
            userId: p.userId ?? undefined,
            email: p.user?.email ?? p.email,
            phone: p.user?.phone ?? p.phone,
            schoolId: p.schoolId,
          });
        }
        return out;
      }
      case 'PARENT': {
        const parent = await this.prisma.parent.findFirst({
          where: { id: filter.parentId, ...(campaign.schoolId ? { schoolId: campaign.schoolId } : {}) },
          include: { user: true },
        });
        if (!parent) return [];
        return [
          {
            userId: parent.userId ?? undefined,
            email: parent.user?.email ?? parent.email,
            phone: parent.user?.phone ?? parent.phone,
            schoolId: parent.schoolId,
          },
        ];
      }
      case 'TEACHER': {
        const teacher = await this.prisma.teacher.findFirst({
          where: { id: filter.teacherId, ...(campaign.schoolId ? { schoolId: campaign.schoolId } : {}) },
          include: { user: true },
        });
        if (!teacher) return [];
        return [
          {
            userId: teacher.userId ?? undefined,
            email: teacher.user?.email ?? teacher.email,
            phone: teacher.user?.phone ?? teacher.phone,
            schoolId: teacher.schoolId,
          },
        ];
      }
      case 'STAFF': {
        const staff = await this.prisma.staff.findFirst({
          where: { id: filter.staffId, ...(campaign.schoolId ? { schoolId: campaign.schoolId } : {}) },
          include: { user: true },
        });
        if (!staff) return [];
        return [
          {
            userId: staff.userId ?? undefined,
            email: staff.user?.email ?? staff.email,
            phone: staff.user?.phone ?? staff.phone,
            schoolId: staff.schoolId,
          },
        ];
      }
      case 'CLASS':
      case 'SECTION': {
        const students = await this.prisma.student.findMany({
          where: {
            schoolId: campaign.schoolId!,
            ...(filter.classId ? { classId: filter.classId } : {}),
            ...(filter.sectionId ? { sectionId: filter.sectionId } : {}),
            status: 'ACTIVE',
          },
          include: {
            user: true,
            parents: { include: { user: true } },
          },
        });
        const out: Array<{
          userId?: string;
          email?: string | null;
          phone?: string | null;
          schoolId?: string | null;
        }> = [];
        for (const s of students) {
          if (s.userId) {
            out.push({
              userId: s.userId,
              email: s.user?.email ?? null,
              phone: s.user?.phone ?? s.guardianPhone ?? s.whatsappNumber,
              schoolId: s.schoolId,
            });
          }
          for (const p of s.parents ?? []) {
            out.push({
              userId: p.userId ?? undefined,
              email: p.user?.email ?? p.email,
              phone: p.user?.phone ?? p.phone,
              schoolId: p.schoolId,
            });
          }
        }
        return out;
      }
      case 'SCHOOL': {
        const roles = filter.roles?.length
          ? filter.roles
          : ([
              UserRole.SCHOOL_ADMIN,
              UserRole.TEACHER,
              UserRole.PARENT,
              UserRole.STUDENT,
              UserRole.ACCOUNTANT,
              UserRole.RECEPTIONIST,
            ] as UserRole[]);
        const users = await this.prisma.user.findMany({
          where: {
            schoolId: campaign.schoolId!,
            role: { in: roles },
            status: 'ACTIVE',
          },
          select: { id: true, email: true, phone: true, schoolId: true },
        });
        return users.map((u) => ({
          userId: u.id,
          email: u.email,
          phone: u.phone,
          schoolId: u.schoolId,
        }));
      }
      case 'MULTI_SCHOOL': {
        const schoolIds = filter.schoolIds ?? [];
        const users = await this.prisma.user.findMany({
          where: {
            schoolId: { in: schoolIds },
            role: UserRole.SCHOOL_ADMIN,
            status: 'ACTIVE',
          },
          select: { id: true, email: true, phone: true, schoolId: true },
        });
        return users.map((u) => ({
          userId: u.id,
          email: u.email,
          phone: u.phone,
          schoolId: u.schoolId,
        }));
      }
      default:
        return [];
    }
  }

  private assertSchoolAccess(schoolId: string | null, user: CurrentUser) {
    if (user.role === 'SUPER_ADMIN') return;
    if (schoolId && schoolId !== user.schoolId) {
      throw new ForbiddenException('Campaign belongs to another school');
    }
  }
}
