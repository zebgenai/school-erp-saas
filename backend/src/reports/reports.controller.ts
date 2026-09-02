import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { ReportsService } from './reports.service';

const ADMIN_ROLES = [UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN] as const;
const FEE_ROLES = [UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT] as const;
const TEACHER_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.SCHOOL_ADMIN,
  UserRole.TEACHER,
] as const;
const DASHBOARD_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.SCHOOL_ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.TEACHER,
  UserRole.RECEPTIONIST,
] as const;

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @ApiOperation({ summary: 'Dashboard summary for school admin' })
  @Roles(...DASHBOARD_ROLES)
  @Get('dashboard-summary')
  getDashboardSummary(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.reportsService.getDashboardSummary(user, query);
  }

  @ApiOperation({ summary: 'Recent student admissions' })
  @Roles(...ADMIN_ROLES, UserRole.TEACHER, UserRole.RECEPTIONIST)
  @Get('recent-admissions')
  getRecentAdmissions(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.reportsService.getRecentAdmissions(user, query);
  }

  @ApiOperation({ summary: 'Fee defaulters list' })
  @Roles(...FEE_ROLES, UserRole.RECEPTIONIST)
  @Get('fee-defaulters')
  getFeeDefaulters(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.reportsService.getFeeDefaulters(user, query);
  }

  @ApiOperation({ summary: 'Monthly fee collection chart data' })
  @Roles(...FEE_ROLES, UserRole.RECEPTIONIST)
  @Get('monthly-fee-chart')
  getMonthlyFeeChart(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.reportsService.getMonthlyFeeChart(user, query);
  }

  @ApiOperation({ summary: 'Attendance chart by date' })
  @Roles(...TEACHER_ROLES, UserRole.RECEPTIONIST)
  @Get('attendance-chart')
  getAttendanceChart(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.reportsService.getAttendanceChart(user, query);
  }

  @ApiOperation({ summary: 'Active student count by class' })
  @Roles(...TEACHER_ROLES)
  @Get('student-count-by-class')
  getStudentCountByClass(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.reportsService.getStudentCountByClass(user, query);
  }

  @ApiOperation({ summary: 'Upcoming and active exams' })
  @Roles(...TEACHER_ROLES)
  @Get('upcoming-exams')
  getUpcomingExams(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.reportsService.getUpcomingExams(user, query);
  }

  @ApiOperation({ summary: 'Recent fee payments for dashboard' })
  @Roles(...FEE_ROLES)
  @Get('recent-fee-payments')
  getRecentFeePayments(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.reportsService.getRecentFeePayments(user, query);
  }

  // ─── Detailed Reports ────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Detailed attendance report by date range, class, or section' })
  @Roles(...TEACHER_ROLES)
  @Get('attendance')
  getAttendanceReport(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.reportsService.getAttendanceReport(user, query);
  }

  @ApiOperation({ summary: 'Detailed fee collection report for a month/year' })
  @Roles(...FEE_ROLES)
  @Get('fees')
  getFeeReport(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.reportsService.getFeeReport(user, query);
  }

  @ApiOperation({ summary: 'Detailed expense report with category breakdown' })
  @Roles(...FEE_ROLES)
  @Get('expenses')
  getExpenseReport(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.reportsService.getExpenseReport(user, query);
  }

  @ApiOperation({ summary: 'Monthly salary / payroll report' })
  @Roles(...ADMIN_ROLES, UserRole.ACCOUNTANT)
  @Get('salary')
  getSalaryReport(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.reportsService.getSalaryReport(user, query);
  }

  @ApiOperation({ summary: 'Per-student summary: attendance + fee status for a month' })
  @Roles(...TEACHER_ROLES, UserRole.ACCOUNTANT)
  @Get('students')
  getStudentReport(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.reportsService.getStudentReport(user, query);
  }

  @ApiOperation({ summary: 'Monthly Profit & Loss report for a year' })
  @Roles(...FEE_ROLES)
  @Get('profit-loss')
  getProfitLossReport(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.reportsService.getProfitLossReport(user, query);
  }

  @ApiOperation({ summary: 'Exam result report by class/section' })
  @Roles(...TEACHER_ROLES, UserRole.ACCOUNTANT)
  @Get('exam-results')
  getExamResultReport(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.reportsService.getExamResultReport(user, query);
  }
}
