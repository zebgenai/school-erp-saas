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
import { MeetingProvider, OnlineClassStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import {
  CreateOnlineClassDto,
  LinkHomeworkDto,
  MarkAttendanceDto,
  UpdateOnlineClassDto,
} from './dto/online-class.dto';
import { OnlineClassesService } from './online-classes.service';

const VIEW_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.SCHOOL_ADMIN,
  UserRole.TEACHER,
  UserRole.ACCOUNTANT,
] as const;

const MANAGE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.SCHOOL_ADMIN,
  UserRole.TEACHER,
] as const;

@ApiTags('Online Classes')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('online-classes')
export class OnlineClassesController {
  constructor(private readonly onlineClasses: OnlineClassesService) {}

  @ApiOperation({ summary: 'Supported meeting providers' })
  @Get('providers')
  providers() {
    return { providers: this.onlineClasses.listProviders() };
  }

  @ApiOperation({ summary: 'My online classes (student/parent/teacher)' })
  @Roles(UserRole.STUDENT, UserRole.PARENT, UserRole.TEACHER)
  @Get('my')
  my(@CurrentUserDecorator() user: CurrentUser) {
    return this.onlineClasses.myClasses(user);
  }

  @ApiOperation({ summary: 'Online class calendar events' })
  @Get('calendar')
  calendar(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.onlineClasses.calendar(user, from, to);
  }

  @ApiOperation({ summary: 'Dashboard widgets' })
  @Get('widgets')
  widgets(@CurrentUserDecorator() user: CurrentUser) {
    return this.onlineClasses.widgets(user);
  }

  @ApiOperation({ summary: 'Online class reports' })
  @Roles(...VIEW_ROLES)
  @Get('reports')
  reports(@CurrentUserDecorator() user: CurrentUser) {
    return this.onlineClasses.reports(user);
  }

  @ApiOperation({ summary: 'List online classes' })
  @Roles(...VIEW_ROLES)
  @Get()
  findAll(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('classId') classId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('status') status?: OnlineClassStatus,
    @Query('provider') provider?: MeetingProvider,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.onlineClasses.findAll(user, {
      classId,
      sectionId,
      subjectId,
      teacherId,
      status,
      provider,
      from,
      to,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @ApiOperation({ summary: 'Get online class detail' })
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.onlineClasses.findOne(id, user);
  }

  @ApiOperation({ summary: 'Create online class' })
  @Roles(...MANAGE_ROLES)
  @Post()
  create(@Body() dto: CreateOnlineClassDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.onlineClasses.create(dto, user);
  }

  @ApiOperation({ summary: 'Update online class' })
  @Roles(...MANAGE_ROLES)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOnlineClassDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.onlineClasses.update(id, dto, user);
  }

  @ApiOperation({ summary: 'Delete online class' })
  @Roles(...MANAGE_ROLES)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.onlineClasses.remove(id, user);
  }

  @ApiOperation({ summary: 'Mark attendance (manual / post-class)' })
  @Roles(...MANAGE_ROLES)
  @Post(':id/attendance')
  markAttendance(
    @Param('id') id: string,
    @Body() dto: MarkAttendanceDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.onlineClasses.markAttendance(id, dto, user);
  }

  @ApiOperation({ summary: 'Link homework to online class' })
  @Roles(...MANAGE_ROLES)
  @Post(':id/link-homework')
  linkHomework(
    @Param('id') id: string,
    @Body() dto: LinkHomeworkDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.onlineClasses.linkHomework(id, dto, user);
  }

  @ApiOperation({ summary: 'Unlink homework from online class' })
  @Roles(...MANAGE_ROLES)
  @Delete(':id/link-homework/:homeworkId')
  unlinkHomework(
    @Param('id') id: string,
    @Param('homeworkId') homeworkId: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.onlineClasses.unlinkHomework(id, homeworkId, user);
  }
}
