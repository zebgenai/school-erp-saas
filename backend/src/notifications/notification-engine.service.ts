import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEventType } from './notification.types';
import { NotificationsService } from './notifications.service';
import {
  admissionEmail,
  attendanceAlertEmail,
  attendanceAlertSms,
  attendanceAlertWhatsApp,
  feeInvoiceEmail,
  feeReceiptEmail,
  feeReminderSms,
  feeReminderWhatsApp,
  resultAlertSms,
  resultAlertWhatsApp,
  resultPublishedEmail,
} from './templates/notification.templates';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

@Injectable()
export class NotificationEngineService {
  private readonly logger = new Logger(NotificationEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Fire-and-forget wrapper — never blocks business logic */
  dispatch(fn: () => Promise<void>) {
    fn().catch((err) => this.logger.error(err.message, err.stack));
  }

  async emitNewAdmission(schoolId: string, studentId: string) {
    const data = await this.loadStudentContext(studentId);
    if (!data) return;

    const { student, school, parentEmail, parentPhone } = data;
    const className = [student.class?.name, student.section?.name].filter(Boolean).join(' ') || '—';
    const emailTpl = admissionEmail({
      studentName: student.fullName,
      admissionNo: student.admissionNo,
      className,
      schoolName: school.name,
    });

    await this.notifyParents(schoolId, {
      eventType: 'NEW_ADMISSION',
      parentEmail,
      parentPhone,
      emailSubject: emailTpl.subject,
      emailBody: emailTpl.body,
      smsBody: `Welcome! ${student.fullName} admitted to ${className}. Adm No: ${student.admissionNo}.`,
      whatsappBody: `Welcome to ${school.name}! ${student.fullName} admitted. Adm No: ${student.admissionNo}.`,
    });

    await this.createInAppForRoles(schoolId, ['SCHOOL_ADMIN', 'RECEPTIONIST'], {
      eventType: 'NEW_ADMISSION',
      title: 'New Student Admission',
      body: `${student.fullName} (${student.admissionNo}) admitted to ${className}.`,
      linkUrl: '/students',
    });
  }

  async emitFeeInvoiceGenerated(schoolId: string, invoiceId: string) {
    const invoice = await this.prisma.feeInvoice.findUnique({
      where: { id: invoiceId },
      include: { student: { include: { class: true, section: true, parents: true } } },
    });
    if (!invoice?.student) return;

    const school = await this.getSchool(schoolId);
    const contacts = this.extractParentContacts(invoice.student);
    const period = `${MONTHS[(invoice.month ?? 1) - 1]} ${invoice.year}`;
    const dueDate = invoice.dueDate?.toISOString().slice(0, 10);
    const emailTpl = feeInvoiceEmail({
      studentName: invoice.student.fullName,
      invoiceNo: invoice.invoiceNo,
      amount: invoice.totalAmount,
      month: invoice.month,
      year: invoice.year,
      dueDate,
      schoolName: school.name,
    });

    await this.notifyParents(schoolId, {
      eventType: 'FEE_INVOICE_GENERATED',
      parentEmail: contacts.email,
      parentPhone: contacts.phone,
      emailSubject: emailTpl.subject,
      emailBody: emailTpl.body,
      smsBody: `Fee invoice ${invoice.invoiceNo} for ${invoice.student.fullName}: PKR ${invoice.totalAmount.toLocaleString()} (${period}).`,
    });

    await this.emitFeeDueReminder(schoolId, invoiceId);
  }

  async emitFeeDueReminder(schoolId: string, invoiceId: string) {
    const invoice = await this.prisma.feeInvoice.findUnique({
      where: { id: invoiceId },
      include: { student: { include: { parents: true } } },
    });
    if (!invoice?.student || invoice.paidAmount >= invoice.totalAmount) return;

    const contacts = this.extractParentContacts(invoice.student);
    const pending = invoice.totalAmount - invoice.paidAmount;
    const dueDate = invoice.dueDate?.toISOString().slice(0, 10);

    await this.notifyParents(schoolId, {
      eventType: 'FEE_DUE_REMINDER',
      parentEmail: contacts.email,
      parentPhone: contacts.phone,
      emailSubject: `Fee Due Reminder — ${invoice.student.fullName}`,
      emailBody: `Reminder: PKR ${pending.toLocaleString()} fee pending for ${invoice.student.fullName}.${dueDate ? ` Due: ${dueDate}.` : ''}`,
      smsBody: feeReminderSms({ studentName: invoice.student.fullName, amount: pending, dueDate }),
      whatsappBody: feeReminderWhatsApp({ studentName: invoice.student.fullName, amount: pending, dueDate }),
      smsOnly: true,
      whatsappOnly: true,
    });
  }

  async emitFeePaid(schoolId: string, invoiceId: string, amount: number, receiptNo: string) {
    const invoice = await this.prisma.feeInvoice.findUnique({
      where: { id: invoiceId },
      include: { student: { include: { parents: true } } },
    });
    if (!invoice?.student) return;

    const school = await this.getSchool(schoolId);
    const contacts = this.extractParentContacts(invoice.student);
    const emailTpl = feeReceiptEmail({
      studentName: invoice.student.fullName,
      amount,
      receiptNo,
      month: invoice.month,
      year: invoice.year,
      schoolName: school.name,
    });

    await this.notifyParents(schoolId, {
      eventType: 'FEE_PAID',
      parentEmail: contacts.email,
      parentPhone: contacts.phone,
      emailSubject: emailTpl.subject,
      emailBody: emailTpl.body,
      smsBody: `Fee received: PKR ${amount.toLocaleString()} for ${invoice.student.fullName}. Receipt: ${receiptNo}.`,
    });

    await this.createInAppForRoles(schoolId, ['SCHOOL_ADMIN', 'ACCOUNTANT'], {
      eventType: 'FEE_PAID',
      title: 'Fee Payment Received',
      body: `PKR ${amount.toLocaleString()} received for ${invoice.student.fullName} (${receiptNo}).`,
      linkUrl: '/fees',
    });
  }

  async emitAttendanceAbsent(schoolId: string, studentId: string, date: string) {
    const data = await this.loadStudentContext(studentId);
    if (!data) return;

    const { student, school, parentEmail, parentPhone } = data;
    const dateLabel = date.slice(0, 10);
    const emailTpl = attendanceAlertEmail({
      studentName: student.fullName,
      date: dateLabel,
      schoolName: school.name,
    });

    await this.notifyParents(schoolId, {
      eventType: 'ATTENDANCE_ABSENT',
      parentEmail,
      parentPhone,
      emailSubject: emailTpl.subject,
      emailBody: emailTpl.body,
      smsBody: attendanceAlertSms({ studentName: student.fullName, date: dateLabel }),
      whatsappBody: attendanceAlertWhatsApp({ studentName: student.fullName, date: dateLabel }),
    });

    if (student.userId) {
      await this.notifications.sendInApp({
        userId: student.userId,
        schoolId,
        eventType: 'ATTENDANCE_ABSENT',
        title: 'Marked Absent',
        body: `You were marked absent on ${dateLabel}.`,
        linkUrl: '/student',
      });
    }
  }

  async emitExamScheduled(schoolId: string, examId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: { class: true, section: true },
    });
    if (!exam) return;

    const classLabel = [exam.class?.name, exam.section?.name].filter(Boolean).join(' ') || '—';
    const start = exam.startDate?.toISOString().slice(0, 10) ?? 'TBA';

    await this.createInAppForClass(schoolId, exam.classId, exam.sectionId, {
      eventType: 'EXAM_SCHEDULED',
      title: 'Exam Scheduled',
      body: `${exam.name} scheduled for ${classLabel} starting ${start}.`,
      linkUrl: '/exams',
    });

    await this.createInAppForRoles(schoolId, ['TEACHER', 'SCHOOL_ADMIN'], {
      eventType: 'EXAM_SCHEDULED',
      title: 'New Exam Scheduled',
      body: `${exam.name} for ${classLabel} starts ${start}.`,
      linkUrl: '/exams',
    });
  }

  async emitExamResultPublished(schoolId: string, examId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: { class: true, section: true },
    });
    if (!exam) return;

    const school = await this.getSchool(schoolId);
    const students = await this.prisma.student.findMany({
      where: {
        schoolId,
        status: 'ACTIVE',
        classId: exam.classId,
        ...(exam.sectionId ? { sectionId: exam.sectionId } : {}),
      },
      include: { parents: true },
    });

    for (const student of students) {
      const contacts = this.extractParentContacts(student);
      const emailTpl = resultPublishedEmail({
        studentName: student.fullName,
        examName: exam.name,
        schoolName: school.name,
      });

      await this.notifyParents(schoolId, {
        eventType: 'EXAM_RESULT_PUBLISHED',
        parentEmail: contacts.email,
        parentPhone: contacts.phone,
        emailSubject: emailTpl.subject,
        emailBody: emailTpl.body,
        smsBody: resultAlertSms({ studentName: student.fullName, examName: exam.name }),
        whatsappBody: resultAlertWhatsApp({ studentName: student.fullName, examName: exam.name }),
      });

      if (student.userId) {
        await this.notifications.sendInApp({
          userId: student.userId,
          schoolId,
          eventType: 'EXAM_RESULT_PUBLISHED',
          title: 'Results Published',
          body: `${exam.name} results are now available.`,
          linkUrl: '/student',
        });
      }
    }

    await this.createInAppForRoles(schoolId, ['TEACHER', 'SCHOOL_ADMIN'], {
      eventType: 'EXAM_RESULT_PUBLISHED',
      title: 'Exam Results Published',
      body: `Results for ${exam.name} have been published.`,
      linkUrl: '/exams',
    });
  }

  async emitSalaryProcessed(schoolId: string, month: number, year: number, count: number) {
    const period = `${MONTHS[month - 1]} ${year}`;

    const payrolls = await this.prisma.payroll.findMany({
      where: { schoolId, month, year },
      include: {
        teacher: { select: { userId: true, fullName: true } },
        staff: { select: { userId: true, fullName: true } },
      },
    });

    for (const p of payrolls) {
      const userId = p.teacher?.userId ?? p.staff?.userId;
      if (!userId) continue;
      await this.notifications.sendInApp({
        userId,
        schoolId,
        eventType: 'SALARY_PROCESSED',
        title: 'Salary Slip Generated',
        body: `Your salary slip for ${period} is ready. Net: PKR ${p.netSalary.toLocaleString()}.`,
        linkUrl: '/payroll',
      });
    }

    await this.createInAppForRoles(schoolId, ['SCHOOL_ADMIN', 'ACCOUNTANT'], {
      eventType: 'SALARY_PROCESSED',
      title: 'Payroll Generated',
      body: `Payroll for ${period} generated for ${count} employees.`,
      linkUrl: '/payroll',
    });
  }

  async emitNewAnnouncement(schoolId: string, noticeId: string) {
    const notice = await this.prisma.notice.findUnique({ where: { id: noticeId } });
    if (!notice) return;

    const roles = this.parseTargetRoles(notice.targetRoles);
    await this.createInAppForRoles(schoolId, roles, {
      eventType: 'NEW_ANNOUNCEMENT',
      title: notice.title,
      body: notice.content.slice(0, 200),
      linkUrl: '/communication',
    });
  }

  async emitStudentUpdated(schoolId: string, studentId: string, studentName: string) {
    await this.emitSchoolEvent(schoolId, 'STUDENT_UPDATED', {
      title: 'Student Updated',
      body: `${studentName} profile was updated.`,
      linkUrl: '/students',
      roles: [UserRole.SCHOOL_ADMIN, UserRole.RECEPTIONIST],
      dedupeKey: `student-updated:${studentId}:${Date.now().toString().slice(0, -4)}`,
    });
  }

  async emitStudentDeleted(schoolId: string, studentName: string) {
    await this.emitSchoolEvent(schoolId, 'STUDENT_DELETED', {
      title: 'Student Deleted',
      body: `${studentName} was permanently removed.`,
      linkUrl: '/students',
      roles: [UserRole.SCHOOL_ADMIN, UserRole.RECEPTIONIST],
    });
  }

  async emitPayrollPaid(schoolId: string, payrollId: string) {
    const payroll = await this.prisma.payroll.findUnique({
      where: { id: payrollId },
      include: {
        teacher: { select: { userId: true, fullName: true } },
        staff: { select: { userId: true, fullName: true } },
      },
    });
    if (!payroll) return;

    const name = payroll.teacher?.fullName ?? payroll.staff?.fullName ?? 'Employee';
    const userId = payroll.teacher?.userId ?? payroll.staff?.userId;
    const period = `${MONTHS[payroll.month - 1]} ${payroll.year}`;

    if (userId) {
      await this.notifications.sendInApp({
        userId,
        schoolId,
        eventType: 'PAYROLL_PAID',
        title: 'Salary Paid',
        body: `Your salary for ${period} has been marked as paid.`,
        linkUrl: '/payroll',
        dedupeKey: `payroll-paid:${payrollId}:${userId}`,
      });
    }

    await this.emitSchoolEvent(schoolId, 'PAYROLL_PAID', {
      title: 'Payroll Payment Recorded',
      body: `Salary paid for ${name} (${period}).`,
      linkUrl: '/payroll',
      roles: [UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT],
      dedupeKey: `payroll-paid-admin:${payrollId}`,
    });
  }

  async emitAttendanceSubmitted(
    schoolId: string,
    classId: string,
    sectionId: string | null | undefined,
    date: string,
    count: number,
    markedById: string,
  ) {
    const dedupeKey = `attendance-submitted:${schoolId}:${classId}:${sectionId ?? 'all'}:${date.slice(0, 10)}`;
    await this.emitSchoolEvent(schoolId, 'ATTENDANCE_SUBMITTED', {
      title: 'Attendance Submitted',
      body: `Attendance marked for ${count} student(s) on ${date.slice(0, 10)}.`,
      linkUrl: '/attendance',
      roles: [UserRole.SCHOOL_ADMIN, UserRole.TEACHER],
      dedupeKey,
      excludeUserIds: [markedById],
    });
  }

  async emitExamCreated(schoolId: string, examId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: { class: true, section: true },
    });
    if (!exam) return;

    const classLabel = [exam.class?.name, exam.section?.name].filter(Boolean).join(' ') || '—';
    await this.emitSchoolEvent(schoolId, 'EXAM_CREATED', {
      title: 'Exam Created',
      body: `${exam.name} created for ${classLabel}.`,
      linkUrl: '/exams',
      roles: [UserRole.SCHOOL_ADMIN, UserRole.TEACHER],
      dedupeKey: `exam-created:${examId}`,
    });
  }

  async emitLibraryBookIssued(schoolId: string, issueId: string) {
    const issue = await this.prisma.bookIssue.findUnique({
      where: { id: issueId },
      include: { book: true, student: true },
    });
    if (!issue?.book || !issue.student) return;

    await this.emitSchoolEvent(schoolId, 'LIBRARY_BOOK_ISSUED', {
      title: 'Book Issued',
      body: `"${issue.book.title}" issued to ${issue.student.fullName}.`,
      linkUrl: '/library',
      roles: [UserRole.SCHOOL_ADMIN, UserRole.RECEPTIONIST],
      dedupeKey: `book-issued:${issueId}`,
    });
  }

  async emitLibraryBookReturned(schoolId: string, issueId: string) {
    const issue = await this.prisma.bookIssue.findUnique({
      where: { id: issueId },
      include: { book: true, student: true },
    });
    if (!issue?.book || !issue.student) return;

    await this.emitSchoolEvent(schoolId, 'LIBRARY_BOOK_RETURNED', {
      title: 'Book Returned',
      body: `"${issue.book.title}" returned by ${issue.student.fullName}.`,
      linkUrl: '/library',
      roles: [UserRole.SCHOOL_ADMIN, UserRole.RECEPTIONIST],
      dedupeKey: `book-returned:${issueId}`,
    });
  }

  async emitTransportAssignmentChanged(schoolId: string, studentId: string, routeName: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) return;

    await this.emitSchoolEvent(schoolId, 'TRANSPORT_ASSIGNMENT_CHANGED', {
      title: 'Transport Assignment Updated',
      body: `${student.fullName} assigned to route "${routeName}".`,
      linkUrl: '/transport',
      roles: [UserRole.SCHOOL_ADMIN, UserRole.RECEPTIONIST],
      dedupeKey: `transport:${studentId}:${routeName}`,
    });
  }

  async emitSchoolActivated(schoolId: string, schoolName: string) {
    await this.emitSchoolEvent(schoolId, 'SCHOOL_ACTIVATED', {
      title: 'School Activated',
      body: `${schoolName} has been activated.`,
      linkUrl: '/dashboard',
      roles: [UserRole.SCHOOL_ADMIN],
      dedupeKey: `school-activated:${schoolId}`,
    });
  }

  async emitSchoolSuspended(schoolId: string, schoolName: string) {
    await this.emitSchoolEvent(schoolId, 'SCHOOL_SUSPENDED', {
      title: 'School Suspended',
      body: `${schoolName} has been suspended.`,
      linkUrl: '/dashboard',
      roles: [UserRole.SCHOOL_ADMIN],
      dedupeKey: `school-suspended:${schoolId}`,
    });
  }

  async emitPlanChanged(schoolId: string, planName: string) {
    await this.emitSchoolEvent(schoolId, 'PLAN_CHANGED', {
      title: 'Subscription Plan Changed',
      body: `School plan updated to ${planName}.`,
      linkUrl: '/settings',
      roles: [UserRole.SCHOOL_ADMIN],
      dedupeKey: `plan-changed:${schoolId}:${planName}`,
    });
  }

  async emitPasswordReset(userId: string, email: string) {
    await this.notifications.sendInApp({
      userId,
      eventType: 'PASSWORD_RESET',
      title: 'Password Reset',
      body: `A password reset was requested for ${email}.`,
      linkUrl: '/settings',
      dedupeKey: `password-reset:${userId}:${Date.now().toString().slice(0, -5)}`,
    });
  }

  async emitNewTeacher(schoolId: string, teacherName: string, teacherId: string) {
    await this.emitSchoolEvent(schoolId, 'NEW_TEACHER', {
      title: 'New Teacher Added',
      body: `${teacherName} joined as a teacher.`,
      linkUrl: '/teachers',
      roles: [UserRole.SCHOOL_ADMIN],
      dedupeKey: `new-teacher:${teacherId}`,
    });
  }

  async emitNewStaff(schoolId: string, staffName: string, staffId: string) {
    await this.emitSchoolEvent(schoolId, 'NEW_STAFF', {
      title: 'New Staff Added',
      body: `${staffName} joined as staff.`,
      linkUrl: '/staff',
      roles: [UserRole.SCHOOL_ADMIN],
      dedupeKey: `new-staff:${staffId}`,
    });
  }

  async emitNewParent(schoolId: string, parentName: string, parentId: string) {
    await this.emitSchoolEvent(schoolId, 'NEW_PARENT', {
      title: 'New Parent Linked',
      body: `${parentName} was linked to a student.`,
      linkUrl: '/parents',
      roles: [UserRole.SCHOOL_ADMIN, UserRole.RECEPTIONIST],
      dedupeKey: `new-parent:${parentId}`,
    });
  }

  async emitNewUser(schoolId: string, userName: string, userId: string, role: string) {
    await this.emitSchoolEvent(schoolId, 'NEW_USER', {
      title: 'New User Created',
      body: `${userName} (${role}) account created.`,
      linkUrl: '/users',
      roles: [UserRole.SCHOOL_ADMIN],
      dedupeKey: `new-user:${userId}`,
    });
  }

  async emitDocumentUploaded(schoolId: string, studentName: string, docName: string, docId: string) {
    await this.emitSchoolEvent(schoolId, 'DOCUMENT_UPLOADED', {
      title: 'Document Uploaded',
      body: `"${docName}" uploaded for ${studentName}.`,
      linkUrl: '/students',
      roles: [UserRole.SCHOOL_ADMIN, UserRole.RECEPTIONIST],
      dedupeKey: `doc-upload:${docId}`,
    });
  }

  async emitDocumentDeleted(schoolId: string, studentName: string, docName: string, docId: string) {
    await this.emitSchoolEvent(schoolId, 'DOCUMENT_DELETED', {
      title: 'Document Deleted',
      body: `"${docName}" removed for ${studentName}.`,
      linkUrl: '/students',
      roles: [UserRole.SCHOOL_ADMIN, UserRole.RECEPTIONIST],
      dedupeKey: `doc-delete:${docId}`,
    });
  }

  async emitFeeGenerated(schoolId: string, invoiceId: string) {
    await this.emitSchoolEvent(schoolId, 'FEE_INVOICE_GENERATED', {
      title: 'Fee Invoice Generated',
      body: 'A new fee invoice was generated.',
      linkUrl: '/fees',
      roles: [UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT],
      dedupeKey: `fee-generated:${invoiceId}`,
    });
  }

  async emitHomeworkAssigned(
    schoolId: string,
    classId: string,
    title: string,
    teacherName?: string,
    sectionId?: string | null,
  ) {
    await this.createInAppForClass(schoolId, classId, sectionId, {
      eventType: 'HOMEWORK_ASSIGNED',
      title: 'Homework Assigned',
      body: `${title}${teacherName ? ` — by ${teacherName}` : ''}`,
      linkUrl: '/homework',
    });
  }

  async emitHomeworkGraded(
    schoolId: string,
    studentId: string,
    homeworkTitle: string,
    remarks?: string,
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { parents: true },
    });
    if (!student) return;

    if (student.userId) {
      await this.notifications.sendInApp({
        userId: student.userId,
        schoolId,
        eventType: 'HOMEWORK_GRADED',
        title: 'Homework Graded',
        body: `"${homeworkTitle}" has been graded.${remarks ? ` Remarks: ${remarks}` : ''}`,
        linkUrl: '/student',
        dedupeKey: `hw-graded:${studentId}:${homeworkTitle}:${Date.now()}`,
      });
    }

    for (const p of student.parents ?? []) {
      if (!p.userId) continue;
      await this.notifications.sendInApp({
        userId: p.userId,
        schoolId,
        eventType: 'HOMEWORK_GRADED',
        title: 'Homework Graded',
        body: `${student.fullName}'s homework "${homeworkTitle}" was graded.`,
        linkUrl: '/parent',
      });
    }
  }

  async emitHomeworkDueTomorrow(schoolId: string, homeworkId: string, title: string, classId: string, sectionId?: string | null) {
    await this.createInAppForClass(schoolId, classId, sectionId, {
      eventType: 'HOMEWORK_DUE_TOMORROW',
      title: 'Homework Due Tomorrow',
      body: `"${title}" is due tomorrow.`,
      linkUrl: '/homework',
    });
  }

  async emitHomeworkOverdue(schoolId: string, title: string, classId: string, sectionId?: string | null) {
    await this.createInAppForClass(schoolId, classId, sectionId, {
      eventType: 'HOMEWORK_OVERDUE',
      title: 'Homework Overdue',
      body: `"${title}" is overdue.`,
      linkUrl: '/homework',
    });
  }

  async emitOnlineClassScheduled(
    schoolId: string,
    classId: string,
    title: string,
    provider: string,
    startAt: Date,
    sectionId?: string | null,
  ) {
    await this.createInAppForClass(schoolId, classId, sectionId, {
      eventType: 'ONLINE_CLASS_SCHEDULED',
      title: 'Online Class Scheduled',
      body: `"${title}" (${provider}) starts ${startAt.toLocaleString()}.`,
      linkUrl: '/online-classes',
    });
    await this.createInAppForRoles(schoolId, ['TEACHER', 'SCHOOL_ADMIN'], {
      eventType: 'ONLINE_CLASS_SCHEDULED',
      title: 'Online Class Scheduled',
      body: `"${title}" (${provider}) starts ${startAt.toLocaleString()}.`,
      linkUrl: '/online-classes',
    });
  }

  async emitOnlineClassReminder(
    schoolId: string,
    classId: string,
    title: string,
    meetingLink: string | null | undefined,
    sectionId?: string | null,
  ) {
    await this.createInAppForClass(schoolId, classId, sectionId, {
      eventType: 'ONLINE_CLASS_REMINDER',
      title: 'Online Class in 1 Hour',
      body: `"${title}" starts in about 1 hour.${meetingLink ? ` Join: ${meetingLink}` : ''}`,
      linkUrl: '/online-classes',
    });
  }

  async emitOnlineClassStarted(
    schoolId: string,
    classId: string,
    title: string,
    meetingLink: string | null | undefined,
    sectionId?: string | null,
  ) {
    await this.createInAppForClass(schoolId, classId, sectionId, {
      eventType: 'ONLINE_CLASS_STARTED',
      title: 'Online Class Started',
      body: `"${title}" is live now.${meetingLink ? ` Join: ${meetingLink}` : ''}`,
      linkUrl: '/online-classes',
    });
  }

  async emitOnlineClassCancelled(
    schoolId: string,
    classId: string,
    title: string,
    sectionId?: string | null,
  ) {
    await this.createInAppForClass(schoolId, classId, sectionId, {
      eventType: 'ONLINE_CLASS_CANCELLED',
      title: 'Online Class Cancelled',
      body: `"${title}" has been cancelled.`,
      linkUrl: '/online-classes',
    });
  }

  async emitOnlineClassUpdated(
    schoolId: string,
    classId: string,
    title: string,
    startAt: Date,
    sectionId?: string | null,
  ) {
    await this.createInAppForClass(schoolId, classId, sectionId, {
      eventType: 'ONLINE_CLASS_UPDATED',
      title: 'Online Class Updated',
      body: `"${title}" was updated. Starts ${startAt.toLocaleString()}.`,
      linkUrl: '/online-classes',
    });
  }

  // ─── Academic Calendar ─────────────────────────────────────────────────────

  async emitCalendarEventPublished(
    schoolId: string,
    title: string,
    typeLabel: string,
    startDate: Date,
    classId?: string | null,
    sectionId?: string | null,
    visibility?: string[],
  ) {
    await this.createInAppForCalendarAudience(schoolId, classId, sectionId, visibility, {
      eventType: 'CALENDAR_EVENT_PUBLISHED',
      title: `${typeLabel} Scheduled`,
      body: `"${title}" is scheduled for ${this.formatEventDate(startDate)}.`,
      linkUrl: '/academic-calendar',
    });
  }

  async emitCalendarEventUpdated(
    schoolId: string,
    title: string,
    startDate: Date,
    classId?: string | null,
    sectionId?: string | null,
    visibility?: string[],
  ) {
    await this.createInAppForCalendarAudience(schoolId, classId, sectionId, visibility, {
      eventType: 'CALENDAR_EVENT_UPDATED',
      title: 'Calendar Event Updated',
      body: `"${title}" was updated. Now on ${this.formatEventDate(startDate)}.`,
      linkUrl: '/academic-calendar',
    });
  }

  async emitCalendarEventCancelled(
    schoolId: string,
    title: string,
    classId?: string | null,
    sectionId?: string | null,
    visibility?: string[],
  ) {
    await this.createInAppForCalendarAudience(schoolId, classId, sectionId, visibility, {
      eventType: 'CALENDAR_EVENT_CANCELLED',
      title: 'Calendar Event Cancelled',
      body: `"${title}" has been cancelled.`,
      linkUrl: '/academic-calendar',
    });
  }

  async emitCalendarEventReminder(
    schoolId: string,
    eventId: string,
    title: string,
    daysBefore: number,
    startDate: Date,
    classId?: string | null,
    sectionId?: string | null,
    visibility?: string[],
  ) {
    const when =
      daysBefore === 0
        ? 'today'
        : daysBefore === 1
          ? 'tomorrow'
          : `in ${daysBefore} days`;
    await this.createInAppForCalendarAudience(schoolId, classId, sectionId, visibility, {
      eventType: 'CALENDAR_EVENT_REMINDER',
      title: `Reminder: ${title}`,
      body: `"${title}" is ${when} (${this.formatEventDate(startDate)}).`,
      linkUrl: '/academic-calendar',
      dedupeKey: `cal-reminder:${eventId}:${daysBefore}`,
    });
  }

  private formatEventDate(d: Date): string {
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }

  /**
   * Fans a calendar event out to the audiences named in its visibility list.
   * Class/section-scoped events only reach the students and parents of that class.
   */
  private async createInAppForCalendarAudience(
    schoolId: string,
    classId: string | null | undefined,
    sectionId: string | null | undefined,
    visibility: string[] | undefined,
    opts: {
      eventType: NotificationEventType;
      title: string;
      body: string;
      linkUrl?: string;
      dedupeKey?: string;
    },
  ) {
    const audiences = new Set(
      (visibility?.length ? visibility : ['SCHOOL', 'TEACHER', 'STUDENT', 'PARENT', 'STAFF']).map(
        (a) => a.toUpperCase(),
      ),
    );

    const staffRoles: UserRole[] = [];
    if (audiences.has('SCHOOL')) staffRoles.push(UserRole.SCHOOL_ADMIN);
    if (audiences.has('TEACHER')) staffRoles.push(UserRole.TEACHER);
    if (audiences.has('STAFF')) {
      staffRoles.push(UserRole.ACCOUNTANT, UserRole.RECEPTIONIST);
    }

    if (staffRoles.length) {
      await this.createInAppForRoles(schoolId, staffRoles, opts);
    }

    const wantsStudents = audiences.has('STUDENT');
    const wantsParents = audiences.has('PARENT');
    if (!wantsStudents && !wantsParents) return;

    const userIds = new Set<string>();

    if (wantsStudents) {
      const students = await this.prisma.student.findMany({
        where: {
          schoolId,
          status: 'ACTIVE',
          ...(classId ? { classId } : {}),
          ...(sectionId ? { sectionId } : {}),
        },
        select: { userId: true },
      });
      students.forEach((s) => s.userId && userIds.add(s.userId));
    }

    if (wantsParents) {
      const parents = await this.prisma.parent.findMany({
        where: {
          schoolId,
          userId: { not: null },
          ...(classId || sectionId
            ? {
                student: {
                  ...(classId ? { classId } : {}),
                  ...(sectionId ? { sectionId } : {}),
                },
              }
            : {}),
        },
        select: { userId: true },
      });
      parents.forEach((p) => p.userId && userIds.add(p.userId));
    }

    await Promise.allSettled(
      [...userIds].map((userId) =>
        this.notifications.sendInApp({
          userId,
          schoolId,
          eventType: opts.eventType,
          title: opts.title,
          body: opts.body,
          linkUrl: opts.linkUrl,
          dedupeKey: opts.dedupeKey ? `${opts.dedupeKey}:${userId}` : undefined,
        }),
      ),
    );
  }

  async emitTimetableChanged(schoolId: string, classId: string, className: string, sectionId?: string | null) {
    await this.createInAppForClass(schoolId, classId, sectionId, {
      eventType: 'TIMETABLE_CHANGED',
      title: 'Timetable Updated',
      body: `The timetable for ${className} has been updated.`,
      linkUrl: '/timetable',
    });
  }

  async emitHolidayAnnouncement(schoolId: string, title: string, body: string) {
    await this.emitSchoolEvent(schoolId, 'HOLIDAY_ANNOUNCEMENT', {
      title,
      body,
      linkUrl: '/communication',
      roles: [
        UserRole.SCHOOL_ADMIN,
        UserRole.TEACHER,
        UserRole.PARENT,
        UserRole.STUDENT,
        UserRole.RECEPTIONIST,
        UserRole.ACCOUNTANT,
      ],
    });
  }

  async emitEmergencyNotice(schoolId: string, title: string, body: string) {
    await this.emitSchoolEvent(schoolId, 'EMERGENCY_NOTICE', {
      title,
      body,
      linkUrl: '/notifications',
      roles: [
        UserRole.SCHOOL_ADMIN,
        UserRole.TEACHER,
        UserRole.PARENT,
        UserRole.STUDENT,
        UserRole.RECEPTIONIST,
        UserRole.ACCOUNTANT,
      ],
    });
  }

  async emitBirthdayGreeting(schoolId: string, studentId: string, studentName: string, userId?: string | null) {
    if (userId) {
      await this.notifications.sendInApp({
        userId,
        schoolId,
        eventType: 'BIRTHDAY_GREETING',
        title: `Happy Birthday ${studentName}!`,
        body: `Wishing you a wonderful birthday from the school team.`,
        linkUrl: '/dashboard',
        dedupeKey: `birthday:${studentId}:${new Date().toISOString().slice(0, 10)}`,
      });
    }
    await this.emitSchoolEvent(schoolId, 'BIRTHDAY_GREETING', {
      title: 'Student Birthday',
      body: `Today is ${studentName}'s birthday.`,
      linkUrl: '/students',
      roles: [UserRole.SCHOOL_ADMIN, UserRole.TEACHER],
      dedupeKey: `birthday-admin:${studentId}:${new Date().toISOString().slice(0, 10)}`,
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async emitSchoolEvent(
    schoolId: string,
    eventType: NotificationEventType,
    opts: {
      title: string;
      body: string;
      linkUrl?: string;
      roles?: UserRole[];
      userIds?: string[];
      dedupeKey?: string;
      excludeUserIds?: string[];
    },
  ) {
    const exclude = new Set(opts.excludeUserIds ?? []);

    if (opts.userIds?.length) {
      await Promise.allSettled(
        opts.userIds
          .filter((id) => !exclude.has(id))
          .map((userId) =>
            this.notifications.sendInApp({
              userId,
              schoolId,
              eventType,
              title: opts.title,
              body: opts.body,
              linkUrl: opts.linkUrl,
              dedupeKey: opts.dedupeKey ? `${opts.dedupeKey}:${userId}` : undefined,
            }),
          ),
      );
      return;
    }

    if (opts.roles?.length) {
      await this.createInAppForRoles(schoolId, opts.roles, {
        eventType,
        title: opts.title,
        body: opts.body,
        linkUrl: opts.linkUrl,
        dedupeKey: opts.dedupeKey,
        excludeUserIds: opts.excludeUserIds,
      });
    }
  }

  private async notifyParents(
    schoolId: string,
    opts: {
      eventType: NotificationEventType;
      parentEmail?: string | null;
      parentPhone?: string | null;
      emailSubject?: string;
      emailBody?: string;
      smsBody?: string;
      whatsappBody?: string;
      smsOnly?: boolean;
      whatsappOnly?: boolean;
    },
  ) {
    const settings = await this.notifications.getSchoolSettings(schoolId);
    const tasks: Promise<void>[] = [];

    if (!opts.smsOnly && !opts.whatsappOnly && opts.parentEmail && opts.emailBody) {
      tasks.push(
        this.notifications.send({
          channel: 'EMAIL',
          recipient: opts.parentEmail,
          subject: opts.emailSubject,
          body: opts.emailBody,
          schoolId,
          eventType: opts.eventType,
        }),
      );
    }

    if (opts.parentPhone && opts.smsBody && settings.smsEnabled) {
      tasks.push(
        this.notifications.send({
          channel: 'SMS',
          recipient: opts.parentPhone,
          body: opts.smsBody,
          schoolId,
          eventType: opts.eventType,
        }),
      );
    }

    if (opts.parentPhone && (opts.whatsappBody ?? opts.smsBody) && settings.whatsappEnabled) {
      tasks.push(
        this.notifications.send({
          channel: 'WHATSAPP',
          recipient: opts.parentPhone,
          body: opts.whatsappBody ?? opts.smsBody!,
          schoolId,
          eventType: opts.eventType,
        }),
      );
    }

    await Promise.allSettled(tasks);
  }

  private async loadStudentContext(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { class: true, section: true, parents: true, school: true },
    });
    if (!student?.school) return null;
    const contacts = this.extractParentContacts(student);
    return {
      student,
      school: student.school,
      parentEmail: contacts.email,
      parentPhone: contacts.phone,
    };
  }

  private extractParentContacts(student: {
    guardianPhone?: string | null;
    whatsappNumber?: string | null;
    parents?: { email?: string | null; phone?: string | null }[];
  }) {
    const parent = student.parents?.[0];
    return {
      email: parent?.email ?? undefined,
      phone: parent?.phone ?? student.guardianPhone ?? student.whatsappNumber ?? undefined,
    };
  }

  private async getSchool(schoolId: string) {
    return this.prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
  }

  private parseTargetRoles(targetRoles?: string | null): UserRole[] {
    if (!targetRoles || targetRoles === 'ALL') {
      return [
        UserRole.SCHOOL_ADMIN,
        UserRole.TEACHER,
        UserRole.ACCOUNTANT,
        UserRole.RECEPTIONIST,
        UserRole.PARENT,
        UserRole.STUDENT,
      ];
    }
    return targetRoles.split(',').map((r) => r.trim() as UserRole);
  }

  private async createInAppForRoles(
    schoolId: string,
    roles: UserRole[] | string[],
    opts: {
      eventType: NotificationEventType;
      title: string;
      body: string;
      linkUrl?: string;
      dedupeKey?: string;
      excludeUserIds?: string[];
    },
  ) {
    const exclude = new Set(opts.excludeUserIds ?? []);
    const users = await this.prisma.user.findMany({
      where: { schoolId, role: { in: roles as UserRole[] }, status: 'ACTIVE' },
      select: { id: true },
    });
    await Promise.allSettled(
      users
        .filter((u) => !exclude.has(u.id))
        .map((u) =>
          this.notifications.sendInApp({
            userId: u.id,
            schoolId,
            eventType: opts.eventType,
            title: opts.title,
            body: opts.body,
            linkUrl: opts.linkUrl,
            dedupeKey: opts.dedupeKey ? `${opts.dedupeKey}:${u.id}` : undefined,
          }),
        ),
    );
  }

  private async createInAppForClass(
    schoolId: string,
    classId: string,
    sectionId: string | null | undefined,
    opts: { eventType: NotificationEventType; title: string; body: string; linkUrl?: string },
  ) {
    const students = await this.prisma.student.findMany({
      where: {
        schoolId,
        classId,
        ...(sectionId ? { sectionId } : {}),
        status: 'ACTIVE',
      },
      select: { userId: true },
    });

    const parents = await this.prisma.parent.findMany({
      where: {
        schoolId,
        student: { classId, ...(sectionId ? { sectionId } : {}) },
        userId: { not: null },
      },
      select: { userId: true },
    });

    const userIds = new Set<string>();
    students.forEach((s) => s.userId && userIds.add(s.userId));
    parents.forEach((p) => p.userId && userIds.add(p.userId!));

    await Promise.allSettled(
      [...userIds].map((userId) =>
        this.notifications.sendInApp({
          userId,
          schoolId,
          eventType: opts.eventType,
          title: opts.title,
          body: opts.body,
          linkUrl: opts.linkUrl,
        }),
      ),
    );
  }
}
