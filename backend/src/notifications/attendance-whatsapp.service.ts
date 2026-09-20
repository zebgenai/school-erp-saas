import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { localDateString, resolveSchoolTimeZone } from '../common/utils/school-time';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeE164Phone } from '../whatsapp/phone.util';
import {
  ATTENDANCE_ABSENT_TYPE,
  ATTENDANCE_WHATSAPP_QUEUE,
  AttendanceWhatsAppJobData,
  attendanceAbsentIdempotencyKey,
  buildAttendanceAbsentMessage,
} from '../whatsapp/whatsapp.types';

export type EnqueueAbsentInput = {
  schoolId: string;
  studentId: string;
  attendanceId: string;
  attendanceDate: Date;
};

@Injectable()
export class AttendanceWhatsAppService {
  private readonly logger = new Logger(AttendanceWhatsAppService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(ATTENDANCE_WHATSAPP_QUEUE)
    private readonly queue: Queue<AttendanceWhatsAppJobData>,
  ) {}

  /** Fire-and-forget safe entrypoint — never throws to attendance callers. */
  async enqueueAbsentNotification(input: EnqueueAbsentInput): Promise<void> {
    try {
      await this.enqueueOrThrow(input);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `WhatsApp absence enqueue failed student=${input.studentId}: ${message}`,
      );
    }
  }

  private async enqueueOrThrow(input: EnqueueAbsentInput): Promise<void> {
    const school = await this.prisma.school.findUnique({ where: { id: input.schoolId } });
    if (!school?.whatsappNotificationsEnabled) return;

    const tz = resolveSchoolTimeZone(school.timezone);
    const dateYmd = localDateString(input.attendanceDate, tz);
    const idempotencyKey = attendanceAbsentIdempotencyKey(
      input.schoolId,
      input.studentId,
      dateYmd,
    );

    const existing = await this.prisma.notificationLog.findUnique({
      where: { idempotencyKey },
    });
    if (existing) return;

    const student = await this.prisma.student.findFirst({
      where: { id: input.studentId, schoolId: input.schoolId },
      include: {
        class: true,
        section: true,
        parents: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 1 },
      },
    });
    if (!student) return;

    const parent = student.parents[0] ?? null;
    const rawPhone = student.whatsappNumber || parent?.phone || student.guardianPhone || null;
    const recipient = normalizeE164Phone(rawPhone);
    const parentName = parent?.fullName || student.fatherName || 'Parent/Guardian';
    const className =
      [student.class?.name, student.section?.name].filter(Boolean).join(' ') || '—';

    const bodyBase = {
      recipient: recipient || 'unknown',
      parentName,
      studentName: student.fullName,
      className,
      date: dateYmd,
      schoolName: school.name,
    };

    if (!recipient) {
      await this.createSkippedLog({
        schoolId: input.schoolId,
        studentId: student.id,
        parentId: parent?.id,
        attendanceId: input.attendanceId,
        idempotencyKey,
        recipient: rawPhone?.trim() || 'unknown',
        body: buildAttendanceAbsentMessage(bodyBase),
        skipReason: rawPhone
          ? 'Invalid WhatsApp number (could not normalize to E.164)'
          : 'No parent/guardian WhatsApp number on file',
        errorCode: rawPhone ? 'INVALID_PHONE' : 'MISSING_PHONE',
      });
      return;
    }

    const body = buildAttendanceAbsentMessage({ ...bodyBase, recipient });

    let log;
    try {
      log = await this.prisma.notificationLog.create({
        data: {
          schoolId: input.schoolId,
          eventType: 'ATTENDANCE_ABSENT',
          notificationType: ATTENDANCE_ABSENT_TYPE,
          channel: NotificationChannel.WHATSAPP,
          recipient,
          subject: `Attendance absence — ${student.fullName}`,
          body,
          status: NotificationStatus.PENDING,
          studentId: student.id,
          parentId: parent?.id,
          attendanceId: input.attendanceId,
          idempotencyKey,
        },
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
      throw err;
    }

    const job: AttendanceWhatsAppJobData = {
      notificationLogId: log.id,
      schoolId: input.schoolId,
      studentId: student.id,
      attendanceId: input.attendanceId,
      recipient,
      parentName,
      studentName: student.fullName,
      className,
      date: dateYmd,
      schoolName: school.name,
    };

    try {
      await this.queue.add('send-absence', job, {
        jobId: idempotencyKey,
        attempts: 3,
        backoff: { type: 'custom' },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: NotificationStatus.FAILED,
          errorCode: 'QUEUE_ENQUEUE_FAILED',
          error: message,
        },
      });
      throw err;
    }
  }

  private async createSkippedLog(input: {
    schoolId: string;
    studentId: string;
    parentId?: string;
    attendanceId: string;
    idempotencyKey: string;
    recipient: string;
    body: string;
    skipReason: string;
    errorCode: string;
  }) {
    try {
      await this.prisma.notificationLog.create({
        data: {
          schoolId: input.schoolId,
          eventType: 'ATTENDANCE_ABSENT',
          notificationType: ATTENDANCE_ABSENT_TYPE,
          channel: NotificationChannel.WHATSAPP,
          recipient: input.recipient,
          subject: 'Attendance absence (skipped)',
          body: input.body,
          status: NotificationStatus.SKIPPED,
          skipReason: input.skipReason,
          errorCode: input.errorCode,
          studentId: input.studentId,
          parentId: input.parentId,
          attendanceId: input.attendanceId,
          idempotencyKey: input.idempotencyKey,
        },
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
      throw err;
    }
  }

  async listForSchool(
    schoolId: string,
    opts: { limit?: number; offset?: number; status?: NotificationStatus } = {},
  ) {
    const take = Math.min(opts.limit ?? 50, 100);
    const skip = opts.offset ?? 0;
    const where: Prisma.NotificationLogWhereInput = {
      schoolId,
      channel: NotificationChannel.WHATSAPP,
      notificationType: ATTENDANCE_ABSENT_TYPE,
      ...(opts.status ? { status: opts.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          student: { select: { id: true, fullName: true, admissionNo: true } },
          parent: { select: { id: true, fullName: true, phone: true } },
        },
      }),
      this.prisma.notificationLog.count({ where }),
    ]);

    return { items, total, limit: take, offset: skip };
  }

  async applyProviderStatusUpdate(input: {
    providerMessageId: string;
    status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
    errorCode?: string;
    errorMessage?: string;
  }) {
    const log = await this.prisma.notificationLog.findFirst({
      where: {
        providerMessageId: input.providerMessageId,
        channel: NotificationChannel.WHATSAPP,
      },
    });
    if (!log) return null;

    const data: Prisma.NotificationLogUpdateInput = {};
    if (input.status === 'SENT') {
      data.status = NotificationStatus.SENT;
      data.sentAt = log.sentAt ?? new Date();
    } else if (input.status === 'DELIVERED') {
      data.status = NotificationStatus.DELIVERED;
      data.deliveredAt = new Date();
      data.sentAt = log.sentAt ?? new Date();
    } else if (input.status === 'READ') {
      data.status = NotificationStatus.READ;
      data.readAt = new Date();
      data.deliveredAt = log.deliveredAt ?? new Date();
      data.sentAt = log.sentAt ?? new Date();
    } else {
      data.status = NotificationStatus.FAILED;
      data.errorCode = input.errorCode ?? 'PROVIDER_FAILED';
      data.error = input.errorMessage ?? 'Provider reported failure';
    }

    return this.prisma.notificationLog.update({ where: { id: log.id }, data });
  }
}
