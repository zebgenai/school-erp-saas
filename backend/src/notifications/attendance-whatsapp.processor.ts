import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import {
  ATTENDANCE_WHATSAPP_QUEUE,
  AttendanceWhatsAppJobData,
} from '../whatsapp/whatsapp.types';

/** Custom backoff: ~30s then ~2m. */
export function attendanceWhatsAppBackoffStrategy(attemptsMade: number): number {
  if (attemptsMade <= 1) return 30_000;
  return 120_000;
}

@Processor(ATTENDANCE_WHATSAPP_QUEUE, {
  settings: {
    backoffStrategy: attendanceWhatsAppBackoffStrategy,
  },
})
export class AttendanceWhatsAppProcessor extends WorkerHost {
  private readonly logger = new Logger(AttendanceWhatsAppProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {
    super();
  }

  async process(job: Job<AttendanceWhatsAppJobData>): Promise<void> {
    const data = job.data;
    const log = await this.prisma.notificationLog.findUnique({
      where: { id: data.notificationLogId },
    });
    if (!log) return;

    if (
      log.status === NotificationStatus.SENT ||
      log.status === NotificationStatus.DELIVERED ||
      log.status === NotificationStatus.READ ||
      log.status === NotificationStatus.SKIPPED
    ) {
      return;
    }

    await this.prisma.notificationLog.update({
      where: { id: log.id },
      data: { status: NotificationStatus.PROCESSING, retryCount: job.attemptsMade },
    });

    const result = await this.whatsapp.sendAttendanceAbsent({
      recipient: data.recipient,
      parentName: data.parentName,
      studentName: data.studentName,
      className: data.className,
      date: data.date,
      schoolName: data.schoolName,
    });

    if (result.skipped) {
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: NotificationStatus.SKIPPED,
          skipReason: result.errorMessage ?? 'Provider skipped send',
          errorCode: result.errorCode ?? 'SKIPPED',
        },
      });
      return;
    }

    if (result.success) {
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          providerMessageId: result.providerMessageId,
          error: null,
          errorCode: null,
        },
      });
      return;
    }

    const permanent = result.retryable === false;
    const attemptsExhausted = job.attemptsMade + 1 >= (job.opts.attempts ?? 3);

    await this.prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        status:
          permanent || attemptsExhausted
            ? NotificationStatus.FAILED
            : NotificationStatus.RETRYING,
        errorCode: result.errorCode ?? 'SEND_FAILED',
        error: result.errorMessage ?? 'WhatsApp send failed',
        retryCount: job.attemptsMade + 1,
      },
    });

    if (permanent || attemptsExhausted) return;
    throw new Error(result.errorMessage || result.errorCode || 'WhatsApp send failed');
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<AttendanceWhatsAppJobData> | undefined, err: Error) {
    this.logger.warn(
      `WhatsApp absence job failed id=${job?.id} attempt=${job?.attemptsMade}: ${err.message}`,
    );
  }
}
