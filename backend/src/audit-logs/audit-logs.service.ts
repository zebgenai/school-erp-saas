import { Injectable } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface LogAuditInput {
  action: AuditAction;
  actorId?: string;
  actorName?: string;
  schoolId?: string;
  schoolName?: string;
  metadata?: Record<string, any>;
  ip?: string;
}

@Injectable()
export class AuditLogsService {
  constructor(private prisma: PrismaService) {}

  async log(input: LogAuditInput) {
    return this.prisma.auditLog.create({
      data: {
        action: input.action,
        actorId: input.actorId,
        actorName: input.actorName,
        schoolId: input.schoolId,
        schoolName: input.schoolName,
        metadata: input.metadata ?? {},
        ip: input.ip,
      },
    });
  }

  async findAll(opts: {
    schoolId?: string;
    action?: AuditAction;
    limit?: number;
    skip?: number;
  }) {
    const where: any = {};
    if (opts.schoolId) where.schoolId = opts.schoolId;
    if (opts.action) where.action = opts.action;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: opts.limit ?? 50,
        skip: opts.skip ?? 0,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, limit: opts.limit ?? 50, skip: opts.skip ?? 0 };
  }
}
