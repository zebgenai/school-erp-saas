import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/types/current-user.type';
import { ExamsService } from '../exams/exams.service';
import { FeesService } from '../fees/fees.service';
import { PayrollService } from '../payroll/payroll.service';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardQueryDto } from '../reports/dto/dashboard-query.dto';
import { ReportsService } from '../reports/reports.service';
import { StudentsService } from '../students/students.service';
import { MONTHS, createPdfBuffer } from './pdf-base';
import { PdfMeta, SchoolPdfInfo } from './pdf.types';
import { renderFeeInvoice, renderFeeReceipt } from './templates/fee.template';
import {
  renderExpenseReport,
  renderFeeDefaulters,
  renderFinancialReport,
  renderSalarySlip,
} from './templates/finance.template';
import {
  renderAttendanceReport,
  renderReportCard,
  renderStudentProfile,
} from './templates/student.template';
import { renderClassTimetable } from './templates/timetable.template';
import { ZipEntry, createZipBuffer } from './zip-base';

export interface PdfOutput {
  buffer: Buffer;
  filename: string;
}

/**
 * Archives are assembled in memory, so a batch is refused before it can exhaust the heap.
 * Reached far earlier than the invoice count limit when a school uses an oversized logo,
 * since PDFKit embeds the logo into every document.
 */
const MAX_ARCHIVE_BYTES = 150 * 1024 * 1024;

@Injectable()
export class PdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feesService: FeesService,
    private readonly studentsService: StudentsService,
    private readonly examsService: ExamsService,
    private readonly payrollService: PayrollService,
    private readonly reportsService: ReportsService,
  ) {}

  async generateFeeInvoice(invoiceId: string, user: CurrentUser): Promise<PdfOutput> {
    const invoice = await this.feesService.findOneInvoice(invoiceId, user);
    await this.assertParentInvoiceAccess(user, invoice.studentId);
    const school = await this.getSchoolInfo(invoice.schoolId);
    const meta: PdfMeta = {
      docNo: invoice.invoiceNo,
      title: 'Fee Invoice',
    };
    const buffer = await createPdfBuffer((doc) =>
      renderFeeInvoice(doc, school, meta, invoice),
    );
    return { buffer, filename: `invoice-${invoice.invoiceNo}.pdf` };
  }

  /**
   * Bundles a specific set of invoices — normally the ones a monthly generation run just
   * created — into a single ZIP so the browser downloads them in one go.
   */
  async generateFeeInvoiceArchive(
    invoiceIds: string[],
    user: CurrentUser,
  ): Promise<PdfOutput> {
    const unique = [...new Set(invoiceIds)];
    const invoices = await this.feesService.findInvoicesByIds(unique, user);

    const entries: ZipEntry[] = [];
    const schools = new Map<string, SchoolPdfInfo>();
    let totalBytes = 0;

    for (const invoice of invoices) {
      await this.assertParentInvoiceAccess(user, invoice.studentId);

      // A batch normally shares one school, so the lookup is cached rather than repeated
      // once per invoice.
      let school = schools.get(invoice.schoolId);
      if (!school) {
        school = await this.getSchoolInfo(invoice.schoolId);
        schools.set(invoice.schoolId, school);
      }

      const buffer = await createPdfBuffer((doc) =>
        renderFeeInvoice(doc, school, { docNo: invoice.invoiceNo, title: 'Fee Invoice' }, invoice),
      );

      totalBytes += buffer.length;
      if (totalBytes > MAX_ARCHIVE_BYTES) {
        throw new BadRequestException(
          'The generated invoices are too large to archive in one download. ' +
            'Generate a smaller batch, or reduce the size of the school logo used in PDFs.',
        );
      }

      entries.push({ name: `${invoice.invoiceNo}.pdf`, buffer });
    }

    const buffer = await createZipBuffer(entries);
    return { buffer, filename: `${this.archiveLabel(invoices)}.zip` };
  }

  /** `July-2026-Invoices` when the batch shares a period, otherwise a neutral label. */
  private archiveLabel(invoices: { month: number; year: number }[]): string {
    const [first] = invoices;
    const sharePeriod = invoices.every(
      (i) => i.month === first.month && i.year === first.year,
    );
    return sharePeriod
      ? `${MONTHS[first.month - 1]}-${first.year}-Invoices`
      : `Fee-Invoices-${new Date().toISOString().slice(0, 10)}`;
  }

  async generateFeeReceipt(paymentId: string, user: CurrentUser): Promise<PdfOutput> {
    const payment = await this.prisma.feePayment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: {
          include: {
            student: { include: { class: true, section: true } },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    this.assertSchoolAccess(user, payment.schoolId);
    await this.assertParentInvoiceAccess(user, payment.invoice.studentId);

    const school = await this.getSchoolInfo(payment.schoolId);
    const meta: PdfMeta = {
      docNo: payment.receiptNo,
      title: 'Fee Payment Receipt',
    };
    const buffer = await createPdfBuffer((doc) =>
      renderFeeReceipt(doc, school, meta, payment),
    );
    return { buffer, filename: `receipt-${payment.receiptNo}.pdf` };
  }

  async generateStudentProfile(studentId: string, user: CurrentUser): Promise<PdfOutput> {
    await this.assertStudentAccess(user, studentId);
    const student = await this.studentsService.findOne(studentId, user);
    const parents = await this.prisma.parent.findMany({
      where: { studentId },
      select: { fullName: true, phone: true, email: true },
    });
    const school = await this.getSchoolInfo(student.schoolId);
    const meta: PdfMeta = {
      docNo: `PRO-${student.admissionNo}`,
      title: 'Student Profile',
    };
    const buffer = await createPdfBuffer((doc) =>
      renderStudentProfile(doc, school, meta, { ...student, parents }),
    );
    return { buffer, filename: `student-${student.admissionNo}.pdf` };
  }

  async generateStudentAttendance(
    studentId: string,
    user: CurrentUser,
    query: DashboardQueryDto,
  ): Promise<PdfOutput> {
    const student = await this.assertStudentAccess(user, studentId);
    const endDateStr = query.endDate ?? new Date().toISOString().split('T')[0];
    const startDateStr = query.startDate ?? endDateStr;
    const startDate = new Date(`${startDateStr}T00:00:00.000Z`);
    const endDate = new Date(`${endDateStr}T23:59:59.999Z`);

    const records = await this.prisma.studentAttendance.findMany({
      where: {
        schoolId: student.schoolId,
        studentId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: 'asc' },
    });

    const present = records.filter((r) => r.status === AttendanceStatus.PRESENT).length;
    const absent = records.filter((r) => r.status === AttendanceStatus.ABSENT).length;
    const leave = records.filter((r) => r.status === AttendanceStatus.LEAVE).length;
    const late = records.filter((r) => r.status === AttendanceStatus.LATE).length;
    const total = records.length;
    const rate = total ? Math.round((present / total) * 100) : 0;

    const fullStudent = await this.studentsService.findOne(studentId, user);
    const school = await this.getSchoolInfo(student.schoolId);
    const meta: PdfMeta = {
      docNo: `ATT-${student.admissionNo}-${startDateStr}`,
      title: 'Student Attendance Report',
    };

    const buffer = await createPdfBuffer((doc) =>
      renderAttendanceReport(doc, school, meta, {
        student: fullStudent,
        summary: { present, absent, leave, late, total, rate },
        records,
        startDate: startDateStr,
        endDate: endDateStr,
      }),
    );
    return { buffer, filename: `attendance-${student.admissionNo}.pdf` };
  }

  async generateReportCard(
    examId: string,
    studentId: string,
    user: CurrentUser,
  ): Promise<PdfOutput> {
    await this.assertStudentAccess(user, studentId);
    const result = await this.examsService.getStudentResult(examId, studentId, user);

    const gradeRecord = result.grade
      ? await this.prisma.grade.findFirst({
          where: { schoolId: result.exam.schoolId, name: result.grade },
        })
      : null;

    const school = await this.getSchoolInfo(result.exam.schoolId);
    const meta: PdfMeta = {
      docNo: `RC-${result.exam.name.slice(0, 12).replace(/\s+/g, '-')}-${result.student.admissionNo}`,
      title: 'Student Report Card',
    };

    const buffer = await createPdfBuffer((doc) =>
      renderReportCard(doc, school, meta, { ...result, remarks: gradeRecord?.remarks }),
    );
    return {
      buffer,
      filename: `report-card-${result.student.admissionNo}.pdf`,
    };
  }

  async generateSalarySlip(payrollId: string, user: CurrentUser): Promise<PdfOutput> {
    const payroll = await this.payrollService.findOne(payrollId, user);
    const school = await this.getSchoolInfo(payroll.schoolId);
    const meta: PdfMeta = {
      docNo: `SAL-${payroll.staffName.slice(0, 10).replace(/\s+/g, '-')}-${payroll.month}-${payroll.year}`,
      title: 'Salary Slip',
    };
    const buffer = await createPdfBuffer((doc) =>
      renderSalarySlip(doc, school, meta, payroll),
    );
    return {
      buffer,
      filename: `salary-slip-${payroll.staffName.replace(/\s+/g, '-')}-${payroll.month}-${payroll.year}.pdf`,
    };
  }

  async generateExpenseReport(user: CurrentUser, query: DashboardQueryDto): Promise<PdfOutput> {
    const report = await this.reportsService.getExpenseReport(user, query);
    const schoolId = this.resolveSchoolId(user, query.schoolId);
    const school = await this.getSchoolInfo(schoolId);
    const meta: PdfMeta = {
      docNo: `EXP-${report.month}-${report.year}`,
      title: 'Expense Report',
    };
    const buffer = await createPdfBuffer((doc) =>
      renderExpenseReport(doc, school, meta, report),
    );
    return { buffer, filename: `expense-report-${report.month}-${report.year}.pdf` };
  }

  async generateFinancialReport(user: CurrentUser, query: DashboardQueryDto): Promise<PdfOutput> {
    const report = await this.reportsService.getProfitLossReport(user, query);
    const schoolId = this.resolveSchoolId(user, query.schoolId);
    const school = await this.getSchoolInfo(schoolId);
    const month = query.month;
    const meta: PdfMeta = {
      docNo: month ? `FIN-${month}-${report.year}` : `FIN-${report.year}`,
      title: 'Monthly Financial Report',
    };
    const buffer = await createPdfBuffer((doc) =>
      renderFinancialReport(doc, school, meta, report, month),
    );
    const label = month ? `${MONTHS[month - 1]}-${report.year}` : `${report.year}`;
    return { buffer, filename: `financial-report-${label}.pdf` };
  }

  async generateFeeDefaulters(user: CurrentUser, query: DashboardQueryDto): Promise<PdfOutput> {
    const defaulters = await this.reportsService.getFeeDefaulters(user, {
      ...query,
      limit: query.limit ?? 100,
    });
    const schoolId = this.resolveSchoolId(user, query.schoolId);
    const school = await this.getSchoolInfo(schoolId);
    const month = query.month ?? new Date().getUTCMonth() + 1;
    const year = query.year ?? new Date().getUTCFullYear();
    const period = `${MONTHS[month - 1]} ${year}`;
    const meta: PdfMeta = {
      docNo: `DEF-${month}-${year}`,
      title: 'Fee Defaulters Report',
    };
    const buffer = await createPdfBuffer((doc) =>
      renderFeeDefaulters(doc, school, meta, defaulters, period),
    );
    return { buffer, filename: `fee-defaulters-${month}-${year}.pdf` };
  }

  async generateClassTimetable(
    classId: string,
    user: CurrentUser,
    sectionId?: string,
  ): Promise<PdfOutput> {
    const classRecord = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!classRecord) throw new NotFoundException('Class not found');
    this.assertSchoolAccess(user, classRecord.schoolId);

    let sectionName: string | null = null;
    if (sectionId) {
      const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
      if (!section) throw new NotFoundException('Section not found');
      this.assertSchoolAccess(user, section.schoolId);
      sectionName = section.name;
    }

    const entries = await this.prisma.timetableEntry.findMany({
      where: {
        classId,
        schoolId: classRecord.schoolId,
        isActive: true,
        ...(sectionId ? { sectionId } : {}),
      },
      include: {
        subject: { select: { name: true } },
        teacher: { select: { fullName: true } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { periodNo: 'asc' }],
    });

    const school = await this.getSchoolInfo(classRecord.schoolId);
    const meta: PdfMeta = {
      docNo: `TT-${classRecord.name}${sectionName ? `-${sectionName}` : ''}`,
      title: 'Class Timetable',
    };
    const buffer = await createPdfBuffer((doc) =>
      renderClassTimetable(doc, school, meta, {
        className: classRecord.name,
        sectionName,
        entries,
      }),
    );

    const slug = `${classRecord.name}${sectionName ? `-${sectionName}` : ''}`.replace(/\s+/g, '-');
    return { buffer, filename: `timetable-${slug}.pdf` };
  }

  private async getSchoolInfo(schoolId: string): Promise<SchoolPdfInfo> {
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new NotFoundException('School not found');
    return {
      id: school.id,
      name: school.name,
      address: school.address,
      phone: school.phone,
      email: school.email,
      logoUrl: school.logoUrl,
    };
  }

  private resolveSchoolId(user: CurrentUser, schoolId?: string): string {
    if (user.role === UserRole.SUPER_ADMIN) {
      if (!schoolId) throw new ForbiddenException('schoolId is required for super admin');
      return schoolId;
    }
    if (!user.schoolId) throw new ForbiddenException('School context required');
    return user.schoolId;
  }

  private assertSchoolAccess(user: CurrentUser, schoolId: string) {
    if (user.role === UserRole.SUPER_ADMIN) return;
    if (user.schoolId !== schoolId) throw new ForbiddenException('Access denied');
  }

  private async assertStudentAccess(user: CurrentUser, studentId: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Student not found');
    this.assertSchoolAccess(user, student.schoolId);

    if (user.role === UserRole.PARENT) {
      const parent = await this.prisma.parent.findFirst({
        where: { userId: user.id, studentId },
      });
      if (!parent) throw new ForbiddenException('Not authorized for this student');
    }

    if (user.role === UserRole.STUDENT) {
      if (student.userId !== user.id) {
        throw new ForbiddenException('Not authorized for this student');
      }
    }

    return student;
  }

  private async assertParentInvoiceAccess(user: CurrentUser, studentId: string) {
    if (user.role === UserRole.PARENT) {
      const parent = await this.prisma.parent.findFirst({
        where: { userId: user.id, studentId },
      });
      if (!parent) throw new ForbiddenException('Not authorized for this invoice');
    }

    if (user.role === UserRole.STUDENT) {
      const student = await this.prisma.student.findFirst({
        where: { id: studentId, userId: user.id },
      });
      if (!student) throw new ForbiddenException('Not authorized for this invoice');
    }
  }
}
