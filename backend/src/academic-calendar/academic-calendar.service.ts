import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AcademicCalendarEvent,
  CalendarEventStatus,
  CalendarEventType,
  CalendarRecurrence,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolAuditService } from '../audit-logs/school-audit.service';
import { NotificationEngineService } from '../notifications/notification-engine.service';
import { CurrentUser } from '../common/types/current-user.type';
import {
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
  VISIBILITY_AUDIENCES,
  VisibilityAudience,
} from './dto/academic-calendar.dto';

/** Where a feed entry came from. Derived sources are computed, never stored. */
export type CalendarSource =
  | 'MANUAL'
  | 'EXAM'
  | 'HOMEWORK'
  | 'ONLINE_CLASS'
  | 'FEE';

export interface CalendarFeedItem {
  id: string;
  sourceId: string;
  source: CalendarSource;
  title: string;
  description: string | null;
  eventType: CalendarEventType;
  status: CalendarEventStatus;
  academicSession: string | null;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  colorLabel: string;
  recurrence: CalendarRecurrence;
  classId: string | null;
  className: string | null;
  sectionId: string | null;
  sectionName: string | null;
  teacherId: string | null;
  teacherName: string | null;
  visibility: VisibilityAudience[];
  editable: boolean;
  linkUrl: string | null;
}

interface FeedFilters {
  from?: string;
  to?: string;
  classId?: string;
  sectionId?: string;
  teacherId?: string;
  eventType?: CalendarEventType;
  academicSession?: string;
  includeDerived?: boolean;
}

/** Fallback colour per event type so the calendar always renders consistently. */
export const EVENT_TYPE_COLORS: Record<CalendarEventType, string> = {
  ACADEMIC_SESSION: '#6366f1',
  HOLIDAY: '#ef4444',
  SCHOOL_EVENT: '#0ea5e9',
  SPORTS_DAY: '#f97316',
  ANNUAL_FUNCTION: '#a855f7',
  PTM: '#14b8a6',
  EXAM_SCHEDULE: '#dc2626',
  RESULT_DAY: '#16a34a',
  FEE_DUE_DATE: '#eab308',
  ADMISSION_DEADLINE: '#8b5cf6',
  TEACHER_MEETING: '#0891b2',
  STAFF_MEETING: '#64748b',
  HOMEWORK_DEADLINE: '#f59e0b',
  ONLINE_CLASS: '#3b82f6',
  CUSTOM: '#475569',
};

export const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  ACADEMIC_SESSION: 'Academic Session',
  HOLIDAY: 'Holiday',
  SCHOOL_EVENT: 'School Event',
  SPORTS_DAY: 'Sports Day',
  ANNUAL_FUNCTION: 'Annual Function',
  PTM: 'Parent Teacher Meeting',
  EXAM_SCHEDULE: 'Exam Schedule',
  RESULT_DAY: 'Result Day',
  FEE_DUE_DATE: 'Fee Due Date',
  ADMISSION_DEADLINE: 'Admission Deadline',
  TEACHER_MEETING: 'Teacher Meeting',
  STAFF_MEETING: 'Staff Meeting',
  HOMEWORK_DEADLINE: 'Homework Deadline',
  ONLINE_CLASS: 'Online Class',
  CUSTOM: 'Custom Event',
};

const MAX_OCCURRENCES = 400;

type EventWithRelations = AcademicCalendarEvent & {
  class?: { id: string; name: string } | null;
  section?: { id: string; name: string } | null;
  teacher?: { id: string; fullName: string } | null;
};

/** Audience scope derived from the caller's role — drives visibility + row filtering. */
interface AudienceScope {
  audience: VisibilityAudience;
  isAdmin: boolean;
  classIds?: string[];
  sectionIds?: string[];
  teacherId?: string;
  studentIds?: string[];
}

@Injectable()
export class AcademicCalendarService {
  constructor(
    private prisma: PrismaService,
    private schoolAudit: SchoolAuditService,
    private notifications: NotificationEngineService,
  ) {}

  // ─── Metadata ──────────────────────────────────────────────────────────────

  eventTypes() {
    return {
      eventTypes: (Object.keys(EVENT_TYPE_LABELS) as CalendarEventType[]).map((value) => ({
        value,
        label: EVENT_TYPE_LABELS[value],
        color: EVENT_TYPE_COLORS[value],
      })),
      recurrences: Object.values(CalendarRecurrence),
      statuses: Object.values(CalendarEventStatus),
      visibilityAudiences: [...VISIBILITY_AUDIENCES],
    };
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async findAll(
    user: CurrentUser,
    query: {
      classId?: string;
      sectionId?: string;
      teacherId?: string;
      eventType?: CalendarEventType;
      status?: CalendarEventStatus;
      academicSession?: string;
      from?: string;
      to?: string;
      search?: string;
      limit: number;
      offset: number;
    },
  ) {
    const where: Prisma.AcademicCalendarEventWhereInput = {
      ...this.buildSchoolFilter(user),
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.teacherId ? { teacherId: query.teacherId } : {}),
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.academicSession ? { academicSession: query.academicSession } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' as const } },
              { description: { contains: query.search, mode: 'insensitive' as const } },
              { location: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...this.dateRangeFilter(query.from, query.to),
    };

    const [items, total] = await Promise.all([
      this.prisma.academicCalendarEvent.findMany({
        where,
        include: this.relationInclude(),
        orderBy: [{ startDate: 'asc' }, { createdAt: 'desc' }],
        take: Math.min(Math.max(query.limit, 1), 200),
        skip: Math.max(query.offset, 0),
      }),
      this.prisma.academicCalendarEvent.count({ where }),
    ]);

    return {
      items: items.map((e) => this.serialize(e as EventWithRelations)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async findOne(id: string, user: CurrentUser) {
    const event = await this.prisma.academicCalendarEvent.findUnique({
      where: { id },
      include: this.relationInclude(),
    });
    if (!event) throw new NotFoundException('Calendar event not found');
    this.assertSchoolAccess(user, event.schoolId);
    return this.serialize(event as EventWithRelations);
  }

  async create(dto: CreateCalendarEventDto, user: CurrentUser) {
    const schoolId = this.resolveSchoolId(user, dto.schoolId);

    const startDate = this.parseDate(dto.startDate, 'startDate');
    const endDate = this.parseDate(dto.endDate, 'endDate');
    const recurrence = dto.recurrence ?? CalendarRecurrence.NONE;
    const recurrenceUntil = dto.recurrenceUntil
      ? this.parseDate(dto.recurrenceUntil, 'recurrenceUntil')
      : null;
    const allDay = dto.allDay ?? true;

    this.validateDates(startDate, endDate, dto.startTime, dto.endTime, allDay);
    this.validateRecurrence(recurrence, startDate, endDate, recurrenceUntil);

    if (dto.classId) await this.assertClassBelongsToSchool(dto.classId, schoolId);
    if (dto.sectionId)
      await this.assertSectionBelongsToSchool(dto.sectionId, schoolId, dto.classId);
    if (dto.teacherId) await this.assertTeacherBelongsToSchool(dto.teacherId, schoolId);

    await this.assertNoDuplicate(schoolId, {
      title: dto.title,
      eventType: dto.eventType,
      startDate,
      endDate,
      classId: dto.classId ?? null,
      sectionId: dto.sectionId ?? null,
    });

    const event = await this.prisma.academicCalendarEvent.create({
      data: {
        schoolId,
        title: dto.title.trim(),
        description: dto.description ?? null,
        eventType: dto.eventType,
        academicSession: dto.academicSession ?? null,
        classId: dto.classId ?? null,
        sectionId: dto.sectionId ?? null,
        teacherId: dto.teacherId ?? null,
        startDate,
        endDate,
        startTime: allDay ? null : (dto.startTime ?? null),
        endTime: allDay ? null : (dto.endTime ?? null),
        allDay,
        location: dto.location ?? null,
        colorLabel: dto.colorLabel ?? EVENT_TYPE_COLORS[dto.eventType],
        recurrence,
        recurrenceUntil,
        visibility: this.serializeVisibility(dto.visibility),
        status: dto.status ?? CalendarEventStatus.DRAFT,
        createdById: user.id,
      },
      include: this.relationInclude(),
    });

    await this.schoolAudit.log({
      schoolId,
      userId: user.id,
      actorName: user.name,
      action: 'CALENDAR_EVENT_CREATED',
      entity: 'AcademicCalendarEvent',
      entityId: event.id,
      description: `Calendar event created: ${event.title}`,
      details: {
        eventType: event.eventType,
        startDate: event.startDate,
        endDate: event.endDate,
        status: event.status,
      },
    });

    if (event.status === CalendarEventStatus.PUBLISHED) {
      this.notifyPublished(event as EventWithRelations);
    }

    return this.serialize(event as EventWithRelations);
  }

  async update(id: string, dto: UpdateCalendarEventDto, user: CurrentUser) {
    const existing = await this.prisma.academicCalendarEvent.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Calendar event not found');
    this.assertSchoolAccess(user, existing.schoolId);

    const schoolId = existing.schoolId;
    const startDate =
      dto.startDate !== undefined ? this.parseDate(dto.startDate, 'startDate') : existing.startDate;
    const endDate =
      dto.endDate !== undefined ? this.parseDate(dto.endDate, 'endDate') : existing.endDate;
    const allDay = dto.allDay ?? existing.allDay;
    const recurrence = dto.recurrence ?? existing.recurrence;
    const recurrenceUntil =
      dto.recurrenceUntil === undefined
        ? existing.recurrenceUntil
        : dto.recurrenceUntil === null
          ? null
          : this.parseDate(dto.recurrenceUntil, 'recurrenceUntil');

    const startTime = dto.startTime !== undefined ? dto.startTime : existing.startTime;
    const endTime = dto.endTime !== undefined ? dto.endTime : existing.endTime;

    this.validateDates(startDate, endDate, startTime, endTime, allDay);
    this.validateRecurrence(recurrence, startDate, endDate, recurrenceUntil);

    const classId = dto.classId !== undefined ? dto.classId : existing.classId;
    const sectionId = dto.sectionId !== undefined ? dto.sectionId : existing.sectionId;
    const teacherId = dto.teacherId !== undefined ? dto.teacherId : existing.teacherId;

    if (classId) await this.assertClassBelongsToSchool(classId, schoolId);
    if (sectionId)
      await this.assertSectionBelongsToSchool(sectionId, schoolId, classId ?? undefined);
    if (teacherId) await this.assertTeacherBelongsToSchool(teacherId, schoolId);

    const event = await this.prisma.academicCalendarEvent.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.eventType !== undefined ? { eventType: dto.eventType } : {}),
        ...(dto.academicSession !== undefined ? { academicSession: dto.academicSession } : {}),
        ...(dto.classId !== undefined ? { classId: dto.classId } : {}),
        ...(dto.sectionId !== undefined ? { sectionId: dto.sectionId } : {}),
        ...(dto.teacherId !== undefined ? { teacherId: dto.teacherId } : {}),
        ...(dto.startDate !== undefined ? { startDate } : {}),
        ...(dto.endDate !== undefined ? { endDate } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.colorLabel !== undefined ? { colorLabel: dto.colorLabel } : {}),
        ...(dto.recurrence !== undefined ? { recurrence } : {}),
        ...(dto.recurrenceUntil !== undefined ? { recurrenceUntil } : {}),
        ...(dto.visibility !== undefined
          ? { visibility: this.serializeVisibility(dto.visibility) }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        allDay,
        startTime: allDay ? null : startTime,
        endTime: allDay ? null : endTime,
      },
      include: this.relationInclude(),
    });

    const cancelled =
      dto.status === CalendarEventStatus.CANCELLED &&
      existing.status !== CalendarEventStatus.CANCELLED;
    const published =
      dto.status === CalendarEventStatus.PUBLISHED &&
      existing.status !== CalendarEventStatus.PUBLISHED;

    await this.schoolAudit.log({
      schoolId,
      userId: user.id,
      actorName: user.name,
      action: cancelled
        ? 'CALENDAR_EVENT_CANCELLED'
        : published
          ? 'CALENDAR_EVENT_PUBLISHED'
          : 'CALENDAR_EVENT_UPDATED',
      entity: 'AcademicCalendarEvent',
      entityId: event.id,
      description: `Calendar event ${cancelled ? 'cancelled' : published ? 'published' : 'updated'}: ${event.title}`,
      oldValue: { status: existing.status, startDate: existing.startDate, title: existing.title },
      newValue: { status: event.status, startDate: event.startDate, title: event.title },
    });

    if (cancelled) {
      this.notifyCancelled(event as EventWithRelations);
    } else if (published) {
      this.notifyPublished(event as EventWithRelations);
    } else if (event.status === CalendarEventStatus.PUBLISHED) {
      this.notifyUpdated(event as EventWithRelations);
    }

    return this.serialize(event as EventWithRelations);
  }

  async publish(id: string, user: CurrentUser) {
    return this.update(id, { status: CalendarEventStatus.PUBLISHED }, user);
  }

  async cancel(id: string, user: CurrentUser) {
    return this.update(id, { status: CalendarEventStatus.CANCELLED }, user);
  }

  async remove(id: string, user: CurrentUser) {
    const existing = await this.prisma.academicCalendarEvent.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Calendar event not found');
    this.assertSchoolAccess(user, existing.schoolId);

    await this.prisma.academicCalendarEvent.delete({ where: { id } });

    await this.schoolAudit.log({
      schoolId: existing.schoolId,
      userId: user.id,
      actorName: user.name,
      action: 'CALENDAR_EVENT_DELETED',
      entity: 'AcademicCalendarEvent',
      entityId: id,
      description: `Calendar event deleted: ${existing.title}`,
      oldValue: { title: existing.title, eventType: existing.eventType },
    });

    return { success: true };
  }

  // ─── Unified feed (month / week / day / agenda views) ───────────────────────

  async feed(user: CurrentUser, filters: FeedFilters): Promise<{ events: CalendarFeedItem[] }> {
    const schoolId = this.resolveSchoolIdForRead(user);
    if (!schoolId) return { events: [] };

    const { from, to } = this.resolveWindow(filters.from, filters.to);
    const scope = await this.buildAudienceScope(user, schoolId);

    const manual = await this.manualFeed(schoolId, from, to, scope, filters);
    const derived =
      filters.includeDerived === false
        ? []
        : await this.derivedFeed(schoolId, from, to, scope, filters);

    const events = [...manual, ...derived].sort((a, b) => {
      const diff = a.startDate.localeCompare(b.startDate);
      if (diff !== 0) return diff;
      return (a.startTime ?? '').localeCompare(b.startTime ?? '');
    });

    return { events };
  }

  async upcoming(user: CurrentUser, limit = 5) {
    const now = new Date();
    const to = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const { events } = await this.feed(user, {
      from: now.toISOString(),
      to: to.toISOString(),
    });
    const todayKey = this.dateKey(now);
    return {
      events: events.filter((e) => e.endDate >= todayKey).slice(0, Math.min(limit, 50)),
    };
  }

  async widgets(user: CurrentUser) {
    const schoolId = this.resolveSchoolIdForRead(user);
    if (!schoolId) {
      return { todayEvents: 0, upcomingEvents: 0, holidaysThisMonth: 0, totalEvents: 0, next: null };
    }

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
    const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    const { events } = await this.feed(user, {
      from: monthStart.toISOString(),
      to: in60.toISOString(),
    });

    const todayKey = this.dateKey(now);
    const monthEndKey = this.dateKey(monthEnd);

    const todayEvents = events.filter((e) => e.startDate <= todayKey && e.endDate >= todayKey);
    const upcomingEvents = events.filter((e) => e.startDate > todayKey);
    const holidaysThisMonth = events.filter(
      (e) => e.eventType === CalendarEventType.HOLIDAY && e.startDate <= monthEndKey,
    );

    return {
      todayEvents: todayEvents.length,
      upcomingEvents: upcomingEvents.length,
      holidaysThisMonth: holidaysThisMonth.length,
      totalEvents: events.length,
      next: upcomingEvents[0] ?? todayEvents[0] ?? null,
      today: todayEvents.slice(0, 5),
      upcoming: upcomingEvents.slice(0, 5),
    };
  }

  // ─── Reports ───────────────────────────────────────────────────────────────

  async reports(
    user: CurrentUser,
    query: {
      report?: string;
      month?: string;
      year?: string;
      from?: string;
      to?: string;
      classId?: string;
      sectionId?: string;
      teacherId?: string;
      eventType?: CalendarEventType;
      academicSession?: string;
    },
  ) {
    const report = query.report ?? 'events';
    const now = new Date();
    const year = query.year ? parseInt(query.year, 10) : now.getUTCFullYear();
    const month = query.month ? parseInt(query.month, 10) - 1 : now.getUTCMonth();

    let from: string;
    let to: string;
    if (query.from && query.to) {
      from = query.from;
      to = query.to;
    } else if (report === 'holidays' || report === 'events') {
      from = new Date(Date.UTC(year, 0, 1)).toISOString();
      to = new Date(Date.UTC(year, 11, 31, 23, 59, 59)).toISOString();
    } else {
      from = new Date(Date.UTC(year, month, 1)).toISOString();
      to = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59)).toISOString();
    }

    const { events } = await this.feed(user, {
      from,
      to,
      classId: query.classId,
      sectionId: query.sectionId,
      teacherId: query.teacherId,
      eventType: query.eventType,
      academicSession: query.academicSession,
    });

    let filtered = events;
    if (report === 'holidays') {
      filtered = events.filter((e) => e.eventType === CalendarEventType.HOLIDAY);
    } else if (report === 'teacher') {
      filtered = query.teacherId ? events.filter((e) => e.teacherId === query.teacherId) : events;
    }

    const byType: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    for (const e of filtered) {
      byType[e.eventType] = (byType[e.eventType] ?? 0) + 1;
      const key = e.startDate.slice(0, 7);
      byMonth[key] = (byMonth[key] ?? 0) + 1;
    }

    return {
      report,
      range: { from, to },
      total: filtered.length,
      byType: Object.entries(byType).map(([eventType, count]) => ({
        eventType,
        label: EVENT_TYPE_LABELS[eventType as CalendarEventType] ?? eventType,
        count,
      })),
      byMonth: Object.entries(byMonth)
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      items: filtered,
    };
  }

  // ─── Feed builders ─────────────────────────────────────────────────────────

  private async manualFeed(
    schoolId: string,
    from: Date,
    to: Date,
    scope: AudienceScope,
    filters: FeedFilters,
  ): Promise<CalendarFeedItem[]> {
    const and: Prisma.AcademicCalendarEventWhereInput[] = [
      // Recurring events can start long before the window, so they are always considered.
      {
        OR: [
          { recurrence: { not: CalendarRecurrence.NONE } },
          { AND: [{ startDate: { lte: to } }, { endDate: { gte: from } }] },
        ],
      },
    ];
    // Class/section filters keep school-wide events (null class/section) in the result.
    if (filters.classId) {
      and.push({ OR: [{ classId: filters.classId }, { classId: null }] });
    }
    if (filters.sectionId) {
      and.push({ OR: [{ sectionId: filters.sectionId }, { sectionId: null }] });
    }

    const where: Prisma.AcademicCalendarEventWhereInput = {
      schoolId,
      ...(scope.isAdmin
        ? {}
        : { status: { in: [CalendarEventStatus.PUBLISHED, CalendarEventStatus.CANCELLED] } }),
      ...(filters.eventType ? { eventType: filters.eventType } : {}),
      ...(filters.academicSession ? { academicSession: filters.academicSession } : {}),
      ...(filters.teacherId ? { teacherId: filters.teacherId } : {}),
      AND: and,
    };

    const rows = (await this.prisma.academicCalendarEvent.findMany({
      where,
      include: this.relationInclude(),
      orderBy: { startDate: 'asc' },
      take: 1000,
    })) as EventWithRelations[];

    const items: CalendarFeedItem[] = [];
    for (const row of rows) {
      if (!this.isVisibleTo(row, scope)) continue;
      if (!this.matchesAudienceScope(row.classId, row.sectionId, row.teacherId, scope)) continue;

      for (const occ of this.expandRecurrence(row, from, to)) {
        items.push({
          ...this.serialize(row),
          id: occ.index === 0 ? row.id : `${row.id}::${occ.index}`,
          sourceId: row.id,
          startDate: this.dateKey(occ.start),
          endDate: this.dateKey(occ.end),
        });
      }
    }
    return items;
  }

  private async derivedFeed(
    schoolId: string,
    from: Date,
    to: Date,
    scope: AudienceScope,
    filters: FeedFilters,
  ): Promise<CalendarFeedItem[]> {
    const wants = (type: CalendarEventType) => !filters.eventType || filters.eventType === type;
    const classFilter = this.derivedClassFilter(scope, filters);

    const [exams, homeworks, onlineClasses, invoices] = await Promise.all([
      wants(CalendarEventType.EXAM_SCHEDULE)
        ? this.prisma.exam.findMany({
            where: {
              schoolId,
              status: { in: ['ACTIVE', 'COMPLETED'] },
              startDate: { not: null, lte: to },
              OR: [{ endDate: { gte: from } }, { endDate: null, startDate: { gte: from } }],
              ...classFilter,
            },
            include: { class: true, section: true },
            take: 300,
          })
        : Promise.resolve([]),
      wants(CalendarEventType.HOMEWORK_DEADLINE)
        ? this.prisma.homework.findMany({
            where: {
              schoolId,
              status: { in: ['PUBLISHED', 'CLOSED'] },
              dueDate: { gte: from, lte: to },
              ...classFilter,
              ...(filters.teacherId ? { teacherId: filters.teacherId } : {}),
              ...(scope.teacherId && !scope.isAdmin ? { teacherId: scope.teacherId } : {}),
            },
            include: { class: true, section: true, teacher: true },
            take: 300,
          })
        : Promise.resolve([]),
      wants(CalendarEventType.ONLINE_CLASS)
        ? this.prisma.onlineClass.findMany({
            where: {
              schoolId,
              startAt: { gte: from, lte: to },
              ...classFilter,
              ...(filters.teacherId ? { teacherId: filters.teacherId } : {}),
              ...(scope.teacherId && !scope.isAdmin ? { teacherId: scope.teacherId } : {}),
            },
            include: { class: true, section: true, teacher: true },
            take: 300,
          })
        : Promise.resolve([]),
      wants(CalendarEventType.FEE_DUE_DATE)
        ? this.prisma.feeInvoice.findMany({
            where: {
              schoolId,
              dueDate: { gte: from, lte: to },
              status: { in: ['UNPAID', 'PARTIAL'] },
              ...(scope.studentIds ? { studentId: { in: scope.studentIds } } : {}),
            },
            select: { id: true, dueDate: true, totalAmount: true, paidAmount: true },
            take: 2000,
          })
        : Promise.resolve([]),
    ]);

    const items: CalendarFeedItem[] = [];

    for (const exam of exams) {
      const start = exam.startDate!;
      const end = exam.endDate ?? exam.startDate!;
      items.push(
        this.derivedItem({
          source: 'EXAM',
          sourceId: exam.id,
          title: exam.name,
          description: exam.description,
          eventType: CalendarEventType.EXAM_SCHEDULE,
          start,
          end,
          classId: exam.classId,
          className: exam.class?.name ?? null,
          sectionId: exam.sectionId,
          sectionName: exam.section?.name ?? null,
          linkUrl: '/exams',
        }),
      );
    }

    for (const hw of homeworks) {
      items.push(
        this.derivedItem({
          source: 'HOMEWORK',
          sourceId: hw.id,
          title: hw.title,
          description: hw.description,
          eventType: CalendarEventType.HOMEWORK_DEADLINE,
          start: hw.dueDate,
          end: hw.dueDate,
          classId: hw.classId,
          className: hw.class?.name ?? null,
          sectionId: hw.sectionId,
          sectionName: hw.section?.name ?? null,
          teacherId: hw.teacherId,
          teacherName: hw.teacher?.fullName ?? null,
          academicSession: hw.academicSession,
          linkUrl: '/homework',
        }),
      );
    }

    for (const oc of onlineClasses) {
      items.push(
        this.derivedItem({
          source: 'ONLINE_CLASS',
          sourceId: oc.id,
          title: oc.title,
          description: oc.description,
          eventType: CalendarEventType.ONLINE_CLASS,
          start: oc.scheduledDate,
          end: oc.scheduledDate,
          startTime: oc.startTime,
          endTime: oc.endTime,
          allDay: false,
          classId: oc.classId,
          className: oc.class?.name ?? null,
          sectionId: oc.sectionId,
          sectionName: oc.section?.name ?? null,
          teacherId: oc.teacherId,
          teacherName: oc.teacher?.fullName ?? null,
          status:
            oc.status === 'CANCELLED'
              ? CalendarEventStatus.CANCELLED
              : CalendarEventStatus.PUBLISHED,
          linkUrl: '/online-classes',
        }),
      );
    }

    // Fee invoices collapse into one entry per due date to avoid flooding the grid.
    const byDueDate = new Map<string, { count: number; outstanding: number; date: Date }>();
    for (const inv of invoices) {
      if (!inv.dueDate) continue;
      const key = this.dateKey(inv.dueDate);
      const bucket = byDueDate.get(key) ?? { count: 0, outstanding: 0, date: inv.dueDate };
      bucket.count += 1;
      bucket.outstanding += inv.totalAmount - inv.paidAmount;
      byDueDate.set(key, bucket);
    }
    for (const [key, bucket] of byDueDate) {
      items.push(
        this.derivedItem({
          source: 'FEE',
          sourceId: `fee-${key}`,
          title:
            bucket.count === 1
              ? 'Fee Due'
              : `Fee Due — ${bucket.count} invoices`,
          description: `Outstanding: ${bucket.outstanding}`,
          eventType: CalendarEventType.FEE_DUE_DATE,
          start: bucket.date,
          end: bucket.date,
          linkUrl: '/fees',
        }),
      );
    }

    return items;
  }

  private derivedItem(input: {
    source: CalendarSource;
    sourceId: string;
    title: string;
    description?: string | null;
    eventType: CalendarEventType;
    start: Date;
    end: Date;
    startTime?: string | null;
    endTime?: string | null;
    allDay?: boolean;
    classId?: string | null;
    className?: string | null;
    sectionId?: string | null;
    sectionName?: string | null;
    teacherId?: string | null;
    teacherName?: string | null;
    academicSession?: string | null;
    status?: CalendarEventStatus;
    linkUrl?: string | null;
  }): CalendarFeedItem {
    return {
      id: `${input.source.toLowerCase()}:${input.sourceId}`,
      sourceId: input.sourceId,
      source: input.source,
      title: input.title,
      description: input.description ?? null,
      eventType: input.eventType,
      status: input.status ?? CalendarEventStatus.PUBLISHED,
      academicSession: input.academicSession ?? null,
      startDate: this.dateKey(input.start),
      endDate: this.dateKey(input.end),
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      allDay: input.allDay ?? true,
      location: null,
      colorLabel: EVENT_TYPE_COLORS[input.eventType],
      recurrence: CalendarRecurrence.NONE,
      classId: input.classId ?? null,
      className: input.className ?? null,
      sectionId: input.sectionId ?? null,
      sectionName: input.sectionName ?? null,
      teacherId: input.teacherId ?? null,
      teacherName: input.teacherName ?? null,
      visibility: [...VISIBILITY_AUDIENCES],
      editable: false,
      linkUrl: input.linkUrl ?? null,
    };
  }

  // ─── Recurrence ────────────────────────────────────────────────────────────

  private expandRecurrence(
    event: AcademicCalendarEvent,
    from: Date,
    to: Date,
  ): { start: Date; end: Date; index: number }[] {
    const spanMs = event.endDate.getTime() - event.startDate.getTime();

    if (event.recurrence === CalendarRecurrence.NONE) {
      if (event.startDate <= to && event.endDate >= from) {
        return [{ start: event.startDate, end: event.endDate, index: 0 }];
      }
      return [];
    }

    const limit = event.recurrenceUntil ?? to;
    const occurrences: { start: Date; end: Date; index: number }[] = [];

    for (let i = 0; i < MAX_OCCURRENCES; i++) {
      const start = this.addInterval(event.startDate, event.recurrence, i);
      if (start > to || start > limit) break;
      const end = new Date(start.getTime() + spanMs);
      if (end >= from) occurrences.push({ start, end, index: i });
    }

    return occurrences;
  }

  private addInterval(base: Date, recurrence: CalendarRecurrence, n: number): Date {
    if (n === 0) return base;
    const d = new Date(base.getTime());
    switch (recurrence) {
      case CalendarRecurrence.DAILY:
        d.setUTCDate(d.getUTCDate() + n);
        return d;
      case CalendarRecurrence.WEEKLY:
        d.setUTCDate(d.getUTCDate() + n * 7);
        return d;
      case CalendarRecurrence.MONTHLY:
        d.setUTCMonth(d.getUTCMonth() + n);
        return d;
      case CalendarRecurrence.YEARLY:
        d.setUTCFullYear(d.getUTCFullYear() + n);
        return d;
      default:
        return d;
    }
  }

  /** Minimum gap (ms) between two occurrences, used to reject overlapping recurrences. */
  private recurrenceIntervalMs(recurrence: CalendarRecurrence): number {
    const day = 24 * 60 * 60 * 1000;
    switch (recurrence) {
      case CalendarRecurrence.DAILY:
        return day;
      case CalendarRecurrence.WEEKLY:
        return 7 * day;
      case CalendarRecurrence.MONTHLY:
        return 28 * day;
      case CalendarRecurrence.YEARLY:
        return 365 * day;
      default:
        return 0;
    }
  }

  // ─── Validation ────────────────────────────────────────────────────────────

  private validateDates(
    startDate: Date,
    endDate: Date,
    startTime: string | null | undefined,
    endTime: string | null | undefined,
    allDay: boolean,
  ) {
    if (endDate < startDate) {
      throw new BadRequestException('End date cannot be before start date');
    }
    if (!allDay) {
      if (!startTime || !endTime) {
        throw new BadRequestException('Start time and end time are required for timed events');
      }
      if (this.dateKey(startDate) === this.dateKey(endDate) && endTime <= startTime) {
        throw new BadRequestException('End time must be after start time');
      }
    }
  }

  private validateRecurrence(
    recurrence: CalendarRecurrence,
    startDate: Date,
    endDate: Date,
    recurrenceUntil: Date | null,
  ) {
    if (recurrence === CalendarRecurrence.NONE) {
      if (recurrenceUntil) {
        throw new BadRequestException('Recurrence end date requires a recurrence pattern');
      }
      return;
    }

    if (!recurrenceUntil) {
      throw new BadRequestException('Recurring events require a recurrence end date');
    }
    if (recurrenceUntil < endDate) {
      throw new BadRequestException('Recurrence end date must be on or after the event end date');
    }

    const spanMs = endDate.getTime() - startDate.getTime();
    const intervalMs = this.recurrenceIntervalMs(recurrence);
    if (spanMs >= intervalMs) {
      throw new BadRequestException(
        `A ${recurrence.toLowerCase()} event cannot span longer than its repeat interval`,
      );
    }

    const totalMs = recurrenceUntil.getTime() - startDate.getTime();
    if (totalMs / intervalMs > MAX_OCCURRENCES) {
      throw new BadRequestException(
        `Recurring event would generate more than ${MAX_OCCURRENCES} occurrences`,
      );
    }
  }

  private async assertNoDuplicate(
    schoolId: string,
    input: {
      title: string;
      eventType: CalendarEventType;
      startDate: Date;
      endDate: Date;
      classId: string | null;
      sectionId: string | null;
      excludeId?: string;
    },
  ) {
    const clash = await this.prisma.academicCalendarEvent.findFirst({
      where: {
        schoolId,
        eventType: input.eventType,
        title: { equals: input.title.trim(), mode: 'insensitive' },
        classId: input.classId,
        sectionId: input.sectionId,
        status: { not: CalendarEventStatus.CANCELLED },
        startDate: { lte: input.endDate },
        endDate: { gte: input.startDate },
        ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      },
      select: { id: true, title: true, startDate: true },
    });

    if (clash) {
      throw new BadRequestException(
        `A "${input.title}" event already exists for this audience between ${this.dateKey(input.startDate)} and ${this.dateKey(input.endDate)}`,
      );
    }
  }

  // ─── Notifications ─────────────────────────────────────────────────────────

  private notifyPublished(event: EventWithRelations) {
    this.notifications.dispatch(() =>
      this.notifications.emitCalendarEventPublished(
        event.schoolId,
        event.title,
        EVENT_TYPE_LABELS[event.eventType],
        event.startDate,
        event.classId,
        event.sectionId,
        this.parseVisibility(event.visibility),
      ),
    );
  }

  private notifyUpdated(event: EventWithRelations) {
    this.notifications.dispatch(() =>
      this.notifications.emitCalendarEventUpdated(
        event.schoolId,
        event.title,
        event.startDate,
        event.classId,
        event.sectionId,
        this.parseVisibility(event.visibility),
      ),
    );
  }

  private notifyCancelled(event: EventWithRelations) {
    this.notifications.dispatch(() =>
      this.notifications.emitCalendarEventCancelled(
        event.schoolId,
        event.title,
        event.classId,
        event.sectionId,
        this.parseVisibility(event.visibility),
      ),
    );
  }

  // ─── Scope + visibility ────────────────────────────────────────────────────

  private async buildAudienceScope(
    user: CurrentUser,
    schoolId: string,
  ): Promise<AudienceScope> {
    switch (user.role) {
      case UserRole.SUPER_ADMIN:
      case UserRole.SCHOOL_ADMIN:
        return { audience: 'SCHOOL', isAdmin: true };

      case UserRole.TEACHER: {
        const teacher = await this.prisma.teacher.findFirst({
          where: { userId: user.id, schoolId },
          select: { id: true },
        });
        return { audience: 'TEACHER', isAdmin: false, teacherId: teacher?.id };
      }

      case UserRole.STUDENT: {
        const student = await this.prisma.student.findFirst({
          where: { userId: user.id, schoolId },
          select: { id: true, classId: true, sectionId: true },
        });
        return {
          audience: 'STUDENT',
          isAdmin: false,
          classIds: student?.classId ? [student.classId] : [],
          sectionIds: student?.sectionId ? [student.sectionId] : [],
          studentIds: student ? [student.id] : [],
        };
      }

      case UserRole.PARENT: {
        const parents = await this.prisma.parent.findMany({
          where: { userId: user.id, schoolId },
          select: { student: { select: { id: true, classId: true, sectionId: true } } },
        });
        const students = parents.map((p) => p.student).filter(Boolean) as {
          id: string;
          classId: string | null;
          sectionId: string | null;
        }[];
        return {
          audience: 'PARENT',
          isAdmin: false,
          classIds: students.map((s) => s.classId).filter(Boolean) as string[],
          sectionIds: students.map((s) => s.sectionId).filter(Boolean) as string[],
          studentIds: students.map((s) => s.id),
        };
      }

      default:
        return { audience: 'STAFF', isAdmin: false };
    }
  }

  private isVisibleTo(event: AcademicCalendarEvent, scope: AudienceScope): boolean {
    if (scope.isAdmin) return true;
    return this.parseVisibility(event.visibility).includes(scope.audience);
  }

  /** School-wide events (no class/section) are visible to everyone in scope. */
  private matchesAudienceScope(
    classId: string | null,
    sectionId: string | null,
    teacherId: string | null,
    scope: AudienceScope,
  ): boolean {
    if (scope.isAdmin) return true;

    if (scope.audience === 'TEACHER') {
      if (teacherId && scope.teacherId && teacherId !== scope.teacherId) return false;
      return true;
    }

    if (scope.audience === 'STUDENT' || scope.audience === 'PARENT') {
      if (classId && !(scope.classIds ?? []).includes(classId)) return false;
      if (sectionId && !(scope.sectionIds ?? []).includes(sectionId)) return false;
      return true;
    }

    return !classId && !sectionId;
  }

  private derivedClassFilter(scope: AudienceScope, filters: FeedFilters) {
    const classIds = filters.classId
      ? [filters.classId]
      : scope.isAdmin
        ? undefined
        : scope.classIds;
    const sectionIds = filters.sectionId ? [filters.sectionId] : undefined;

    if (scope.audience === 'TEACHER' && !filters.classId) {
      return sectionIds ? { sectionId: { in: sectionIds } } : {};
    }

    return {
      ...(classIds && classIds.length ? { classId: { in: classIds } } : {}),
      ...(classIds && classIds.length === 0 ? { classId: '__none__' } : {}),
      ...(sectionIds ? { sectionId: { in: sectionIds } } : {}),
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private relationInclude() {
    return {
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      teacher: { select: { id: true, fullName: true } },
    };
  }

  private serialize(event: EventWithRelations): CalendarFeedItem {
    return {
      id: event.id,
      sourceId: event.id,
      source: 'MANUAL',
      title: event.title,
      description: event.description,
      eventType: event.eventType,
      status: event.status,
      academicSession: event.academicSession,
      startDate: this.dateKey(event.startDate),
      endDate: this.dateKey(event.endDate),
      startTime: event.startTime,
      endTime: event.endTime,
      allDay: event.allDay,
      location: event.location,
      colorLabel: event.colorLabel ?? EVENT_TYPE_COLORS[event.eventType],
      recurrence: event.recurrence,
      classId: event.classId,
      className: event.class?.name ?? null,
      sectionId: event.sectionId,
      sectionName: event.section?.name ?? null,
      teacherId: event.teacherId,
      teacherName: event.teacher?.fullName ?? null,
      visibility: this.parseVisibility(event.visibility),
      editable: true,
      linkUrl: '/academic-calendar',
    };
  }

  private serializeVisibility(visibility?: VisibilityAudience[]): string {
    if (!visibility || visibility.length === 0) return VISIBILITY_AUDIENCES.join(',');
    return [...new Set(visibility)].join(',');
  }

  private parseVisibility(raw: string | null | undefined): VisibilityAudience[] {
    if (!raw) return [...VISIBILITY_AUDIENCES];
    return raw
      .split(',')
      .map((v) => v.trim().toUpperCase())
      .filter((v): v is VisibilityAudience =>
        (VISIBILITY_AUDIENCES as readonly string[]).includes(v),
      );
  }

  /** Normalizes any date input to UTC midnight so day comparisons are timezone-safe. */
  private parseDate(value: string, field: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`${field} is not a valid date`);
    }
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private dateKey(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  private resolveWindow(from?: string, to?: string): { from: Date; to: Date } {
    const now = new Date();
    const start = from ? new Date(from) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = to ? new Date(to) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date range');
    }
    if (end < start) throw new BadRequestException('Range end cannot be before range start');
    return {
      from: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())),
      to: new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 23, 59, 59)),
    };
  }

  private dateRangeFilter(from?: string, to?: string): Prisma.AcademicCalendarEventWhereInput {
    if (!from && !to) return {};
    const filter: Prisma.AcademicCalendarEventWhereInput = {};
    if (from) filter.endDate = { gte: new Date(from) };
    if (to) filter.startDate = { lte: new Date(to) };
    return filter;
  }

  private resolveSchoolIdForRead(user: CurrentUser): string | null {
    return user.schoolId ?? null;
  }

  private resolveSchoolId(currentUser: CurrentUser, schoolId?: string): string {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      if (!schoolId && !currentUser.schoolId) throw new BadRequestException('schoolId is required');
      return schoolId ?? currentUser.schoolId!;
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
    return { schoolId: currentUser.schoolId };
  }

  private assertSchoolAccess(currentUser: CurrentUser, resourceSchoolId: string) {
    if (currentUser.role === UserRole.SUPER_ADMIN) return;
    if (!currentUser.schoolId || currentUser.schoolId !== resourceSchoolId) {
      throw new ForbiddenException("Cannot access another school's data");
    }
  }

  private async assertClassBelongsToSchool(classId: string, schoolId: string) {
    const c = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!c) throw new NotFoundException('Class not found');
    if (c.schoolId !== schoolId) throw new ForbiddenException('Class does not belong to school');
  }

  private async assertSectionBelongsToSchool(sectionId: string, schoolId: string, classId?: string) {
    const s = await this.prisma.section.findUnique({ where: { id: sectionId } });
    if (!s) throw new NotFoundException('Section not found');
    if (s.schoolId !== schoolId) throw new ForbiddenException('Section does not belong to school');
    if (classId && s.classId !== classId) {
      throw new BadRequestException('Section does not belong to class');
    }
  }

  private async assertTeacherBelongsToSchool(teacherId: string, schoolId: string) {
    const t = await this.prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!t) throw new NotFoundException('Teacher not found');
    if (t.schoolId !== schoolId) throw new ForbiddenException('Teacher does not belong to school');
  }
}
