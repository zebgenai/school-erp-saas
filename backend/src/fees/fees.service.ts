import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FeeInvoiceStatus, Prisma, UserRole } from '@prisma/client';
import { SchoolAuditService } from '../audit-logs/school-audit.service';
import { resolvePagination } from '../common/dto/pagination-query.dto';
import { paginatedResult } from '../common/utils/paginated-result';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEngineService } from '../notifications/notification-engine.service';
import { CreateBulkInvoicesDto } from './dto/create-bulk-invoices.dto';
import { CreateFeeInvoiceDto } from './dto/create-fee-invoice.dto';
import { CreateFeeStructureDto } from './dto/create-fee-structure.dto';
import { FeeQueryDto } from './dto/fee-query.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { UpdateFeeStructureDto } from './dto/update-fee-structure.dto';

const structureInclude = { class: true } satisfies Prisma.FeeStructureInclude;

const invoiceListInclude = {
  student: { include: { class: true, section: true } },
  payments: { orderBy: { paymentDate: 'desc' as const }, take: 1 },
} satisfies Prisma.FeeInvoiceInclude;

const invoiceInclude = {
  student: { include: { class: true, section: true } },
  payments: { orderBy: { paymentDate: 'desc' as const } },
} satisfies Prisma.FeeInvoiceInclude;

/**
 * Window in which an identical payment (same invoice, amount and method) is treated as an
 * accidental re-submission rather than a second genuine instalment.
 */
const DUPLICATE_PAYMENT_WINDOW_MS = 60_000;

type InvoiceLike = { totalAmount: number; paidAmount: number };

/** Expose the outstanding balance so clients do not have to recompute it. */
function withPendingAmount<T extends InvoiceLike>(invoice: T): T & { pendingAmount: number } {
  return { ...invoice, pendingAmount: Math.max(invoice.totalAmount - invoice.paidAmount, 0) };
}

@Injectable()
export class FeesService {
  constructor(
    private prisma: PrismaService,
    private readonly notificationEngine: NotificationEngineService,
    private schoolAudit: SchoolAuditService,
  ) {}

  async findAllStructures(currentUser: CurrentUser, query: FeeQueryDto) {
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);

    return this.prisma.feeStructure.findMany({
      where: {
        ...schoolFilter,
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      },
      include: structureInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createStructure(dto: CreateFeeStructureDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);

    if (dto.classId) {
      await this.assertClassBelongsToSchool(dto.classId, schoolId);
    }

    return this.prisma.feeStructure.create({
      data: {
        schoolId,
        title: dto.title,
        amount: dto.amount,
        classId: dto.classId,
        description: dto.description,
      },
      include: structureInclude,
    });
  }

  async updateStructure(id: string, dto: UpdateFeeStructureDto, currentUser: CurrentUser) {
    const structure = await this.findStructureOrThrow(id);
    this.assertSchoolAccess(currentUser, structure.schoolId);

    if (dto.classId) {
      await this.assertClassBelongsToSchool(dto.classId, structure.schoolId);
    }

    return this.prisma.feeStructure.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.classId !== undefined ? { classId: dto.classId } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: structureInclude,
    });
  }

  async removeStructure(id: string, currentUser: CurrentUser) {
    const structure = await this.findStructureOrThrow(id);
    this.assertSchoolAccess(currentUser, structure.schoolId);

    return this.prisma.feeStructure.update({
      where: { id },
      data: { isActive: false },
      include: structureInclude,
    });
  }

  async findAllInvoices(currentUser: CurrentUser, query: FeeQueryDto) {
    const where = this.buildInvoiceWhere(currentUser, query);
    const { take, skip } = resolvePagination(query);

    const [data, total] = await Promise.all([
      this.prisma.feeInvoice.findMany({
        where,
        include: invoiceListInclude,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.feeInvoice.count({ where }),
    ]);

    return paginatedResult(data.map(withPendingAmount), total, take, skip);
  }

  async findOneInvoice(id: string, currentUser: CurrentUser) {
    const invoice = await this.findInvoiceOrThrow(id);
    this.assertSchoolAccess(currentUser, invoice.schoolId);
    return withPendingAmount(invoice);
  }

  async createInvoice(dto: CreateFeeInvoiceDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);
    await this.assertStudentBelongsToSchool(dto.studentId, schoolId);

    const existing = await this.prisma.feeInvoice.findUnique({
      where: {
        schoolId_studentId_month_year: {
          schoolId,
          studentId: dto.studentId,
          month: dto.month,
          year: dto.year,
        },
      },
    });
    if (existing) {
      throw new BadRequestException('Invoice already exists for this student, month, and year');
    }

    const discount = dto.discount ?? 0;
    const fine = dto.fine ?? 0;
    const totalAmount = dto.amount - discount + fine;
    const invoiceNo = await this.generateInvoiceNo(schoolId, dto.year);

    const invoice = await this.prisma.feeInvoice.create({
      data: {
        schoolId,
        studentId: dto.studentId,
        invoiceNo,
        month: dto.month,
        year: dto.year,
        amount: dto.amount,
        discount,
        fine,
        totalAmount,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        notes: dto.notes,
      },
      include: invoiceInclude,
    });

    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitFeeInvoiceGenerated(schoolId, invoice.id),
    );

    return withPendingAmount(invoice);
  }

  async createBulkInvoices(dto: CreateBulkInvoicesDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);

    if (dto.classId) {
      await this.assertClassBelongsToSchool(dto.classId, schoolId);
    }
    if (dto.sectionId) {
      await this.assertSectionBelongsToSchool(dto.sectionId, schoolId);
      if (dto.classId) {
        const section = await this.prisma.section.findUnique({ where: { id: dto.sectionId } });
        if (section && section.classId !== dto.classId) {
          throw new BadRequestException('Section does not belong to the specified class');
        }
      }
    }

    const students = await this.prisma.student.findMany({
      where: {
        schoolId,
        status: 'ACTIVE',
        ...(dto.classId ? { classId: dto.classId } : {}),
        ...(dto.sectionId ? { sectionId: dto.sectionId } : {}),
      },
    });

    const invoiceIds: string[] = [];
    const invoiceNos: string[] = [];
    let skipped = 0;

    for (const student of students) {
      const existing = await this.prisma.feeInvoice.findUnique({
        where: {
          schoolId_studentId_month_year: {
            schoolId,
            studentId: student.id,
            month: dto.month,
            year: dto.year,
          },
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      const invoiceNo = await this.generateInvoiceNo(schoolId, dto.year);
      const amount = student.monthlyFee;
      const totalAmount = amount;

      const invoice = await this.prisma.feeInvoice.create({
        data: {
          schoolId,
          studentId: student.id,
          invoiceNo,
          month: dto.month,
          year: dto.year,
          amount,
          discount: 0,
          fine: 0,
          totalAmount,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        },
      });

      this.notificationEngine.dispatch(() =>
        this.notificationEngine.emitFeeInvoiceGenerated(schoolId, invoice.id),
      );

      invoiceIds.push(invoice.id);
      invoiceNos.push(invoice.invoiceNo);
    }

    return {
      created: invoiceIds.length,
      skipped,
      // Callers download exactly the invoices this operation produced.
      invoiceIds,
      invoiceNos,
      month: dto.month,
      year: dto.year,
    };
  }

  async recordPayment(dto: RecordPaymentDto, currentUser: CurrentUser) {
    const invoice = await this.findInvoiceOrThrow(dto.invoiceId);
    this.assertSchoolAccess(currentUser, invoice.schoolId);

    if (invoice.status === FeeInvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot record payment for a cancelled invoice');
    }

    if (!Number.isInteger(dto.amount) || dto.amount <= 0) {
      throw new BadRequestException('Payment amount must be a positive whole number');
    }

    const remaining = invoice.totalAmount - invoice.paidAmount;
    if (remaining <= 0) {
      throw new BadRequestException('Invoice is already fully paid');
    }
    if (dto.amount > remaining) {
      throw new BadRequestException('Payment amount exceeds remaining invoice balance');
    }

    await this.assertNotDuplicatePayment(invoice.id, dto);

    const receiptNo = await this.generateReceiptNo(invoice.schoolId, new Date().getFullYear());
    const newPaidAmount = invoice.paidAmount + dto.amount;
    const newStatus = this.computeInvoiceStatus(newPaidAmount, invoice.totalAmount);

    // The payment row and the invoice balance must move together, otherwise a failure
    // between the two leaves the invoice understating what was collected.
    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.feeInvoice.updateMany({
        // Guarded by the balance we validated against, so two concurrent submissions
        // cannot both apply on top of the same starting balance.
        where: { id: invoice.id, paidAmount: invoice.paidAmount },
        data: { paidAmount: newPaidAmount, status: newStatus },
      });
      if (count === 0) {
        throw new BadRequestException(
          'Invoice balance changed while recording this payment. Please review the invoice and try again.',
        );
      }

      await tx.feePayment.create({
        data: {
          schoolId: invoice.schoolId,
          invoiceId: invoice.id,
          receiptNo,
          amount: dto.amount,
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined,
          method: dto.method,
          notes: dto.notes,
        },
      });

      return tx.feeInvoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: invoiceInclude,
      });
    });

    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitFeePaid(
        invoice.schoolId,
        invoice.id,
        dto.amount,
        receiptNo,
      ),
    );

    await this.schoolAudit.log({
      schoolId: invoice.schoolId,
      userId: currentUser.id,
      action: 'FEE_PAYMENT_RECORDED',
      entity: 'FeePayment',
      entityId: invoice.id,
      details: { amount: dto.amount, receiptNo, method: dto.method },
    });

    return withPendingAmount(updated);
  }

  /**
   * Rejects a repeat of the same payment shortly after the original, which is what a
   * double-clicked save button or a retried request looks like.
   */
  private async assertNotDuplicatePayment(invoiceId: string, dto: RecordPaymentDto) {
    const recent = await this.prisma.feePayment.findFirst({
      where: {
        invoiceId,
        amount: dto.amount,
        method: dto.method ?? null,
        createdAt: { gte: new Date(Date.now() - DUPLICATE_PAYMENT_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recent) {
      throw new BadRequestException(
        `An identical payment of ${dto.amount} was just recorded on this invoice (receipt ${recent.receiptNo}). ` +
          'Refresh the invoice before recording another payment.',
      );
    }
  }

  /**
   * Creates this month's invoice for a newly admitted (or just-updated) student and
   * optionally records a cash payment so the form's Paid / Unpaid choice is real data,
   * not a disconnected flag on the student row.
   */
  async applyAdmissionFee(
    student: { id: string; schoolId: string; monthlyFee: number },
    feeStatus: 'PAID' | 'UNPAID',
    currentUser: CurrentUser,
  ) {
    if (!student.monthlyFee || student.monthlyFee <= 0) return null;

    this.assertSchoolAccess(currentUser, student.schoolId);

    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const year = now.getUTCFullYear();

    let invoice = await this.prisma.feeInvoice.findUnique({
      where: {
        schoolId_studentId_month_year: {
          schoolId: student.schoolId,
          studentId: student.id,
          month,
          year,
        },
      },
    });

    if (!invoice) {
      const invoiceNo = await this.generateInvoiceNo(student.schoolId, year);
      invoice = await this.prisma.feeInvoice.create({
        data: {
          schoolId: student.schoolId,
          studentId: student.id,
          invoiceNo,
          month,
          year,
          amount: student.monthlyFee,
          discount: 0,
          fine: 0,
          totalAmount: student.monthlyFee,
          status: FeeInvoiceStatus.UNPAID,
        },
      });
    }

    const remaining = invoice.totalAmount - invoice.paidAmount;
    if (feeStatus === 'PAID' && remaining > 0) {
      return this.recordPayment(
        {
          invoiceId: invoice.id,
          amount: remaining,
          method: 'CASH',
          notes: 'Recorded at admission',
        },
        currentUser,
      );
    }

    return invoice;
  }

  async getSummary(currentUser: CurrentUser, query: FeeQueryDto) {
    const where = this.buildInvoiceWhere(currentUser, query);

    const invoices = await this.prisma.feeInvoice.findMany({ where });

    const totalInvoices = invoices.length;
    const totalAmount = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
    const totalPending = totalAmount - totalPaid;
    const paidInvoices = invoices.filter((inv) => inv.status === FeeInvoiceStatus.PAID).length;
    const partialInvoices = invoices.filter((inv) => inv.status === FeeInvoiceStatus.PARTIAL).length;
    const unpaidInvoices = invoices.filter((inv) => inv.status === FeeInvoiceStatus.UNPAID).length;

    return {
      totalInvoices,
      totalAmount,
      totalPaid,
      totalPending,
      paidInvoices,
      partialInvoices,
      unpaidInvoices,
    };
  }

  async getDefaulters(currentUser: CurrentUser, query: FeeQueryDto) {
    const where = this.buildInvoiceWhere(currentUser, {
      ...query,
      status: undefined,
    });

    where.status = { in: [FeeInvoiceStatus.UNPAID, FeeInvoiceStatus.PARTIAL] };

    const defaulters = await this.prisma.feeInvoice.findMany({
      where,
      include: invoiceInclude,
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }],
    });

    return defaulters.map(withPendingAmount);
  }

  /**
   * Loads a specific set of invoices for bulk export, scoped to the caller's school.
   */
  async findInvoicesByIds(ids: string[], currentUser: CurrentUser) {
    const invoices = await this.prisma.feeInvoice.findMany({
      where: {
        id: { in: ids },
        ...this.buildSchoolFilter(currentUser),
      },
      include: invoiceInclude,
      orderBy: { invoiceNo: 'asc' },
    });

    if (invoices.length === 0) {
      throw new NotFoundException('No matching invoices found');
    }

    return invoices.map(withPendingAmount);
  }

  private buildInvoiceWhere(
    currentUser: CurrentUser,
    query: FeeQueryDto,
  ): Prisma.FeeInvoiceWhereInput {
    const where: Prisma.FeeInvoiceWhereInput = {
      ...this.buildSchoolFilter(currentUser, query.schoolId),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.month ? { month: query.month } : {}),
      ...(query.year ? { year: query.year } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    if (query.classId || query.sectionId || query.search) {
      where.student = {
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
        ...(query.search
          ? {
              OR: [
                { fullName: { contains: query.search, mode: 'insensitive' } },
                { admissionNo: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
    }

    return where;
  }

  private computeInvoiceStatus(paidAmount: number, totalAmount: number): FeeInvoiceStatus {
    if (paidAmount <= 0) return FeeInvoiceStatus.UNPAID;
    if (paidAmount >= totalAmount) return FeeInvoiceStatus.PAID;
    return FeeInvoiceStatus.PARTIAL;
  }

  private async generateInvoiceNo(schoolId: string, year: number): Promise<string> {
    const prefix = `INV-${year}-`;
    const latest = await this.prisma.feeInvoice.findFirst({
      where: { schoolId, invoiceNo: { startsWith: prefix } },
      orderBy: { invoiceNo: 'desc' },
    });

    const next = latest ? parseInt(latest.invoiceNo.split('-').pop() || '0', 10) + 1 : 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  private async generateReceiptNo(schoolId: string, year: number): Promise<string> {
    const prefix = `RCP-${year}-`;
    const latest = await this.prisma.feePayment.findFirst({
      where: { schoolId, receiptNo: { startsWith: prefix } },
      orderBy: { receiptNo: 'desc' },
    });

    const next = latest ? parseInt(latest.receiptNo.split('-').pop() || '0', 10) + 1 : 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  private async findStructureOrThrow(id: string) {
    const structure = await this.prisma.feeStructure.findUnique({
      where: { id },
      include: structureInclude,
    });
    if (!structure) {
      throw new NotFoundException('Fee structure not found');
    }
    return structure;
  }

  private async findInvoiceOrThrow(id: string) {
    const invoice = await this.prisma.feeInvoice.findUnique({
      where: { id },
      include: invoiceInclude,
    });
    if (!invoice) {
      throw new NotFoundException('Fee invoice not found');
    }
    return invoice;
  }

  private async assertClassBelongsToSchool(classId: string, schoolId: string) {
    const classRecord = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!classRecord) {
      throw new NotFoundException('Class not found');
    }
    if (classRecord.schoolId !== schoolId) {
      throw new BadRequestException('Class does not belong to the specified school');
    }
  }

  private async assertSectionBelongsToSchool(sectionId: string, schoolId: string) {
    const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
    if (!section) {
      throw new NotFoundException('Section not found');
    }
    if (section.schoolId !== schoolId) {
      throw new BadRequestException('Section does not belong to the specified school');
    }
  }

  private async assertStudentBelongsToSchool(studentId: string, schoolId: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    if (student.schoolId !== schoolId) {
      throw new BadRequestException('Student does not belong to the specified school');
    }
  }

  private resolveSchoolId(currentUser: CurrentUser, schoolId?: string): string {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      if (!schoolId) {
        throw new BadRequestException('schoolId is required');
      }
      return schoolId;
    }

    if (!currentUser.schoolId) {
      throw new ForbiddenException('School context missing');
    }

    if (schoolId && schoolId !== currentUser.schoolId) {
      throw new ForbiddenException('Cannot access another school\'s data');
    }

    return currentUser.schoolId;
  }

  private buildSchoolFilter(currentUser: CurrentUser, schoolId?: string) {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      return schoolId ? { schoolId } : {};
    }

    if (!currentUser.schoolId) {
      throw new ForbiddenException('School context missing');
    }

    if (schoolId && schoolId !== currentUser.schoolId) {
      throw new ForbiddenException('Cannot access another school\'s data');
    }

    return { schoolId: currentUser.schoolId };
  }

  private assertSchoolAccess(currentUser: CurrentUser, resourceSchoolId: string) {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      return;
    }

    if (!currentUser.schoolId) {
      throw new ForbiddenException('School context missing');
    }

    if (currentUser.schoolId !== resourceSchoolId) {
      throw new ForbiddenException('Cannot access another school\'s data');
    }
  }
}
