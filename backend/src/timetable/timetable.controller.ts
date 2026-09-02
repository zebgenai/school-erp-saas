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
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import { CreateTimetableEntryDto } from './dto/create-timetable-entry.dto';
import { TimetableQueryDto } from './dto/timetable-query.dto';
import { UpdateTimetableEntryDto } from './dto/update-timetable-entry.dto';
import { TimetableService } from './timetable.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('timetable')
export class TimetableController {
  constructor(private readonly timetableService: TimetableService) {}

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Get()
  findAll(@CurrentUserDecorator() user: CurrentUser, @Query() query: TimetableQueryDto) {
    return this.timetableService.findAll(user, query);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Get('class/:classId')
  getClassTimetable(
    @Param('classId') classId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Query('sectionId') sectionId?: string,
  ) {
    return this.timetableService.getClassTimetable(classId, user, sectionId);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Get('teacher/:teacherId')
  getTeacherTimetable(
    @Param('teacherId') teacherId: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.timetableService.getTeacherTimetable(teacherId, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.timetableService.findOne(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Post()
  create(@Body() dto: CreateTimetableEntryDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.timetableService.create(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTimetableEntryDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.timetableService.update(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.timetableService.remove(id, user);
  }
}
