import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import { AttendanceService } from './attendance.service';
import { TeacherAttendanceService } from './teacher-attendance.service';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { TodayRosterQueryDto } from './dto/today-roster-query.dto';
import { BulkAttendanceDto } from './dto/bulk-attendance.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { QrScanDto } from './dto/qr-scan.dto';
import { TeacherAttendanceQueryDto } from './dto/teacher-attendance-query.dto';
import { TeacherPunchDto } from './dto/teacher-punch.dto';
import { TeacherQrScanDto } from './dto/teacher-qr-scan.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

@ApiTags('Attendance')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly teacherAttendanceService: TeacherAttendanceService,
  ) {}

  @ApiOperation({
    summary: 'Punch teacher attendance (check-in / check-out)',
    description:
      "Server decides check-in vs check-out from today's open record. Client timestamps are ignored. Teachers may only punch their own record.",
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Post('teachers/punch')
  punchTeacher(
    @Body() dto: TeacherPunchDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.teacherAttendanceService.punch(dto, user);
  }

  @ApiOperation({
    summary: 'Mark teacher attendance from a Teacher ID card QR token (TCC1.)',
    description:
      'School-staff only (SCHOOL_ADMIN, TEACHER, RECEPTIONIST, ATTENDANCE_SCANNER). Identity comes from the QR token → TeacherIdCard — never from a client teacherId. SUPER_ADMIN is excluded (needs school context).',
  })
  @Roles(
    UserRole.SCHOOL_ADMIN,
    UserRole.TEACHER,
    UserRole.RECEPTIONIST,
    UserRole.ATTENDANCE_SCANNER,
  )
  @Post('teachers/qr-scan')
  punchTeacherFromQr(
    @Body() dto: TeacherQrScanDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.teacherAttendanceService.punchFromQr(dto, user);
  }

  @ApiOperation({ summary: 'List teacher attendance records for a work date' })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.SCHOOL_ADMIN,
    UserRole.TEACHER,
    UserRole.ACCOUNTANT,
    UserRole.RECEPTIONIST,
  )
  @Get('teachers')
  findTeacherAttendance(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: TeacherAttendanceQueryDto,
  ) {
    return this.teacherAttendanceService.findAll(user, query);
  }

  @ApiOperation({ summary: 'Mark single student attendance' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Post()
  mark(@Body() dto: MarkAttendanceDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.attendanceService.mark(dto, user);
  }

  @ApiOperation({ summary: 'Mark class/section attendance in bulk' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Post('bulk')
  markBulk(@Body() dto: BulkAttendanceDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.attendanceService.markBulk(dto, user);
  }

  @ApiOperation({
    summary: 'Mark attendance from a student ID card QR token',
    description:
      'School-staff only (SCHOOL_ADMIN, TEACHER, ATTENDANCE_SCANNER). SUPER_ADMIN is excluded because QR scans require unambiguous school context; platform admins should use manual attendance with an explicit schoolId.',
  })
  @Roles(UserRole.SCHOOL_ADMIN, UserRole.TEACHER, UserRole.ATTENDANCE_SCANNER)
  @Post('qr-scan')
  markFromQrScan(@Body() dto: QrScanDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.attendanceService.markFromQrScan(dto, user);
  }

  @ApiOperation({
    summary: 'School-local calendar date used as the attendance default',
    description:
      'School users use their own school. Super admins must pass a valid schoolId. Asia/Karachi is used only when that school has no timezone. Does not use the server UTC date.',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER, UserRole.ACCOUNTANT, UserRole.RECEPTIONIST)
  @Get('school-today')
  getSchoolToday(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.attendanceService.getSchoolToday(user, schoolId);
  }

  @ApiOperation({
    summary: 'Full class register with saved attendance for one date',
    description:
      'Returns every active student in the class or section and their saved status. Unmarked students are null, not Present. Not paginated, up to the register limit.',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER, UserRole.ACCOUNTANT, UserRole.RECEPTIONIST)
  @Get('register')
  getRegister(@CurrentUserDecorator() user: CurrentUser, @Query() query: AttendanceQueryDto) {
    return this.attendanceService.getRegister(user, query);
  }

  @ApiOperation({
    summary: "School Admin today's attendance counts in the school timezone",
    description:
      'Active students only. Not Marked is active students with no saved row. Late is counted separately and is not Not Marked. A schoolId other than the signed-in school is rejected.',
  })
  @Roles(UserRole.SCHOOL_ADMIN)
  @Get('today-overview')
  getTodayOverview(@CurrentUserDecorator() user: CurrentUser, @Query('schoolId') schoolId?: string) {
    return this.attendanceService.getTodayOverview(user, { schoolId });
  }

  @ApiOperation({
    summary: "School Admin roster for one of today's attendance categories",
    description:
      'Paginated active students for PRESENT, ABSENT, LEAVE, LATE, or NOT_MARKED. Read-only. Class and section must belong to the signed-in school.',
  })
  @Roles(UserRole.SCHOOL_ADMIN)
  @Get('today-roster')
  getTodayRoster(@CurrentUserDecorator() user: CurrentUser, @Query() query: TodayRosterQueryDto) {
    return this.attendanceService.getTodayRoster(user, query);
  }

  @ApiOperation({ summary: 'List attendance records' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER, UserRole.ACCOUNTANT, UserRole.RECEPTIONIST)
  @Get()
  findAll(@CurrentUserDecorator() user: CurrentUser, @Query() query: AttendanceQueryDto) {
    return this.attendanceService.findAll(user, query);
  }

  @ApiOperation({ summary: 'Get daily attendance summary' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER, UserRole.ACCOUNTANT, UserRole.RECEPTIONIST)
  @Get('summary')
  getSummary(@CurrentUserDecorator() user: CurrentUser, @Query() query: AttendanceQueryDto) {
    return this.attendanceService.getSummary(user, query);
  }

  @ApiOperation({ summary: 'Get class attendance report for a date range' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER, UserRole.ACCOUNTANT, UserRole.RECEPTIONIST)
  @Get('class-report')
  getClassReport(@CurrentUserDecorator() user: CurrentUser, @Query() query: AttendanceQueryDto) {
    return this.attendanceService.getClassReport(user, query);
  }

  @ApiOperation({ summary: 'Update attendance record' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAttendanceDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.attendanceService.update(id, dto, user);
  }
}
