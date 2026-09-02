import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CorsHeadersInterceptor } from '../common/interceptors/cors-headers.interceptor';
import { CurrentUser } from '../common/types/current-user.type';
import { sendAttachment } from '../common/utils/send-attachment';
import { DashboardQueryDto } from '../reports/dto/dashboard-query.dto';
import { InvoiceArchiveDto } from './dto/invoice-archive.dto';
import { PdfService } from './pdf.service';

const FEE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.SCHOOL_ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.RECEPTIONIST,
  UserRole.PARENT,
  UserRole.STUDENT,
] as const;

/** Bulk invoice export mirrors the roles allowed to generate invoices. */
const FEE_MANAGE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.SCHOOL_ADMIN,
  UserRole.ACCOUNTANT,
] as const;

const STUDENT_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.SCHOOL_ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.TEACHER,
  UserRole.RECEPTIONIST,
  UserRole.PARENT,
  UserRole.STUDENT,
] as const;

const EXAM_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.SCHOOL_ADMIN,
  UserRole.TEACHER,
  UserRole.ACCOUNTANT,
  UserRole.PARENT,
  UserRole.STUDENT,
] as const;

const PAYROLL_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.SCHOOL_ADMIN,
  UserRole.ACCOUNTANT,
] as const;

const TIMETABLE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.SCHOOL_ADMIN,
  UserRole.TEACHER,
  UserRole.RECEPTIONIST,
  UserRole.PARENT,
  UserRole.STUDENT,
] as const;

const FINANCE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.SCHOOL_ADMIN,
  UserRole.ACCOUNTANT,
] as const;

@ApiTags('PDF')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(CorsHeadersInterceptor)
@Controller('pdf')
export class PdfController {
  constructor(private readonly pdfService: PdfService) {}

  @ApiOperation({ summary: 'Download fee invoice PDF' })
  @Roles(...FEE_ROLES)
  @Get('fee-invoice/:id')
  async feeInvoice(
    @Param('id') id: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.pdfService.generateFeeInvoice(id, user);
    sendAttachment(res, buffer, 'application/pdf', filename);
  }

  @ApiOperation({ summary: 'Download a ZIP archive of the given fee invoice PDFs' })
  @Roles(...FEE_MANAGE_ROLES)
  @Post('fee-invoices/archive')
  async feeInvoiceArchive(
    @Body() dto: InvoiceArchiveDto,
    @CurrentUserDecorator() user: CurrentUser,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.pdfService.generateFeeInvoiceArchive(
      dto.invoiceIds,
      user,
    );
    sendAttachment(res, buffer, 'application/zip', filename);
  }

  @ApiOperation({ summary: 'Download fee payment receipt PDF' })
  @Roles(...FEE_ROLES)
  @Get('fee-receipt/:paymentId')
  async feeReceipt(
    @Param('paymentId') paymentId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.pdfService.generateFeeReceipt(paymentId, user);
    sendAttachment(res, buffer, 'application/pdf', filename);
  }

  @ApiOperation({ summary: 'Download student profile PDF' })
  @Roles(...STUDENT_ROLES)
  @Get('student-profile/:studentId')
  async studentProfile(
    @Param('studentId') studentId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.pdfService.generateStudentProfile(studentId, user);
    sendAttachment(res, buffer, 'application/pdf', filename);
  }

  @ApiOperation({ summary: 'Download student attendance report PDF' })
  @Roles(...STUDENT_ROLES)
  @Get('student-attendance/:studentId')
  async studentAttendance(
    @Param('studentId') studentId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: DashboardQueryDto,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.pdfService.generateStudentAttendance(
      studentId,
      user,
      query,
    );
    sendAttachment(res, buffer, 'application/pdf', filename);
  }

  @ApiOperation({ summary: 'Download student report card PDF' })
  @Roles(...EXAM_ROLES)
  @Get('report-card/:examId/:studentId')
  async reportCard(
    @Param('examId') examId: string,
    @Param('studentId') studentId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.pdfService.generateReportCard(
      examId,
      studentId,
      user,
    );
    sendAttachment(res, buffer, 'application/pdf', filename);
  }

  @ApiOperation({ summary: 'Download salary slip PDF' })
  @Roles(...PAYROLL_ROLES)
  @Get('salary-slip/:payrollId')
  async salarySlip(
    @Param('payrollId') payrollId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.pdfService.generateSalarySlip(payrollId, user);
    sendAttachment(res, buffer, 'application/pdf', filename);
  }

  @ApiOperation({ summary: 'Download expense report PDF' })
  @Roles(...FINANCE_ROLES)
  @Get('expense-report')
  async expenseReport(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: DashboardQueryDto,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.pdfService.generateExpenseReport(user, query);
    sendAttachment(res, buffer, 'application/pdf', filename);
  }

  @ApiOperation({ summary: 'Download monthly financial report PDF' })
  @Roles(...FINANCE_ROLES)
  @Get('financial-report')
  async financialReport(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: DashboardQueryDto,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.pdfService.generateFinancialReport(user, query);
    sendAttachment(res, buffer, 'application/pdf', filename);
  }

  @ApiOperation({ summary: 'Download class timetable PDF' })
  @Roles(...TIMETABLE_ROLES)
  @Get('class-timetable/:classId')
  async classTimetable(
    @Param('classId') classId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Query('sectionId') sectionId: string | undefined,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.pdfService.generateClassTimetable(
      classId,
      user,
      sectionId || undefined,
    );
    sendAttachment(res, buffer, 'application/pdf', filename);
  }

  @ApiOperation({ summary: 'Download fee defaulters report PDF' })
  @Roles(...FEE_ROLES)
  @Get('fee-defaulters')
  async feeDefaulters(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: DashboardQueryDto,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.pdfService.generateFeeDefaulters(user, query);
    sendAttachment(res, buffer, 'application/pdf', filename);
  }
}
