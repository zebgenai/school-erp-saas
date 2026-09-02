import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEngineService } from '../notifications/notification-engine.service';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { NoticeQueryDto } from './dto/notice-query.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';

const noticeInclude = {
  createdBy: { select: { id: true, name: true, role: true } },
} satisfies Prisma.NoticeInclude;

@Injectable()
export class CommunicationService {
  constructor(
    private prisma: PrismaService,
    private readonly notificationEngine: NotificationEngineService,
  ) {}

  async findAll(currentUser: CurrentUser, query: NoticeQueryDto) {
    const where: Prisma.NoticeWhereInput = {
      ...this.buildSchoolFilter(currentUser, query.schoolId),
      ...(query.type ? { type: query.type } : {}),
      ...(query.isPublished !== undefined ? { isPublished: query.isPublished } : {}),
    };

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { content: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {
        ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { lte: new Date(`${query.endDate}T23:59:59.999Z`) } : {}),
      };
    }

    return this.prisma.notice.findMany({
      where,
      include: noticeInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, currentUser: CurrentUser) {
    const notice = await this.findNoticeOrThrow(id);
    this.assertSchoolAccess(currentUser, notice.schoolId);
    return notice;
  }

  async create(dto: CreateNoticeDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);

    return this.prisma.notice.create({
      data: {
        schoolId,
        title: dto.title,
        content: dto.content,
        type: dto.type ?? 'NOTICE',
        targetRoles: dto.targetRoles ?? 'ALL',
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        isPublished: dto.isPublished ?? false,
        attachmentUrl: dto.attachmentUrl,
        createdById: currentUser.id,
      },
      include: noticeInclude,
    });
  }

  async update(id: string, dto: UpdateNoticeDto, currentUser: CurrentUser) {
    const notice = await this.findNoticeOrThrow(id);
    this.assertSchoolAccess(currentUser, notice.schoolId);

    return this.prisma.notice.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.targetRoles !== undefined ? { targetRoles: dto.targetRoles } : {}),
        ...(dto.startDate !== undefined ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate !== undefined ? { endDate: new Date(dto.endDate) } : {}),
        ...(dto.isPublished !== undefined ? { isPublished: dto.isPublished } : {}),
        ...(dto.attachmentUrl !== undefined ? { attachmentUrl: dto.attachmentUrl } : {}),
      },
      include: noticeInclude,
    });
  }

  async publish(id: string, currentUser: CurrentUser) {
    const notice = await this.findNoticeOrThrow(id);
    this.assertSchoolAccess(currentUser, notice.schoolId);

    if (notice.isPublished) throw new BadRequestException('Notice is already published');

    const published = await this.prisma.notice.update({
      where: { id },
      data: { isPublished: true },
      include: noticeInclude,
    });

    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitNewAnnouncement(published.schoolId, published.id),
    );

    return published;
  }

  async unpublish(id: string, currentUser: CurrentUser) {
    const notice = await this.findNoticeOrThrow(id);
    this.assertSchoolAccess(currentUser, notice.schoolId);

    return this.prisma.notice.update({
      where: { id },
      data: { isPublished: false },
      include: noticeInclude,
    });
  }

  async remove(id: string, currentUser: CurrentUser) {
    const notice = await this.findNoticeOrThrow(id);
    this.assertSchoolAccess(currentUser, notice.schoolId);
    return this.prisma.notice.delete({ where: { id } });
  }

  async getStats(currentUser: CurrentUser, schoolId?: string) {
    const filter = this.buildSchoolFilter(currentUser, schoolId);

    const [total, published, notices, announcements, events] = await Promise.all([
      this.prisma.notice.count({ where: filter }),
      this.prisma.notice.count({ where: { ...filter, isPublished: true } }),
      this.prisma.notice.count({ where: { ...filter, type: 'NOTICE' } }),
      this.prisma.notice.count({ where: { ...filter, type: 'ANNOUNCEMENT' } }),
      this.prisma.notice.count({ where: { ...filter, type: 'EVENT' } }),
    ]);

    return { total, published, unpublished: total - published, notices, announcements, events };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async findNoticeOrThrow(id: string) {
    const notice = await this.prisma.notice.findUnique({ where: { id }, include: noticeInclude });
    if (!notice) throw new NotFoundException('Notice not found');
    return notice;
  }

  private resolveSchoolId(currentUser: CurrentUser, schoolId?: string): string {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      if (!schoolId) throw new BadRequestException('schoolId is required');
      return schoolId;
    }
    if (!currentUser.schoolId) throw new ForbiddenException('School context missing');
    if (schoolId && schoolId !== currentUser.schoolId) {
      throw new ForbiddenException("Cannot access another school's data");
    }
    return currentUser.schoolId;
  }

  private buildSchoolFilter(currentUser: CurrentUser, schoolId?: string) {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      return schoolId ? { schoolId } : {};
    }
    if (!currentUser.schoolId) throw new ForbiddenException('School context missing');
    if (schoolId && schoolId !== currentUser.schoolId) {
      throw new ForbiddenException("Cannot access another school's data");
    }
    return { schoolId: currentUser.schoolId };
  }

  private assertSchoolAccess(currentUser: CurrentUser, resourceSchoolId: string) {
    if (currentUser.role === UserRole.SUPER_ADMIN) return;
    if (!currentUser.schoolId) throw new ForbiddenException('School context missing');
    if (currentUser.schoolId !== resourceSchoolId) {
      throw new ForbiddenException("Cannot access another school's data");
    }
  }
}
