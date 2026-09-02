import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceStatus,
  ExamStatus,
  FeeInvoiceStatus,
  PayrollStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getDashboardSummary(currentUser: CurrentUser, query: DashboardQueryDto) {
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);
    const now = new Date();
    const month = query.month ?? now.getUTCMonth() + 1;
    const year = query.year ?? now.getUTCFullYear();
    const dateStr = query.date ?? now.toISOString().split('T')[0];
    const date = this.normalizeDate(dateStr);

    const [totalStudents, activeStudents, inactiveStudents, totalTeachers, totalStaff, totalClasses, totalSections] =
      await Promise.all([
        this.prisma.student.count({ where: schoolFilter }),
        this.prisma.student.count({ where: { ...schoolFilter, status: 'ACTIVE' } }),
        this.prisma.student.count({ where: { ...schoolFilter, status: 'INACTIVE' } }),
        this.prisma.teacher.count({ where: { ...schoolFilter, status: 'ACTIVE' } }),
        this.prisma.staff.count({ where: { ...schoolFilter, status: 'ACTIVE' } }),
        this.prisma.class.count({ where: schoolFilter }),
        this.prisma.section.count({ where: schoolFilter }),
      ]);

    const [attendanceGroups, feeAggregate, feeStatusGroups] = await Promise.all([
      this.prisma.studentAttendance.groupBy({
        by: ['status'],
        where: { ...schoolFilter, date },
        _count: { id: true },
      }),
      this.prisma.feeInvoice.aggregate({
        where: { ...schoolFilter, month, year },
        _sum: { totalAmount: true, paidAmount: true },
        _count: { id: true },
      }),
      this.prisma.feeInvoice.groupBy({
        by: ['status'],
        where: { ...schoolFilter, month, year },
        _count: { id: true },
      }),
    ]);

    const attendanceMap = Object.fromEntries(
      attendanceGroups.map((g) => [g.status, g._count.id]),
    );
    const present = attendanceMap[AttendanceStatus.PRESENT] ?? 0;
    const absent = attendanceMap[AttendanceStatus.ABSENT] ?? 0;
    const leave = attendanceMap[AttendanceStatus.LEAVE] ?? 0;
    const late = attendanceMap[AttendanceStatus.LATE] ?? 0;
    const markedCount = attendanceGroups.reduce((s, g) => s + g._count.id, 0);
    const notMarked = Math.max(activeStudents - markedCount, 0);

    const totalAmount = feeAggregate._sum.totalAmount ?? 0;
    const totalPaid = feeAggregate._sum.paidAmount ?? 0;
    const feeStatusMap = Object.fromEntries(
      feeStatusGroups.map((g) => [g.status, g._count.id]),
    );

    const today = this.normalizeDate(now.toISOString().split('T')[0]);
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const [activeExams, upcomingExams, completedExams, expenseAggregate, payrollGroups] =
      await Promise.all([
        this.prisma.exam.count({
          where: { ...schoolFilter, status: ExamStatus.ACTIVE },
        }),
        this.prisma.exam.count({
          where: {
            ...schoolFilter,
            status: { not: ExamStatus.CANCELLED },
            startDate: { gt: today },
          },
        }),
        this.prisma.exam.count({
          where: { ...schoolFilter, status: ExamStatus.COMPLETED },
        }),
        this.prisma.expense.aggregate({
          where: {
            ...schoolFilter,
            status: { not: 'CANCELLED' },
            date: { gte: monthStart, lte: monthEnd },
          },
          _sum: { amount: true },
          _count: { id: true },
        }),
        this.prisma.payroll.groupBy({
          by: ['status'],
          where: { ...schoolFilter, month, year },
          _count: { id: true },
          _sum: { netSalary: true },
        }),
      ]);

    const payrollMap = Object.fromEntries(
      payrollGroups.map((g) => [
        g.status,
        { count: g._count.id, totalNet: g._sum.netSalary ?? 0 },
      ]),
    );

    // ── Finance summary ────────────────────────────────────────────
    const feeCollected   = totalPaid;
    const feePending     = Math.max(totalAmount - totalPaid, 0);
    const salaryExpenses = payrollMap[PayrollStatus.PAID]?.totalNet ?? 0;
    const otherExpenses  = expenseAggregate._sum.amount ?? 0;
    const netProfit      = feeCollected - salaryExpenses - otherExpenses;

    return {
      totalStudents,
      activeStudents,
      inactiveStudents,
      totalTeachers,
      totalStaff,
      totalClasses,
      totalSections,
      todayAttendance: {
        date: dateStr,
        present,
        absent,
        leave,
        late,
        notMarked,
      },
      fees: {
        month,
        year,
        totalInvoices: feeAggregate._count.id,
        totalAmount,
        totalPaid,
        totalPending: Math.max(totalAmount - totalPaid, 0),
        paidInvoices: feeStatusMap[FeeInvoiceStatus.PAID] ?? 0,
        partialInvoices: feeStatusMap[FeeInvoiceStatus.PARTIAL] ?? 0,
        unpaidInvoices: feeStatusMap[FeeInvoiceStatus.UNPAID] ?? 0,
      },
      exams: {
        activeExams,
        upcomingExams,
        completedExams,
      },
      expenses: {
        month,
        year,
        totalAmount: otherExpenses,
        totalCount: expenseAggregate._count.id,
      },
      payroll: {
        month,
        year,
        pending: payrollMap[PayrollStatus.PENDING] ?? { count: 0, totalNet: 0 },
        paid: payrollMap[PayrollStatus.PAID] ?? { count: 0, totalNet: 0 },
        cancelled: payrollMap[PayrollStatus.CANCELLED] ?? { count: 0, totalNet: 0 },
        totalNetSalary:
          (payrollMap[PayrollStatus.PENDING]?.totalNet ?? 0) +
          (payrollMap[PayrollStatus.PAID]?.totalNet ?? 0),
      },
      finance: {
        month,
        year,
        feeCollected,
        feePending,
        salaryExpenses,
        otherExpenses,
        netProfit,
      },
    };
  }

  async getRecentAdmissions(currentUser: CurrentUser, query: DashboardQueryDto) {
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);
    const limit = query.limit ?? 10;

    const students = await this.prisma.student.findMany({
      where: schoolFilter,
      include: { class: true, section: true },
      orderBy: { admissionDate: 'desc' },
      take: limit,
    });

    return students.map((student) => ({
      id: student.id,
      admissionNo: student.admissionNo,
      fullName: student.fullName,
      fatherName: student.fatherName,
      class: student.class,
      section: student.section,
      admissionDate: student.admissionDate,
    }));
  }

  async getFeeDefaulters(currentUser: CurrentUser, query: DashboardQueryDto) {
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);
    await this.validateClassSectionFilters(schoolFilter, query);

    const limit = query.limit ?? 20;

    const invoices = await this.prisma.feeInvoice.findMany({
      where: {
        ...schoolFilter,
        status: { in: [FeeInvoiceStatus.UNPAID, FeeInvoiceStatus.PARTIAL] },
        ...(query.month ? { month: query.month } : {}),
        ...(query.year ? { year: query.year } : {}),
        ...(query.classId || query.sectionId
          ? {
              student: {
                ...(query.classId ? { classId: query.classId } : {}),
                ...(query.sectionId ? { sectionId: query.sectionId } : {}),
              },
            }
          : {}),
      },
      include: {
        student: { include: { class: true, section: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });

    return invoices.map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo,
      studentName: invoice.student.fullName,
      admissionNo: invoice.student.admissionNo,
      className: invoice.student.class?.name ?? null,
      sectionName: invoice.student.section?.name ?? null,
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount,
      pendingAmount: invoice.totalAmount - invoice.paidAmount,
      status: invoice.status,
      dueDate: invoice.dueDate,
    }));
  }

  async getMonthlyFeeChart(currentUser: CurrentUser, query: DashboardQueryDto) {
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);
    const year = query.year ?? new Date().getUTCFullYear();

    const invoices = await this.prisma.feeInvoice.findMany({
      where: { ...schoolFilter, year },
    });

    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const monthInvoices = invoices.filter((inv) => inv.month === month);
      const totalAmount = monthInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
      const totalPaid = monthInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);

      return {
        month,
        totalAmount,
        totalPaid,
        totalPending: totalAmount - totalPaid,
      };
    });
  }

  async getAttendanceChart(currentUser: CurrentUser, query: DashboardQueryDto) {
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);
    await this.validateClassSectionFilters(schoolFilter, query);

    const endDateStr = query.endDate ?? new Date().toISOString().split('T')[0];
    const endDate = this.normalizeDate(endDateStr);
    const startDate = query.startDate
      ? this.normalizeDate(query.startDate)
      : this.addDays(endDate, -6);

    if (startDate > endDate) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }

    const records = await this.prisma.studentAttendance.findMany({
      where: {
        ...schoolFilter,
        date: { gte: startDate, lte: endDate },
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      },
    });

    const dates = this.getDateRange(startDate, endDate);

    return dates.map((date) => {
      const dayRecords = records.filter((r) => r.date.getTime() === date.getTime());
      return {
        date: date.toISOString().split('T')[0],
        present: dayRecords.filter((r) => r.status === AttendanceStatus.PRESENT).length,
        absent: dayRecords.filter((r) => r.status === AttendanceStatus.ABSENT).length,
        leave: dayRecords.filter((r) => r.status === AttendanceStatus.LEAVE).length,
        late: dayRecords.filter((r) => r.status === AttendanceStatus.LATE).length,
      };
    });
  }

  async getStudentCountByClass(currentUser: CurrentUser, query: DashboardQueryDto) {
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);

    const [classes, studentGroups] = await Promise.all([
      this.prisma.class.findMany({
        where: schoolFilter,
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      this.prisma.student.groupBy({
        by: ['classId'],
        where: { ...schoolFilter, status: 'ACTIVE', classId: { not: null } },
        _count: { id: true },
      }),
    ]);

    const countMap = Object.fromEntries(
      studentGroups.map((g) => [g.classId, g._count.id]),
    );

    return classes.map((classRecord) => ({
      classId: classRecord.id,
      className: classRecord.name,
      totalStudents: countMap[classRecord.id] ?? 0,
    }));
  }

  async getUpcomingExams(currentUser: CurrentUser, query: DashboardQueryDto) {
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);
    const limit = query.limit ?? 10;
    const today = this.normalizeDate(new Date().toISOString().split('T')[0]);

    const exams = await this.prisma.exam.findMany({
      where: {
        ...schoolFilter,
        status: { in: [ExamStatus.ACTIVE, ExamStatus.DRAFT] },
        OR: [{ startDate: { gte: today } }, { startDate: null }],
      },
      include: { class: true, section: true },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });

    return exams.map((exam) => ({
      id: exam.id,
      name: exam.name,
      className: exam.class.name,
      sectionName: exam.section?.name ?? null,
      startDate: exam.startDate,
      endDate: exam.endDate,
      status: exam.status,
    }));
  }

  // ─── Detailed Reports ────────────────────────────────────────────────────────

  async getAttendanceReport(currentUser: CurrentUser, query: DashboardQueryDto) {
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);
    const endDateStr = query.endDate ?? new Date().toISOString().split('T')[0];
    const startDateStr = query.startDate ?? endDateStr;
    const startDate = this.normalizeDate(startDateStr);
    const endDate = this.normalizeDate(endDateStr);

    const records = await this.prisma.studentAttendance.findMany({
      where: {
        ...schoolFilter,
        date: { gte: startDate, lte: endDate },
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      },
      include: {
        student: { select: { id: true, fullName: true, admissionNo: true } },
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
      },
      orderBy: [{ date: 'asc' }, { student: { fullName: 'asc' } }],
    });

    const students = [...new Map(records.map((r) => [r.studentId, r.student])).values()];

    const summary = {
      totalRecords: records.length,
      present: records.filter((r) => r.status === AttendanceStatus.PRESENT).length,
      absent: records.filter((r) => r.status === AttendanceStatus.ABSENT).length,
      leave: records.filter((r) => r.status === AttendanceStatus.LEAVE).length,
      late: records.filter((r) => r.status === AttendanceStatus.LATE).length,
    };

    const byStudent = students.map((student) => {
      const studentRecords = records.filter((r) => r.studentId === student.id);
      return {
        student,
        present: studentRecords.filter((r) => r.status === AttendanceStatus.PRESENT).length,
        absent: studentRecords.filter((r) => r.status === AttendanceStatus.ABSENT).length,
        leave: studentRecords.filter((r) => r.status === AttendanceStatus.LEAVE).length,
        late: studentRecords.filter((r) => r.status === AttendanceStatus.LATE).length,
        totalDays: studentRecords.length,
      };
    });

    return { startDate: startDateStr, endDate: endDateStr, summary, byStudent, records };
  }

  async getFeeReport(currentUser: CurrentUser, query: DashboardQueryDto) {
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);
    const now = new Date();
    const month = query.month ?? now.getUTCMonth() + 1;
    const year = query.year ?? now.getUTCFullYear();

    const invoices = await this.prisma.feeInvoice.findMany({
      where: {
        ...schoolFilter,
        ...(query.month ? { month } : {}),
        ...(query.year ? { year } : {}),
        ...(query.classId ? { student: { classId: query.classId } } : {}),
        ...(query.sectionId ? { student: { sectionId: query.sectionId } } : {}),
      },
      include: {
        student: { include: { class: true, section: true } },
        payments: { orderBy: { paymentDate: 'desc' } },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { student: { fullName: 'asc' } }],
    });

    const totalAmount = invoices.reduce((s, i) => s + i.totalAmount, 0);
    const totalPaid   = invoices.reduce((s, i) => s + i.paidAmount, 0);
    const totalPending = totalAmount - totalPaid;

    return {
      month,
      year,
      summary: {
        totalInvoices: invoices.length,
        totalAmount,
        totalPaid,
        totalPending,
        paid: invoices.filter((i) => i.status === FeeInvoiceStatus.PAID).length,
        partial: invoices.filter((i) => i.status === FeeInvoiceStatus.PARTIAL).length,
        unpaid: invoices.filter((i) => i.status === FeeInvoiceStatus.UNPAID).length,
      },
      invoices,
    };
  }

  async getExpenseReport(currentUser: CurrentUser, query: DashboardQueryDto) {
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);
    const now = new Date();
    const month = query.month ?? now.getUTCMonth() + 1;
    const year = query.year ?? now.getUTCFullYear();
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const expenses = await this.prisma.expense.findMany({
      where: {
        ...schoolFilter,
        status: { not: 'CANCELLED' },
        ...(query.startDate || query.endDate
          ? {
              date: {
                ...(query.startDate ? { gte: new Date(query.startDate) } : { gte: monthStart }),
                ...(query.endDate ? { lte: new Date(`${query.endDate}T23:59:59.999Z`) } : { lte: monthEnd }),
              },
            }
          : { date: { gte: monthStart, lte: monthEnd } }),
      },
      include: { category: true },
      orderBy: [{ date: 'desc' }],
    });

    const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);

    const byCategory = Object.values(
      expenses.reduce<Record<string, { categoryId: string; categoryName: string; total: number; count: number }>>(
        (acc, e) => {
          const key = e.categoryId;
          if (!acc[key]) acc[key] = { categoryId: key, categoryName: e.category.name, total: 0, count: 0 };
          acc[key].total += e.amount;
          acc[key].count += 1;
          return acc;
        },
        {},
      ),
    );

    return { month, year, summary: { totalAmount, totalCount: expenses.length }, byCategory, expenses };
  }

  async getSalaryReport(currentUser: CurrentUser, query: DashboardQueryDto) {
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);
    const now = new Date();
    const month = query.month ?? now.getUTCMonth() + 1;
    const year = query.year ?? now.getUTCFullYear();

    const payrolls = await this.prisma.payroll.findMany({
      where: {
        ...schoolFilter,
        ...(query.month ? { month } : {}),
        ...(query.year ? { year } : {}),
      },
      include: {
        teacher: { select: { id: true, fullName: true } },
        staff: { select: { id: true, fullName: true, designation: true } },
        paidBy: { select: { id: true, name: true } },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { staffName: 'asc' }],
    });

    const active = payrolls.filter((p) => p.status !== 'CANCELLED');
    const totalNetSalary = active.reduce((s, p) => s + p.netSalary, 0);
    const totalPaid = payrolls.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.netSalary, 0);
    const totalPending = payrolls.filter((p) => p.status === 'PENDING').reduce((s, p) => s + p.netSalary, 0);

    return {
      month,
      year,
      summary: {
        totalRecords: active.length,
        totalNetSalary,
        totalPaid,
        totalPending,
        paidCount: payrolls.filter((p) => p.status === 'PAID').length,
        pendingCount: payrolls.filter((p) => p.status === 'PENDING').length,
        cancelledCount: payrolls.filter((p) => p.status === 'CANCELLED').length,
      },
      payrolls,
    };
  }

  async getStudentReport(currentUser: CurrentUser, query: DashboardQueryDto) {
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);

    const students = await this.prisma.student.findMany({
      where: {
        ...schoolFilter,
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      },
      include: {
        class: true,
        section: true,
      },
      orderBy: [{ class: { name: 'asc' } }, { fullName: 'asc' }],
    });

    const now = new Date();
    const month = query.month ?? now.getUTCMonth() + 1;
    const year = query.year ?? now.getUTCFullYear();
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const [attendanceRecords, invoices] = await Promise.all([
      this.prisma.studentAttendance.findMany({
        where: {
          ...schoolFilter,
          date: { gte: monthStart, lte: monthEnd },
          ...(query.classId ? { classId: query.classId } : {}),
        },
      }),
      this.prisma.feeInvoice.findMany({
        where: { ...schoolFilter, month, year },
      }),
    ]);

    const studentRows = students.map((s) => {
      const sAtt = attendanceRecords.filter((a) => a.studentId === s.id);
      const sInv = invoices.find((i) => i.studentId === s.id);
      return {
        id: s.id,
        fullName: s.fullName,
        admissionNo: s.admissionNo,
        class: s.class?.name ?? '—',
        section: s.section?.name ?? '—',
        status: s.status,
        attendance: {
          present: sAtt.filter((a) => a.status === AttendanceStatus.PRESENT).length,
          absent: sAtt.filter((a) => a.status === AttendanceStatus.ABSENT).length,
          leave: sAtt.filter((a) => a.status === AttendanceStatus.LEAVE).length,
          late: sAtt.filter((a) => a.status === AttendanceStatus.LATE).length,
          total: sAtt.length,
        },
        fee: sInv
          ? { totalAmount: sInv.totalAmount, paidAmount: sInv.paidAmount, status: sInv.status }
          : null,
      };
    });

    return {
      month,
      year,
      totalStudents: students.length,
      active: students.filter((s) => s.status === 'ACTIVE').length,
      inactive: students.filter((s) => s.status !== 'ACTIVE').length,
      students: studentRows,
    };
  }

  async getProfitLossReport(currentUser: CurrentUser, query: DashboardQueryDto) {
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);
    const year = query.year ?? new Date().getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

    const [invoices, expenses, payrolls] = await Promise.all([
      this.prisma.feeInvoice.findMany({
        where: { ...schoolFilter, year },
        select: { month: true, paidAmount: true },
      }),
      this.prisma.expense.findMany({
        where: {
          ...schoolFilter,
          status: { not: 'CANCELLED' },
          date: { gte: yearStart, lte: yearEnd },
        },
        select: { date: true, amount: true },
      }),
      this.prisma.payroll.findMany({
        where: { ...schoolFilter, status: PayrollStatus.PAID, year },
        select: { month: true, netSalary: true },
      }),
    ]);

    const revenueByMonth = Array.from({ length: 12 }, () => 0);
    const expensesByMonth = Array.from({ length: 12 }, () => 0);
    const salaryByMonth = Array.from({ length: 12 }, () => 0);

    for (const inv of invoices) {
      if (inv.month >= 1 && inv.month <= 12) {
        revenueByMonth[inv.month - 1] += inv.paidAmount;
      }
    }
    for (const exp of expenses) {
      const m = exp.date.getUTCMonth();
      expensesByMonth[m] += exp.amount;
    }
    for (const p of payrolls) {
      if (p.month >= 1 && p.month <= 12) {
        salaryByMonth[p.month - 1] += p.netSalary;
      }
    }

    const rows = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const revenue = revenueByMonth[i];
      const expensesTotal = expensesByMonth[i];
      const salary = salaryByMonth[i];
      const profit = revenue - expensesTotal - salary;
      return {
        month,
        revenue,
        expenses: expensesTotal,
        salary,
        totalExpenses: expensesTotal + salary,
        profit,
      };
    });

    const totals = rows.reduce(
      (acc, r) => ({
        revenue:       acc.revenue       + r.revenue,
        expenses:      acc.expenses      + r.expenses,
        salary:        acc.salary        + r.salary,
        totalExpenses: acc.totalExpenses + r.totalExpenses,
        profit:        acc.profit        + r.profit,
      }),
      { revenue: 0, expenses: 0, salary: 0, totalExpenses: 0, profit: 0 },
    );

    return { year, months: rows, totals };
  }

  async getExamResultReport(currentUser: CurrentUser, query: DashboardQueryDto) {
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);

    const exams = await this.prisma.exam.findMany({
      where: {
        ...schoolFilter,
        status: ExamStatus.COMPLETED,
        ...(query.classId   ? { classId:   query.classId }   : {}),
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      },
      include: {
        class:        { select: { name: true } },
        section:      { select: { name: true } },
        examSubjects: { include: { subject: { select: { name: true } } } },
        marks: {
          include: {
            student: { select: { id: true, fullName: true, admissionNo: true } },
            subject: { select: { name: true } },
          },
        },
      },
      orderBy: { startDate: 'desc' },
      take: query.limit ?? 5,
    });

    return exams.map((exam) => {
      const totalStudents = [...new Set(exam.marks.map((m) => m.studentId))].length;

      return {
        examId:       exam.id,
        examName:     exam.name,
        class:        exam.class?.name,
        section:      exam.section?.name,
        startDate:    exam.startDate,
        status:       exam.status,
        totalStudents,
        subjects: exam.examSubjects.map((es) => {
          const subjectMarks = exam.marks.filter((m) => m.subjectId === es.subjectId);
          const passCount = subjectMarks.filter((m) => m.obtainedMarks >= es.passingMarks).length;
          return {
            subject:     es.subject?.name,
            totalMarks:  es.totalMarks,
            passingMarks: es.passingMarks,
            passRate: subjectMarks.length > 0
              ? Math.round((passCount / subjectMarks.length) * 100)
              : 0,
            results: subjectMarks.map((m) => ({
              student:       m.student.fullName,
              admissionNo:   m.student.admissionNo,
              marksObtained: m.obtainedMarks,
              passed:        m.obtainedMarks >= es.passingMarks,
              remarks:       m.remarks,
            })),
          };
        }),
      };
    });
  }

  async getRecentFeePayments(currentUser: CurrentUser, query: DashboardQueryDto) {
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);
    const limit = query.limit ?? 10;

    const payments = await this.prisma.feePayment.findMany({
      where: schoolFilter,
      include: {
        invoice: {
          include: { student: { select: { fullName: true, admissionNo: true } } },
        },
      },
      orderBy: { paymentDate: 'desc' },
      take: limit,
    });

    return payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      paymentDate: p.paymentDate,
      studentName: p.invoice?.student?.fullName ?? '—',
      admissionNo: p.invoice?.student?.admissionNo ?? '—',
    }));
  }

  private async validateClassSectionFilters(
    schoolFilter: Prisma.StudentWhereInput | { schoolId?: string },
    query: DashboardQueryDto,
  ) {
    const schoolId = 'schoolId' in schoolFilter ? schoolFilter.schoolId : undefined;
    if (!schoolId) return;

    if (query.classId) {
      const classRecord = await this.prisma.class.findUnique({ where: { id: query.classId } });
      if (!classRecord) {
        throw new NotFoundException('Class not found');
      }
      if (classRecord.schoolId !== schoolId) {
        throw new ForbiddenException('Class does not belong to the specified school');
      }
    }

    if (query.sectionId) {
      const section = await this.prisma.section.findUnique({ where: { id: query.sectionId } });
      if (!section) {
        throw new NotFoundException('Section not found');
      }
      if (section.schoolId !== schoolId) {
        throw new ForbiddenException('Section does not belong to the specified school');
      }
      if (query.classId && section.classId !== query.classId) {
        throw new BadRequestException('Section does not belong to the specified class');
      }
    }
  }

  private normalizeDate(dateStr: string): Date {
    return new Date(`${dateStr}T00:00:00.000Z`);
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  private getDateRange(start: Date, end: Date): Date[] {
    const dates: Date[] = [];
    const current = new Date(start);

    while (current <= end) {
      dates.push(new Date(current));
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
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
}
