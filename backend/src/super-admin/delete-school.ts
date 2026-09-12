import { Prisma } from '@prisma/client';

/**
 * School-scoped tables deleted before School, children first.
 * Every step is filtered by the requested schoolId.
 */
export const SCHOOL_SCOPED_DELETE_MANY_MODELS = [
  'homeworkSubmissionFile',
  'homeworkSubmission',
  'homeworkAttachment',
  'homework',
  'onlineClassAttendance',
  'onlineClass',
  'academicCalendarEvent',
  'notificationLog',
  'userNotification',
  'mark',
  'examSubject',
  'exam',
  'studentAttendance',
  'feePayment',
  'feeInvoice',
  'feeStructure',
  'grade',
  'bookIssue',
  'book',
  'bookCategory',
  'studentTransport',
  'transportRoute',
  'vehicle',
  'studentDocument',
  'expense',
  'expenseCategory',
  'payroll',
  'timetableEntry',
  'notice',
  'schoolAuditLog',
  'saasInvoice',
  'rolePermission',
  'parent',
  'student',
  'teacher',
  'staff',
  'subject',
  'section',
  'class',
  'schoolCustomRole',
  'notificationCampaign',
  'notificationTemplate',
  'schoolSubscription',
  'user',
] as const;

export type SchoolScopedDeleteModel = (typeof SCHOOL_SCOPED_DELETE_MANY_MODELS)[number];

/**
 * Deletes one school and its dependent rows inside an existing transaction.
 * Does not rewrite other schools. Throws to roll back the whole transaction.
 */
export async function deleteSchoolWithDependents(
  tx: Prisma.TransactionClient,
  schoolId: string,
): Promise<void> {
  await tx.class.updateMany({ where: { schoolId }, data: { classTeacherId: null } });
  await tx.section.updateMany({ where: { schoolId }, data: { teacherId: null } });
  await tx.subject.updateMany({ where: { schoolId }, data: { teacherId: null } });

  for (const model of SCHOOL_SCOPED_DELETE_MANY_MODELS) {
    const delegate = tx[model] as unknown as {
      deleteMany: (args: { where: { schoolId: string } }) => Promise<unknown>;
    };
    await delegate.deleteMany({ where: { schoolId } });
  }

  await tx.school.delete({ where: { id: schoolId } });
}
