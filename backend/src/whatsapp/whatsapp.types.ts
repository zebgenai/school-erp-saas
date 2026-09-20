/** Logical attendance-absence WhatsApp payload (provider-agnostic). */
export type WhatsAppAttendanceAbsentInput = {
  recipient: string;
  parentName: string;
  studentName: string;
  className: string;
  date: string;
  schoolName: string;
};

export type WhatsAppSendResult = {
  success: boolean;
  skipped?: boolean;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  /** Transient failures may be retried by the queue worker. */
  retryable?: boolean;
};

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

export interface WhatsAppProvider {
  readonly name: string;
  isEnabled(): boolean;
  sendAttendanceAbsentMessage(
    input: WhatsAppAttendanceAbsentInput,
  ): Promise<WhatsAppSendResult>;
}

export const ATTENDANCE_WHATSAPP_QUEUE = 'attendance-whatsapp';

export type AttendanceWhatsAppJobData = {
  notificationLogId: string;
  schoolId: string;
  studentId: string;
  attendanceId: string;
  recipient: string;
  parentName: string;
  studentName: string;
  className: string;
  date: string;
  schoolName: string;
};

export const ATTENDANCE_ABSENT_TYPE = 'ATTENDANCE_ABSENT';

export function attendanceAbsentIdempotencyKey(
  schoolId: string,
  studentId: string,
  dateYmd: string,
): string {
  return `${schoolId}:${studentId}:${dateYmd}:${ATTENDANCE_ABSENT_TYPE}:WHATSAPP`;
}

/** Build the logical template text (providers may map to approved templates). */
export function buildAttendanceAbsentMessage(input: WhatsAppAttendanceAbsentInput): string {
  return (
    `Dear ${input.parentName},\n\n` +
    `Your child ${input.studentName} from ${input.className} was marked absent on ${input.date}.\n\n` +
    `Regards,\n${input.schoolName}`
  );
}
