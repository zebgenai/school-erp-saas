import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  NotificationCategory,
  NotificationChannel,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/types/current-user.type';
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_PLACEHOLDERS,
  renderTemplate,
} from './templates/default-templates';

@Injectable()
export class NotificationTemplateService {
  constructor(private prisma: PrismaService) {}

  placeholders() {
    return TEMPLATE_PLACEHOLDERS;
  }

  async ensureDefaults(schoolId?: string | null) {
    for (const t of DEFAULT_TEMPLATES) {
      const existing = await this.prisma.notificationTemplate.findFirst({
        where: {
          schoolId: schoolId ?? null,
          code: t.code,
          channel: t.channel,
        },
      });
      if (existing) continue;
      await this.prisma.notificationTemplate.create({
        data: {
          schoolId: schoolId ?? null,
          code: t.code,
          name: t.name,
          category: t.category,
          channel: t.channel,
          subject: t.subject,
          body: t.body,
          isDefault: true,
          isActive: true,
        },
      });
    }
  }

  async list(user: CurrentUser, opts?: { category?: NotificationCategory; channel?: NotificationChannel }) {
    await this.ensureDefaults(user.schoolId ?? null);
    const where: Prisma.NotificationTemplateWhereInput = {
      OR: [
        { schoolId: null },
        ...(user.schoolId ? [{ schoolId: user.schoolId }] : []),
      ],
      ...(opts?.category ? { category: opts.category } : {}),
      ...(opts?.channel ? { channel: opts.channel } : {}),
    };
    return this.prisma.notificationTemplate.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async get(id: string, user: CurrentUser) {
    const t = await this.prisma.notificationTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Template not found');
    this.assertAccess(t.schoolId, user);
    return t;
  }

  async create(
    user: CurrentUser,
    data: {
      code: string;
      name: string;
      category: NotificationCategory;
      channel: NotificationChannel;
      subject?: string;
      body: string;
      isActive?: boolean;
    },
  ) {
    if (!user.schoolId && user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('School context required');
    }
    return this.prisma.notificationTemplate.create({
      data: {
        schoolId: user.schoolId ?? null,
        code: data.code,
        name: data.name,
        category: data.category,
        channel: data.channel,
        subject: data.subject,
        body: data.body,
        isDefault: false,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(
    id: string,
    user: CurrentUser,
    data: Partial<{
      name: string;
      subject: string;
      body: string;
      isActive: boolean;
      category: NotificationCategory;
    }>,
  ) {
    const t = await this.get(id, user);
    if (t.schoolId === null && user.role !== 'SUPER_ADMIN') {
      // School admins may clone overrides, but not edit platform defaults in place
      throw new ForbiddenException('Cannot edit platform default templates. Create a school override instead.');
    }
    return this.prisma.notificationTemplate.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, user: CurrentUser) {
    const t = await this.get(id, user);
    if (t.isDefault && t.schoolId === null) {
      throw new ForbiddenException('Cannot delete platform default templates');
    }
    await this.prisma.notificationTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  async resolve(
    code: string,
    channel: NotificationChannel,
    schoolId?: string | null,
  ) {
    if (schoolId) {
      const schoolTpl = await this.prisma.notificationTemplate.findFirst({
        where: { schoolId, code, channel, isActive: true },
      });
      if (schoolTpl) return schoolTpl;
    }
    return this.prisma.notificationTemplate.findFirst({
      where: { schoolId: null, code, channel, isActive: true },
    });
  }

  render(
    template: { subject?: string | null; body: string },
    vars: Record<string, string | number | null | undefined>,
  ) {
    return {
      subject: template.subject ? renderTemplate(template.subject, vars) : undefined,
      body: renderTemplate(template.body, vars),
    };
  }

  private assertAccess(schoolId: string | null, user: CurrentUser) {
    if (user.role === 'SUPER_ADMIN') return;
    if (schoolId && schoolId !== user.schoolId) {
      throw new ForbiddenException('Template belongs to another school');
    }
  }
}
