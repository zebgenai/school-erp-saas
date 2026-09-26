import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import { PreviewIdCardsDto } from './dto/preview-id-cards.dto';
import { PreviewTeacherIdCardsDto } from './dto/preview-teacher-id-cards.dto';
import { IdCardsQueryDto } from './dto/id-cards-query.dto';
import { TeacherIdCardsQueryDto } from './dto/teacher-id-cards-query.dto';
import { UpdateTeacherIdCardSettingsDto } from './dto/update-teacher-id-card-settings.dto';
import { IdCardsService } from './id-cards.service';
import { TeacherIdCardsService } from './teacher-id-cards.service';

const VIEW_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.SCHOOL_ADMIN,
  UserRole.TEACHER,
  UserRole.RECEPTIONIST,
  UserRole.ACCOUNTANT,
] as const;

const MANAGE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.SCHOOL_ADMIN,
  UserRole.RECEPTIONIST,
] as const;

@ApiTags('ID Cards')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('id-cards')
export class IdCardsController {
  constructor(
    private readonly idCardsService: IdCardsService,
    private readonly teacherIdCardsService: TeacherIdCardsService,
  ) {}

  @ApiOperation({ summary: 'List built-in ID card templates' })
  @Roles(...VIEW_ROLES)
  @Get('templates')
  templates() {
    return this.idCardsService.listTemplates();
  }

  @ApiOperation({ summary: 'List issued active ID cards for the school' })
  @Roles(...VIEW_ROLES)
  @Get()
  findAll(@CurrentUserDecorator() user: CurrentUser, @Query() query: IdCardsQueryDto) {
    return this.idCardsService.findAll(user, query);
  }

  @ApiOperation({
    summary: 'Read-only preview of ID card layouts (does not mint QR tokens or create cards)',
  })
  @Roles(...VIEW_ROLES)
  @Post('preview')
  preview(@Body() dto: PreviewIdCardsDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.idCardsService.preview(dto, user);
  }

  @ApiOperation({
    summary: 'Bulk-generate active ID cards / QR tokens for selected students (manage only)',
  })
  @Roles(...MANAGE_ROLES)
  @Post('bulk-generate')
  bulkGenerate(@Body() dto: PreviewIdCardsDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.idCardsService.bulkGenerate(dto, user);
  }

  // ── Teacher ID cards (must be registered before student/:studentId to avoid route clashes) ──

  @ApiOperation({
    summary: 'Get teacher ID card design colors for the school (defaults if unset)',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Get('teacher-settings')
  getTeacherSettings(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.teacherIdCardsService.getTeacherSettings(user, schoolId);
  }

  @ApiOperation({
    summary: 'Update teacher ID card design colors (does not alter issued cards or QR tokens)',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Patch('teacher-settings')
  updateTeacherSettings(
    @Body() dto: UpdateTeacherIdCardSettingsDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.teacherIdCardsService.updateTeacherSettings(dto, user);
  }

  @ApiOperation({ summary: 'Reset teacher ID card design colors to defaults' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Post('teacher-settings/reset')
  resetTeacherSettings(
    @CurrentUserDecorator() user: CurrentUser,
    @Body() body: { schoolId?: string } = {},
  ) {
    return this.teacherIdCardsService.resetTeacherSettings(user, body.schoolId);
  }

  @ApiOperation({ summary: 'List issued active teacher ID cards for the school' })
  @Roles(...VIEW_ROLES)
  @Get('teachers')
  findAllTeachers(
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: TeacherIdCardsQueryDto,
  ) {
    return this.teacherIdCardsService.findAll(user, query);
  }

  @ApiOperation({
    summary: 'Read-only preview of teacher ID card layouts (does not mint QR tokens)',
  })
  @Roles(...VIEW_ROLES)
  @Post('teachers/preview')
  previewTeachers(
    @Body() dto: PreviewTeacherIdCardsDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.teacherIdCardsService.preview(dto, user);
  }

  @ApiOperation({ summary: 'Bulk-generate active teacher ID cards / QR tokens (manage only)' })
  @Roles(...MANAGE_ROLES)
  @Post('teachers/bulk-generate')
  bulkGenerateTeachers(
    @Body() dto: PreviewTeacherIdCardsDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.teacherIdCardsService.bulkGenerate(dto, user);
  }

  @ApiOperation({ summary: 'Resolve an active teacher ID card from a QR token (school-scoped)' })
  @Roles(...VIEW_ROLES)
  @Post('teachers/resolve')
  resolveTeacherCard(
    @Body() body: { token: string; schoolId?: string },
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    const schoolId = this.teacherIdCardsService.requireSchoolId(user, body.schoolId);
    return this.teacherIdCardsService.resolveActiveByToken(body.token, schoolId);
  }

  @ApiOperation({ summary: 'Get the current ID card for a teacher' })
  @Roles(...VIEW_ROLES)
  @Get('teacher/:teacherId')
  getForTeacher(
    @Param('teacherId') teacherId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.teacherIdCardsService.getForTeacher(teacherId, user, schoolId);
  }

  @ApiOperation({ summary: 'Issue an ID card if the teacher does not already have an active one' })
  @Roles(...MANAGE_ROLES)
  @Post('teacher/:teacherId')
  issueTeacher(
    @Param('teacherId') teacherId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.teacherIdCardsService.issue(teacherId, user, schoolId);
  }

  @ApiOperation({ summary: 'Revoke the current teacher card and issue a new QR token' })
  @Roles(...MANAGE_ROLES)
  @Post('teacher/:teacherId/reissue')
  reissueTeacher(
    @Param('teacherId') teacherId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.teacherIdCardsService.reissue(teacherId, user, schoolId);
  }

  @ApiOperation({ summary: 'Revoke the active teacher ID card without issuing a replacement' })
  @Roles(...MANAGE_ROLES)
  @Post('teacher/:teacherId/revoke')
  revokeTeacher(
    @Param('teacherId') teacherId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.teacherIdCardsService.revoke(teacherId, user, schoolId);
  }

  // ── Student ID cards ──

  @ApiOperation({ summary: 'Get the current ID card for a student' })
  @Roles(...VIEW_ROLES)
  @Get('student/:studentId')
  getForStudent(
    @Param('studentId') studentId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.idCardsService.getForStudent(studentId, user, schoolId);
  }

  @ApiOperation({ summary: 'Issue an ID card if the student does not already have an active one' })
  @Roles(...MANAGE_ROLES)
  @Post('student/:studentId')
  issue(
    @Param('studentId') studentId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.idCardsService.issue(studentId, user, schoolId);
  }

  @ApiOperation({ summary: 'Revoke the current card and issue a new QR token' })
  @Roles(...MANAGE_ROLES)
  @Post('student/:studentId/reissue')
  reissue(
    @Param('studentId') studentId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.idCardsService.reissue(studentId, user, schoolId);
  }

  @ApiOperation({ summary: 'Revoke the active ID card without issuing a replacement' })
  @Roles(...MANAGE_ROLES)
  @Post('student/:studentId/revoke')
  revoke(
    @Param('studentId') studentId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.idCardsService.revoke(studentId, user, schoolId);
  }
}
