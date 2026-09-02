import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MeetingProvider,
  OnlineAttendanceSource,
  OnlineClassStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { SchoolAuditService } from '../audit-logs/school-audit.service';
import { CurrentUser } from '../common/types/current-user.type';
import { NotificationEngineService } from '../notifications/notification-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOnlineClassDto,
  LinkHomeworkDto,
  MarkAttendanceDto,
  UpdateOnlineClassDto,
} from './dto/online-class.dto';
import { MeetingProviderRegistry } from './providers/meeting-provider.registry';

const onlineClassInclude = {
  subject: true,
  class: true,
  section: true,
  teacher: true,
  homeworks: { select: { id: true, title: true, dueDate: true, status: true } },
  _count: { select: { attendances: true } },
} satisfies Prisma.OnlineClassInclude;

@Injectable()
export class OnlineClassesService {
  constructor(
    private prisma: PrismaService,
    private schoolAudit: SchoolAuditService,
    private notifications: NotificationEngineService,
    private providers: MeetingProviderRegistry,
  ) {}

  listProviders() {
    return this.providers.list();
  }

  async findAll(
    user: CurrentUser,
    query?: {
      classId?: string;
      sectionId?: string;
      subjectId?: string;
      teacherId?: string;
      status?: OnlineClassStatus;
      provider?: MeetingProvider;
      from?: string;
      to?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: Prisma.OnlineClassWhereInput = {
      ...this.buildSchoolFilter(user),
      ...(query?.classId ? { classId: query.classId } : {}),
      ...(query?.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query?.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query?.teacherId ? { teacherId: query.teacherId } : {}),
      ...(query?.status ? { status: query.status } : {}),
      ...(query?.provider ? { provider: query.provider } : {}),
      ...(query?.from || query?.to
        ? {
            startAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    if (user.role === UserRole.TEACHER) {
      const teacher = await this.prisma.teacher.findFirst({ where: { userId: user.id } });
      where.OR = [
        ...(teacher ? [{ teacherId: teacher.id }] : []),
        { createdById: user.id },
      ];
    }

    const limit = query?.limit ?? 50;
    const offset = query?.offset ?? 0;
    const [items, total] = await Promise.all([
      this.prisma.onlineClass.findMany({
        where,
        include: onlineClassInclude,
        orderBy: { startAt: 'asc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.onlineClass.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async findOne(id: string, user: CurrentUser) {
    const oc = await this.prisma.onlineClass.findUnique({
      where: { id },
      include: {
        ...onlineClassInclude,
        attendances: {
          include: {
            student: { select: { id: true, fullName: true, admissionNo: true } },
          },
          orderBy: { markedAt: 'desc' },
        },
      },
    });
    if (!oc) throw new NotFoundException('Online class not found');
    this.assertSchoolAccess(user, oc.schoolId);

    if (user.role === UserRole.STUDENT || user.role === UserRole.PARENT) {
      const student = await this.resolveScopedStudent(user);
      this.assertStudentMatchesClass(oc, student);
    }

    return {
      ...oc,
      recordingSizeBytes:
        oc.recordingSizeBytes != null ? Number(oc.recordingSizeBytes) : null,
    };
  }

  async create(dto: CreateOnlineClassDto, user: CurrentUser) {
    const schoolId = this.resolveSchoolId(user, dto.schoolId);
    await this.assertClassBelongsToSchool(dto.classId, schoolId);
    if (dto.sectionId) await this.assertSectionBelongsToSchool(dto.sectionId, schoolId, dto.classId);
    if (dto.subjectId) await this.assertSubjectBelongsToSchool(dto.subjectId, schoolId);

    let teacherId = dto.teacherId;
    if (!teacherId && user.role === UserRole.TEACHER) {
      const t = await this.prisma.teacher.findFirst({ where: { userId: user.id, schoolId } });
      teacherId = t?.id;
    }

    const creds = this.providers.normalize(dto.provider, {
      meetingLink: dto.meetingLink,
      meetingId: dto.meetingId,
      passcode: dto.passcode,
    });

    const { startAt, endAt, durationMinutes } = this.resolveSchedule(
      dto.scheduledDate,
      dto.startTime,
      dto.endTime,
      dto.durationMinutes,
    );

    const status = dto.status ?? OnlineClassStatus.SCHEDULED;
    const oc = await this.prisma.onlineClass.create({
      data: {
        schoolId,
        title: dto.title,
        subjectId: dto.subjectId,
        teacherId,
        classId: dto.classId,
        sectionId: dto.sectionId,
        provider: dto.provider,
        meetingLink: creds.meetingLink,
        meetingId: creds.meetingId,
        passcode: creds.passcode,
        scheduledDate: new Date(dto.scheduledDate),
        startTime: dto.startTime,
        endTime: dto.endTime,
        startAt,
        endAt,
        durationMinutes,
        description: dto.description,
        status,
        createdById: user.id,
      },
      include: onlineClassInclude,
    });

    await this.schoolAudit.log({
      schoolId,
      userId: user.id,
      actorName: user.name,
      action: 'ONLINE_CLASS_CREATED',
      entity: 'OnlineClass',
      entityId: oc.id,
      description: `Online class created: ${oc.title}`,
      details: { provider: oc.provider, startAt: oc.startAt },
    });

    if (status === OnlineClassStatus.SCHEDULED || status === OnlineClassStatus.LIVE) {
      this.notifications.dispatch(() =>
        this.notifications.emitOnlineClassScheduled(
          schoolId,
          oc.classId,
          oc.title,
          oc.provider,
          oc.startAt,
          oc.sectionId,
        ),
      );
    }

    return oc;
  }

  async update(id: string, dto: UpdateOnlineClassDto, user: CurrentUser) {
    const existing = await this.findOne(id, user);
    this.assertCanManage(user, existing);

    if (dto.classId) await this.assertClassBelongsToSchool(dto.classId, existing.schoolId);
    if (dto.sectionId) {
      await this.assertSectionBelongsToSchool(
        dto.sectionId,
        existing.schoolId,
        dto.classId ?? existing.classId,
      );
    }
    if (dto.subjectId) await this.assertSubjectBelongsToSchool(dto.subjectId, existing.schoolId);

    const provider = dto.provider ?? existing.provider;
    const creds =
      dto.provider || dto.meetingLink !== undefined || dto.meetingId !== undefined || dto.passcode !== undefined
        ? this.providers.normalize(provider, {
            meetingLink: dto.meetingLink ?? existing.meetingLink ?? undefined,
            meetingId: dto.meetingId ?? existing.meetingId ?? undefined,
            passcode: dto.passcode ?? existing.passcode ?? undefined,
          })
        : null;

    const scheduledDateIso =
      dto.scheduledDate ??
      (existing.scheduledDate instanceof Date
        ? existing.scheduledDate.toISOString()
        : String(existing.scheduledDate));
    const startTime = dto.startTime ?? existing.startTime;
    const endTime = dto.endTime ?? existing.endTime;
    const scheduleChanged =
      dto.scheduledDate !== undefined ||
      dto.startTime !== undefined ||
      dto.endTime !== undefined ||
      dto.durationMinutes !== undefined;
    const schedule = scheduleChanged
      ? this.resolveSchedule(
          scheduledDateIso,
          startTime,
          endTime,
          dto.durationMinutes ?? existing.durationMinutes ?? undefined,
        )
      : null;

    const wasCancelled = existing.status === OnlineClassStatus.CANCELLED;
    const becomingCancelled = dto.status === OnlineClassStatus.CANCELLED && !wasCancelled;
    const becomingLive =
      dto.status === OnlineClassStatus.LIVE && existing.status !== OnlineClassStatus.LIVE;

    const updated = await this.prisma.onlineClass.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId } : {}),
        ...(dto.teacherId !== undefined ? { teacherId: dto.teacherId } : {}),
        ...(dto.classId !== undefined ? { classId: dto.classId } : {}),
        ...(dto.sectionId !== undefined ? { sectionId: dto.sectionId } : {}),
        ...(dto.provider !== undefined ? { provider: dto.provider } : {}),
        ...(creds
          ? {
              meetingLink: creds.meetingLink,
              meetingId: creds.meetingId,
              passcode: creds.passcode,
            }
          : {}),
        ...(dto.scheduledDate !== undefined ? { scheduledDate: new Date(dto.scheduledDate) } : {}),
        ...(dto.startTime !== undefined ? { startTime: dto.startTime } : {}),
        ...(dto.endTime !== undefined ? { endTime: dto.endTime } : {}),
        ...(schedule
          ? {
              startAt: schedule.startAt,
              endAt: schedule.endAt,
              durationMinutes: schedule.durationMinutes,
            }
          : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.recordingUrl !== undefined ? { recordingUrl: dto.recordingUrl } : {}),
        ...(dto.recordingDurationSec !== undefined
          ? { recordingDurationSec: dto.recordingDurationSec }
          : {}),
        ...(dto.recordingSizeBytes !== undefined
          ? { recordingSizeBytes: dto.recordingSizeBytes != null ? BigInt(dto.recordingSizeBytes) : null }
          : {}),
      },
      include: onlineClassInclude,
    });

    await this.schoolAudit.log({
      schoolId: existing.schoolId,
      userId: user.id,
      actorName: user.name,
      action: becomingCancelled ? 'ONLINE_CLASS_CANCELLED' : 'ONLINE_CLASS_UPDATED',
      entity: 'OnlineClass',
      entityId: id,
      description: becomingCancelled
        ? `Online class cancelled: ${updated.title}`
        : `Online class updated: ${updated.title}`,
    });

    if (becomingCancelled) {
      this.notifications.dispatch(() =>
        this.notifications.emitOnlineClassCancelled(
          updated.schoolId,
          updated.classId,
          updated.title,
          updated.sectionId,
        ),
      );
    } else if (becomingLive) {
      this.notifications.dispatch(() =>
        this.notifications.emitOnlineClassStarted(
          updated.schoolId,
          updated.classId,
          updated.title,
          updated.meetingLink,
          updated.sectionId,
        ),
      );
      await this.prisma.onlineClass.update({
        where: { id },
        data: { startedNotifiedAt: new Date() },
      });
    } else {
      this.notifications.dispatch(() =>
        this.notifications.emitOnlineClassUpdated(
          updated.schoolId,
          updated.classId,
          updated.title,
          updated.startAt,
          updated.sectionId,
        ),
      );
    }

    return updated;
  }

  async remove(id: string, user: CurrentUser) {
    const existing = await this.findOne(id, user);
    this.assertCanManage(user, existing);
    await this.prisma.onlineClass.delete({ where: { id } });
    await this.schoolAudit.log({
      schoolId: existing.schoolId,
      userId: user.id,
      actorName: user.name,
      action: 'ONLINE_CLASS_DELETED',
      entity: 'OnlineClass',
      entityId: id,
      description: `Online class deleted: ${existing.title}`,
    });
    return { ok: true };
  }

  async markAttendance(id: string, dto: MarkAttendanceDto, user: CurrentUser) {
    const oc = await this.findOne(id, user);
    this.assertCanManage(user, oc);
    if (!dto.items?.length) throw new BadRequestException('Attendance items required');

    const results: Array<{
      id: string;
      studentId: string;
      status: string;
      student?: { id: string; fullName: string; admissionNo: string };
    }> = [];
    for (const item of dto.items) {
      const student = await this.prisma.student.findUnique({ where: { id: item.studentId } });
      if (!student || student.schoolId !== oc.schoolId) {
        throw new BadRequestException(`Invalid student ${item.studentId}`);
      }
      this.assertStudentMatchesClass(oc, student);

      const row = await this.prisma.onlineClassAttendance.upsert({
        where: {
          onlineClassId_studentId: { onlineClassId: id, studentId: item.studentId },
        },
        create: {
          onlineClassId: id,
          schoolId: oc.schoolId,
          studentId: item.studentId,
          status: item.status,
          notes: item.notes,
          source: OnlineAttendanceSource.MANUAL,
          markedById: user.id,
          markedAt: new Date(),
        },
        update: {
          status: item.status,
          notes: item.notes,
          source: OnlineAttendanceSource.MANUAL,
          markedById: user.id,
          markedAt: new Date(),
        },
        include: { student: { select: { id: true, fullName: true, admissionNo: true } } },
      });
      results.push(row);
    }

    await this.schoolAudit.log({
      schoolId: oc.schoolId,
      userId: user.id,
      actorName: user.name,
      action: 'ONLINE_CLASS_ATTENDANCE_MARKED',
      entity: 'OnlineClass',
      entityId: id,
      description: `Marked attendance for ${results.length} student(s) — ${oc.title}`,
    });

    return results;
  }

  async linkHomework(id: string, dto: LinkHomeworkDto, user: CurrentUser) {
    const oc = await this.findOne(id, user);
    this.assertCanManage(user, oc);
    const hw = await this.prisma.homework.findUnique({ where: { id: dto.homeworkId } });
    if (!hw) throw new NotFoundException('Homework not found');
    this.assertSchoolAccess(user, hw.schoolId);
    if (hw.schoolId !== oc.schoolId) throw new ForbiddenException('Homework school mismatch');

    const updated = await this.prisma.homework.update({
      where: { id: dto.homeworkId },
      data: { onlineClassId: id },
    });

    await this.schoolAudit.log({
      schoolId: oc.schoolId,
      userId: user.id,
      actorName: user.name,
      action: 'ONLINE_CLASS_HOMEWORK_LINKED',
      entity: 'OnlineClass',
      entityId: id,
      description: `Linked homework "${updated.title}" to online class "${oc.title}"`,
    });

    return this.findOne(id, user);
  }

  async unlinkHomework(id: string, homeworkId: string, user: CurrentUser) {
    const oc = await this.findOne(id, user);
    this.assertCanManage(user, oc);
    const hw = await this.prisma.homework.findUnique({ where: { id: homeworkId } });
    if (!hw || hw.onlineClassId !== id) throw new NotFoundException('Linked homework not found');
    await this.prisma.homework.update({
      where: { id: homeworkId },
      data: { onlineClassId: null },
    });
    return this.findOne(id, user);
  }

  async myClasses(user: CurrentUser) {
    if (user.role === UserRole.STUDENT) {
      const student = await this.resolveStudentForUser(user);
      return this.classesForStudent(student);
    }
    if (user.role === UserRole.PARENT) {
      const parent = await this.prisma.parent.findFirst({
        where: { userId: user.id },
        include: { student: true },
      });
      if (!parent?.student) return { items: [], student: null };
      const data = await this.classesForStudent(parent.student);
      return { ...data, student: parent.student };
    }
    if (user.role === UserRole.TEACHER) {
      const teacher = await this.prisma.teacher.findFirst({ where: { userId: user.id } });
      if (!teacher) return { items: [], todayCount: 0, upcomingCount: 0 };
      const items = await this.prisma.onlineClass.findMany({
        where: {
          schoolId: teacher.schoolId,
          OR: [{ teacherId: teacher.id }, { createdById: user.id }],
          status: { not: OnlineClassStatus.CANCELLED },
        },
        include: onlineClassInclude,
        orderBy: { startAt: 'asc' },
      });
      const today = this.dayBounds();
      const todayCount = items.filter((i) => i.startAt >= today.start && i.startAt < today.end).length;
      const upcomingCount = items.filter(
        (i) => i.startAt >= today.end && i.status === OnlineClassStatus.SCHEDULED,
      ).length;
      return { items, todayCount, upcomingCount };
    }
    throw new ForbiddenException('Not available for this role');
  }

  async calendar(user: CurrentUser, from?: string, to?: string) {
    const start = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = to
      ? new Date(to)
      : new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0, 23, 59, 59);

    let where: Prisma.OnlineClassWhereInput = {
      startAt: { gte: start, lte: end },
      status: { not: OnlineClassStatus.CANCELLED },
    };

    if (user.role === UserRole.STUDENT) {
      const student = await this.resolveStudentForUser(user);
      where = {
        ...where,
        schoolId: student.schoolId,
        classId: student.classId ?? undefined,
        ...(student.sectionId ? { OR: [{ sectionId: null }, { sectionId: student.sectionId }] } : {}),
      };
    } else if (user.role === UserRole.PARENT) {
      const parent = await this.prisma.parent.findFirst({
        where: { userId: user.id },
        include: { student: true },
      });
      if (!parent?.student) return [];
      where = {
        ...where,
        schoolId: parent.student.schoolId,
        classId: parent.student.classId ?? undefined,
      };
    } else if (user.role === UserRole.TEACHER) {
      const teacher = await this.prisma.teacher.findFirst({ where: { userId: user.id } });
      where = {
        ...where,
        schoolId: teacher?.schoolId ?? user.schoolId!,
        OR: [{ teacherId: teacher?.id }, { createdById: user.id }],
      };
    } else {
      where = { ...where, ...this.buildSchoolFilter(user) };
    }

    const items = await this.prisma.onlineClass.findMany({
      where,
      select: {
        id: true,
        title: true,
        startAt: true,
        endAt: true,
        provider: true,
        status: true,
        meetingLink: true,
        subject: { select: { name: true } },
        class: { select: { name: true } },
      },
      orderBy: { startAt: 'asc' },
    });

    return items.map((h) => ({
      id: h.id,
      title: h.title,
      date: h.startAt,
      endDate: h.endAt,
      type: 'ONLINE_CLASS',
      provider: h.provider,
      status: h.status,
      meetingLink: h.meetingLink,
      subject: h.subject?.name,
      className: h.class?.name,
    }));
  }

  async widgets(user: CurrentUser) {
    const schoolId = user.schoolId;
    if (!schoolId && user.role !== UserRole.SUPER_ADMIN) return {};

    const today = this.dayBounds();

    if (user.role === UserRole.TEACHER) {
      const me = await this.myClasses(user);
      return {
        todayOnlineClasses: (me as any).todayCount ?? 0,
        upcomingMeetings: (me as any).upcomingCount ?? 0,
      };
    }

    if (user.role === UserRole.STUDENT) {
      const data = await this.myClasses(user);
      const items = (data as any).items ?? [];
      const upcoming = items.filter(
        (i: any) =>
          new Date(i.startAt) >= new Date() &&
          [OnlineClassStatus.SCHEDULED, OnlineClassStatus.LIVE].includes(i.status),
      );
      const joinable = upcoming.find((i: any) => i.status === OnlineClassStatus.LIVE) || upcoming[0];
      return {
        upcomingClasses: upcoming.length,
        joinClass: joinable
          ? { id: joinable.id, title: joinable.title, meetingLink: joinable.meetingLink, startAt: joinable.startAt }
          : null,
      };
    }

    if (user.role === UserRole.PARENT) {
      const data = await this.myClasses(user);
      const items = (data as any).items ?? [];
      return {
        total: items.length,
        upcoming: items.filter((i: any) => new Date(i.startAt) >= new Date()).length,
        student: (data as any).student,
      };
    }

    const [daily, active, total] = await Promise.all([
      this.prisma.onlineClass.count({
        where: {
          schoolId: schoolId!,
          startAt: { gte: today.start, lt: today.end },
          status: { not: OnlineClassStatus.CANCELLED },
        },
      }),
      this.prisma.onlineClass.count({
        where: { schoolId: schoolId!, status: OnlineClassStatus.LIVE },
      }),
      this.prisma.onlineClass.count({ where: { schoolId: schoolId! } }),
    ]);

    return { dailyOnlineClasses: daily, activeMeetings: active, total };
  }

  async reports(user: CurrentUser) {
    const schoolId = this.resolveSchoolId(user);
    const classes = await this.prisma.onlineClass.findMany({
      where: { schoolId },
      include: {
        teacher: { select: { id: true, fullName: true } },
        class: { select: { name: true } },
        attendances: true,
        _count: { select: { attendances: true } },
      },
      orderBy: { startAt: 'desc' },
      take: 200,
    });

    const providerUsage: Record<string, number> = {};
    const teacherActivity: Record<string, { name: string; classes: number }> = {};
    let present = 0;
    let attendanceRows = 0;

    for (const c of classes) {
      providerUsage[c.provider] = (providerUsage[c.provider] ?? 0) + 1;
      const tid = c.teacherId ?? 'unassigned';
      const tname = c.teacher?.fullName ?? 'Unassigned';
      if (!teacherActivity[tid]) teacherActivity[tid] = { name: tname, classes: 0 };
      teacherActivity[tid].classes += 1;
      for (const a of c.attendances) {
        attendanceRows += 1;
        if (a.status === 'PRESENT' || a.status === 'LATE') present += 1;
      }
    }

    const studentIds = new Set(
      classes.flatMap((c) => c.attendances.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').map((a) => a.studentId)),
    );

    return {
      totalOnlineClasses: classes.length,
      attendancePercent: attendanceRows ? Math.round((present / attendanceRows) * 1000) / 10 : 0,
      teacherActivity: Object.values(teacherActivity),
      studentParticipation: studentIds.size,
      providerUsage: Object.entries(providerUsage).map(([provider, count]) => ({ provider, count })),
      items: classes.map((c) => ({
        id: c.id,
        title: c.title,
        className: c.class?.name,
        teacher: c.teacher?.fullName,
        provider: c.provider,
        status: c.status,
        startAt: c.startAt,
        attendanceCount: c._count.attendances,
      })),
    };
  }

  private async classesForStudent(student: {
    id: string;
    schoolId: string;
    classId: string | null;
    sectionId: string | null;
  }) {
    const items = await this.prisma.onlineClass.findMany({
      where: {
        schoolId: student.schoolId,
        classId: student.classId ?? undefined,
        status: { not: OnlineClassStatus.CANCELLED },
        ...(student.sectionId
          ? { OR: [{ sectionId: null }, { sectionId: student.sectionId }] }
          : {}),
      },
      include: onlineClassInclude,
      orderBy: { startAt: 'asc' },
    });
    return { items };
  }

  private resolveSchedule(
    scheduledDate: string,
    startTime: string,
    endTime: string,
    durationMinutes?: number,
  ) {
    const startAt = this.combineDateAndTime(scheduledDate, startTime);
    let endAt = this.combineDateAndTime(scheduledDate, endTime);
    if (endAt <= startAt) {
      endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000);
    }
    const computed = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
    return {
      startAt,
      endAt,
      durationMinutes: durationMinutes ?? computed,
    };
  }

  private combineDateAndTime(dateStr: string, time: string) {
    const d = new Date(dateStr);
    const parts = time.split(':').map((x) => parseInt(x, 10));
    const hh = parts[0] ?? 0;
    const mm = parts[1] ?? 0;
    d.setHours(hh, mm, 0, 0);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid date/time');
    return d;
  }

  private dayBounds() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private async resolveStudentForUser(user: CurrentUser) {
    const student = await this.prisma.student.findFirst({ where: { userId: user.id } });
    if (!student) throw new ForbiddenException('Student profile not found');
    return student;
  }

  private async resolveScopedStudent(user: CurrentUser) {
    if (user.role === UserRole.STUDENT) return this.resolveStudentForUser(user);
    const parent = await this.prisma.parent.findFirst({
      where: { userId: user.id },
      include: { student: true },
    });
    if (!parent?.student) throw new ForbiddenException('No linked student');
    return parent.student;
  }

  private assertStudentMatchesClass(
    oc: { schoolId: string; classId: string; sectionId: string | null },
    student: { schoolId: string; classId: string | null; sectionId: string | null },
  ) {
    if (student.schoolId !== oc.schoolId) throw new ForbiddenException('Access denied');
    if (student.classId !== oc.classId) throw new BadRequestException('Student not in this class');
    if (oc.sectionId && student.sectionId !== oc.sectionId) {
      throw new BadRequestException('Student not in this section');
    }
  }

  private assertCanManage(
    user: CurrentUser,
    oc: { schoolId: string; teacherId: string | null; createdById: string | null },
  ) {
    this.assertSchoolAccess(user, oc.schoolId);
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.SCHOOL_ADMIN) return;
    if (user.role === UserRole.TEACHER) return;
    throw new ForbiddenException('Insufficient permissions');
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
    if (classId && s.classId !== classId) throw new BadRequestException('Section does not belong to class');
  }

  private async assertSubjectBelongsToSchool(subjectId: string, schoolId: string) {
    const s = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!s) throw new NotFoundException('Subject not found');
    if (s.schoolId !== schoolId) throw new ForbiddenException('Subject does not belong to school');
  }
}
