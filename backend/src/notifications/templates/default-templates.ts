/**
 * Default enterprise notification templates with {{placeholder}} support.
 */
import { NotificationCategory, NotificationChannel } from '@prisma/client';

export const TEMPLATE_PLACEHOLDERS = [
  'studentName',
  'parentName',
  'class',
  'amount',
  'dueDate',
  'schoolName',
  'teacherName',
  'examName',
] as const;

export type TemplatePlaceholder = (typeof TEMPLATE_PLACEHOLDERS)[number];

export interface DefaultTemplateDef {
  code: string;
  name: string;
  category: NotificationCategory;
  channel: NotificationChannel;
  subject?: string;
  body: string;
}

export const DEFAULT_TEMPLATES: DefaultTemplateDef[] = [
  {
    code: 'FEE_DUE_REMINDER',
    name: 'Fee Due Reminder',
    category: 'FEE',
    channel: 'EMAIL',
    subject: 'Fee Reminder — {{studentName}}',
    body: 'Dear {{parentName}},\n\nA fee of PKR {{amount}} is due for {{studentName}} ({{class}}).\nDue date: {{dueDate}}\n\nPlease pay at your earliest convenience.\n\nRegards,\n{{schoolName}}',
  },
  {
    code: 'FEE_DUE_REMINDER',
    name: 'Fee Due Reminder (SMS)',
    category: 'FEE',
    channel: 'SMS',
    body: 'Fee Reminder: PKR {{amount}} pending for {{studentName}}. Due: {{dueDate}}. — {{schoolName}}',
  },
  {
    code: 'FEE_PAID',
    name: 'Fee Paid Confirmation',
    category: 'FEE',
    channel: 'EMAIL',
    subject: 'Payment Received — {{studentName}}',
    body: 'Dear {{parentName}},\n\nWe have received PKR {{amount}} for {{studentName}}.\n\nThank you.\n\nRegards,\n{{schoolName}}',
  },
  {
    code: 'ATTENDANCE_ABSENT',
    name: 'Student Absent Alert',
    category: 'ATTENDANCE',
    channel: 'EMAIL',
    subject: 'Attendance Alert — {{studentName}}',
    body: 'Dear {{parentName}},\n\n{{studentName}} ({{class}}) was marked ABSENT.\n\nIf unexpected, please contact the school.\n\nRegards,\n{{schoolName}}',
  },
  {
    code: 'ATTENDANCE_ABSENT',
    name: 'Student Absent Alert (SMS)',
    category: 'ATTENDANCE',
    channel: 'SMS',
    body: 'Attendance Alert: {{studentName}} marked ABSENT. Contact {{schoolName}} if unexpected.',
  },
  {
    code: 'NEW_ADMISSION',
    name: 'Admission Confirmation',
    category: 'STUDENT',
    channel: 'EMAIL',
    subject: 'Admission Confirmation — {{studentName}}',
    body: 'Dear {{parentName}},\n\nWelcome to {{schoolName}}!\n\n{{studentName}} has been admitted to {{class}}.\n\nRegards,\n{{schoolName}}',
  },
  {
    code: 'EXAM_SCHEDULED',
    name: 'Exam Scheduled',
    category: 'EXAM',
    channel: 'EMAIL',
    subject: 'Exam Scheduled — {{examName}}',
    body: 'Dear {{parentName}},\n\n{{examName}} has been scheduled for {{studentName}} ({{class}}).\n\nPlease check the portal for details.\n\nRegards,\n{{schoolName}}',
  },
  {
    code: 'EXAM_RESULT_PUBLISHED',
    name: 'Exam Result Published',
    category: 'EXAM',
    channel: 'EMAIL',
    subject: 'Results Published — {{examName}}',
    body: 'Dear {{parentName}},\n\nResults for {{examName}} are now available for {{studentName}}.\n\nLog in to view details.\n\nRegards,\n{{schoolName}}',
  },
  {
    code: 'HOMEWORK_ASSIGNED',
    name: 'Homework Assigned',
    category: 'HOMEWORK',
    channel: 'IN_APP',
    subject: 'Homework — {{class}}',
    body: 'New homework has been assigned for {{class}} by {{teacherName}}.\n\n{{schoolName}}',
  },
  {
    code: 'TIMETABLE_CHANGED',
    name: 'Timetable Changed',
    category: 'TIMETABLE',
    channel: 'IN_APP',
    subject: 'Timetable Update — {{class}}',
    body: 'The timetable for {{class}} has been updated. Please review the latest schedule.\n\n{{schoolName}}',
  },
  {
    code: 'HOLIDAY_ANNOUNCEMENT',
    name: 'Holiday Announcement',
    category: 'HOLIDAY',
    channel: 'IN_APP',
    subject: 'Holiday Notice — {{schoolName}}',
    body: 'Holiday announcement from {{schoolName}}. Please check details in the portal.',
  },
  {
    code: 'EMERGENCY_NOTICE',
    name: 'Emergency Notice',
    category: 'EMERGENCY',
    channel: 'IN_APP',
    subject: 'Emergency Notice — {{schoolName}}',
    body: 'Urgent notice from {{schoolName}}. Please read immediately.',
  },
  {
    code: 'BIRTHDAY_GREETING',
    name: 'Birthday Greeting',
    category: 'BIRTHDAY',
    channel: 'IN_APP',
    subject: 'Happy Birthday {{studentName}}!',
    body: 'Happy Birthday {{studentName}}! Wishing you a wonderful day from everyone at {{schoolName}}.',
  },
  {
    code: 'GENERAL_ANNOUNCEMENT',
    name: 'General Announcement',
    category: 'ANNOUNCEMENT',
    channel: 'IN_APP',
    subject: 'Announcement — {{schoolName}}',
    body: 'New announcement from {{schoolName}}. Please check your portal.',
  },
];

/** Replace {{placeholders}} in a template string. Unknown keys are left intact. */
export function renderTemplate(
  template: string,
  vars: Partial<Record<TemplatePlaceholder | string, string | number | null | undefined>>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = vars[key];
    if (value === null || value === undefined) return `{{${key}}}`;
    return String(value);
  });
}
