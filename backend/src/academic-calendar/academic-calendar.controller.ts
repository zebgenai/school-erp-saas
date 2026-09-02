import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CalendarEventStatus, CalendarEventType, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import { AcademicCalendarService } from './academic-calendar.service';
import {
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from './dto/academic-calendar.dto';

const VIEW_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.SCHOOL_ADMIN,
  UserRole.TEACHER,
  UserRole.ACCOUNTANT,
  UserRole.RECEPTIONIST,
] as const;

const MANAGE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.SCHOOL_ADMIN,
  UserRole.TEACHER,
] as const;

@ApiTags('Academic Calendar')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('academic-calendar')
export class AcademicCalendarController {
  constructor(private readonly calendar: AcademicCalendarService) {}

  @ApiOperation({ summary: 'Event type / recurrence / visibility metadata' })
  @Get('meta')
  meta() {
    return this.calendar.eventTypes();
  }

  @ApiOperation({ summary: 'Unified calendar feed (manual + auto-integrated events)' })
  @Get('feed')
  feed(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('classId') classId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('eventType') eventType?: CalendarEventType,
    @Query('academicSession') academicSession?: string,
    @Query('includeDerived') includeDerived?: string,
  ) {
    return this.calendar.feed(user, {
      from,
      to,
      classId,
      sectionId,
      teacherId,
      eventType,
      academicSession,
      includeDerived: includeDerived !== 'false',
    });
  }

  @ApiOperation({ summary: 'Upcoming events for dashboards and portals' })
  @Get('upcoming')
  upcoming(@CurrentUserDecorator() user: CurrentUser, @Query('limit') limit?: string) {
    return this.calendar.upcoming(user, limit ? parseInt(limit, 10) : 5);
  }

  @ApiOperation({ summary: 'Calendar dashboard widgets' })
  @Get('widgets')
  widgets(@CurrentUserDecorator() user: CurrentUser) {
    return this.calendar.widgets(user);
  }

  @ApiOperation({ summary: 'Calendar reports (monthly, holidays, events, teacher, student)' })
  @Get('reports')
  reports(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('report') report?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('classId') classId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('eventType') eventType?: CalendarEventType,
    @Query('academicSession') academicSession?: string,
  ) {
    return this.calendar.reports(user, {
      report,
      month,
      year,
      from,
      to,
      classId,
      sectionId,
      teacherId,
      eventType,
      academicSession,
    });
  }

  @ApiOperation({ summary: 'List calendar events' })
  @Roles(...VIEW_ROLES)
  @Get()
  findAll(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('classId') classId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('eventType') eventType?: CalendarEventType,
    @Query('status') status?: CalendarEventStatus,
    @Query('academicSession') academicSession?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.calendar.findAll(user, {
      classId,
      sectionId,
      teacherId,
      eventType,
      status,
      academicSession,
      from,
      to,
      search,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @ApiOperation({ summary: 'Get calendar event detail' })
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.calendar.findOne(id, user);
  }

  @ApiOperation({ summary: 'Create calendar event' })
  @Roles(...MANAGE_ROLES)
  @Post()
  create(@Body() dto: CreateCalendarEventDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.calendar.create(dto, user);
  }

  @ApiOperation({ summary: 'Update calendar event' })
  @Roles(...MANAGE_ROLES)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.calendar.update(id, dto, user);
  }

  @ApiOperation({ summary: 'Publish calendar event' })
  @Roles(...MANAGE_ROLES)
  @Post(':id/publish')
  publish(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.calendar.publish(id, user);
  }

  @ApiOperation({ summary: 'Cancel calendar event' })
  @Roles(...MANAGE_ROLES)
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.calendar.cancel(id, user);
  }

  @ApiOperation({ summary: 'Delete calendar event' })
  @Roles(...MANAGE_ROLES)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.calendar.remove(id, user);
  }
}
