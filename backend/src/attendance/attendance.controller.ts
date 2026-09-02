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
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { BulkAttendanceDto } from './dto/bulk-attendance.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

@ApiTags('Attendance')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

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
