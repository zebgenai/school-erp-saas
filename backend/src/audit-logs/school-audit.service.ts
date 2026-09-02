import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { computeChangedFields } from '../common/utils/diff-fields';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogEntry {
  schoolId: string;
  userId?: string;
  actorName?: string;
  action: string;
  entity?: string;
  entityId?: string;
  description?: string;
  details?: Record<string, unknown>;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  changedFields?: string[];
  ipAddress?: string;
  userAgent?: string;
  dedupeKey?: string;
}

@Injectable()
export class SchoolAuditService {
  constructor(private prisma: PrismaService) {}

  async log(entry: AuditLogEntry) {
    const changedFields =
      entry.changedFields ??
      computeChangedFields(entry.oldValue, entry.newValue);

    const data: Prisma.SchoolAuditLogCreateInput = {
      school: { connect: { id: entry.schoolId } },
      ...(entry.userId ? { user: { connect: { id: entry.userId } } } : {}),
      actorName: entry.actorName,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      description: entry.description,
      details: entry.details as Prisma.InputJsonValue,
      oldValue: entry.oldValue as Prisma.InputJsonValue,
      newValue: entry.newValue as Prisma.InputJsonValue,
      changedFields: changedFields.length ? changedFields : undefined,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      dedupeKey: entry.dedupeKey,
    };

    if (entry.dedupeKey) {
      const existing = await this.prisma.schoolAuditLog.findUnique({
        where: { schoolId_dedupeKey: { schoolId: entry.schoolId, dedupeKey: entry.dedupeKey } },
      });
      if (existing) return existing;
    }

    try {
      return await this.prisma.schoolAuditLog.create({ data });
    } catch (err: unknown) {
      if (
        entry.dedupeKey &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return this.prisma.schoolAuditLog.findUniqueOrThrow({
          where: { schoolId_dedupeKey: { schoolId: entry.schoolId, dedupeKey: entry.dedupeKey } },
        });
      }
      throw err;
    }
  }

  async findBySchool(
    schoolId: string,
    opts?: {
      limit?: number;
      skip?: number;
      action?: string;
      entity?: string;
      entityId?: string;
      userId?: string;
      search?: string;
      from?: Date;
      to?: Date;
    },
  ) {
    const where: Prisma.SchoolAuditLogWhereInput = { schoolId };
    if (opts?.action) where.action = { contains: opts.action, mode: 'insensitive' };
    if (opts?.entity) where.entity = opts.entity;
    if (opts?.entityId) where.entityId = opts.entityId;
    if (opts?.userId) where.userId = opts.userId;
    if (opts?.from || opts?.to) {
      where.createdAt = {};
      if (opts.from) where.createdAt.gte = opts.from;
      if (opts.to) where.createdAt.lte = opts.to;
    }
    if (opts?.search) {
      where.OR = [
        { action: { contains: opts.search, mode: 'insensitive' } },
        { entity: { contains: opts.search, mode: 'insensitive' } },
        { description: { contains: opts.search, mode: 'insensitive' } },
        { actorName: { contains: opts.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.schoolAuditLog.findMany({
        where,
        include: { user: { select: { name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take: opts?.limit ?? 50,
        skip: opts?.skip ?? 0,
      }),
      this.prisma.schoolAuditLog.count({ where }),
    ]);

    return { items, total };
  }

  async getTimeline(entity: string, entityId: string, schoolId: string, limit = 50) {
    return this.prisma.schoolAuditLog.findMany({
      where: { schoolId, entity, entityId },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getRecent(schoolId: string, from: Date, limit = 20) {
    return this.prisma.schoolAuditLog.findMany({
      where: { schoolId, createdAt: { gte: from } },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
