import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { SchoolAuditService } from '../audit-logs/school-audit.service';
import { CurrentUser } from '../common/types/current-user.type';

const ACTION_ICONS: Record<string, string> = {
  STUDENT_CREATED: 'user-plus',
  STUDENT_UPDATED: 'user-cog',
  STUDENT_DELETED: 'user-x',
  STUDENT_ARCHIVED: 'archive',
  FEE_INVOICE_GENERATED: 'receipt',
  FEE_PAID: 'wallet',
  PAYROLL_GENERATED: 'banknote',
  PAYROLL_PAID: 'check-circle',
  ATTENDANCE_SUBMITTED: 'calendar-check',
  EXAM_CREATED: 'clipboard-list',
  EXAM_RESULT_PUBLISHED: 'graduation-cap',
  LIBRARY_BOOK_ISSUED: 'book-open',
  LIBRARY_BOOK_RETURNED: 'book',
  TRANSPORT_ASSIGNMENT_CHANGED: 'bus',
  DOCUMENT_UPLOADED: 'upload',
  DOCUMENT_DELETED: 'trash',
  PASSWORD_RESET: 'key',
  NEW_TEACHER: 'user-cog',
  NEW_STAFF: 'briefcase',
  NEW_PARENT: 'users',
  NEW_USER: 'user-plus',
  SCHOOL_ACTIVATED: 'building',
  SCHOOL_SUSPENDED: 'building',
  PLAN_CHANGED: 'credit-card',
};

@Injectable()
export class ActivityService {
  constructor(private readonly schoolAudit: SchoolAuditService) {}

  assertSchoolAccess(user: CurrentUser, schoolId: string) {
    if (user.role === UserRole.SUPER_ADMIN) return;
    if (user.schoolId !== schoolId) {
      throw new ForbiddenException('Not authorized for this school');
    }
  }

  resolveSchoolId(user: CurrentUser, schoolId?: string) {
    if (user.role === UserRole.SUPER_ADMIN) {
      if (!schoolId) throw new ForbiddenException('schoolId required');
      return schoolId;
    }
    if (!user.schoolId) throw new ForbiddenException('School context required');
    return user.schoolId;
  }

  async getTimeline(
    user: CurrentUser,
    entity: string,
    entityId: string,
    schoolId?: string,
    limit = 50,
  ) {
    const sid = this.resolveSchoolId(user, schoolId);
    const logs = await this.schoolAudit.getTimeline(entity, entityId, sid, limit);
    return logs.map((log) => this.toTimelineItem(log));
  }

  async getRecent(
    user: CurrentUser,
    period: 'today' | 'week' | 'month' = 'week',
    limit = 20,
    schoolId?: string,
  ) {
    const sid = this.resolveSchoolId(user, schoolId);
    const from = this.periodStart(period);
    const logs = await this.schoolAudit.getRecent(sid, from, limit);
    return logs.map((log) => this.toTimelineItem(log));
  }

  private periodStart(period: 'today' | 'week' | 'month'): Date {
    const now = new Date();
    if (period === 'today') {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    if (period === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return d;
  }

  private toTimelineItem(log: {
    id: string;
    action: string;
    entity: string | null;
    entityId: string | null;
    description: string | null;
    actorName: string | null;
    createdAt: Date;
    details: unknown;
    user: { name: string; email: string; role: string } | null;
  }) {
    const actor = log.actorName ?? log.user?.name ?? 'System';
    const description =
      log.description ??
      (typeof log.details === 'object' && log.details && 'summary' in (log.details as object)
        ? String((log.details as { summary: string }).summary)
        : `${log.action.replace(/_/g, ' ').toLowerCase()}`);

    return {
      id: log.id,
      icon: ACTION_ICONS[log.action] ?? 'activity',
      action: log.action.replace(/_/g, ' '),
      user: actor,
      timestamp: log.createdAt,
      description,
      entity: log.entity,
      entityId: log.entityId,
    };
  }
}
