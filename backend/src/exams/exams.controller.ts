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
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import { BulkMarksDto } from './dto/bulk-marks.dto';
import { CreateExamDto } from './dto/create-exam.dto';
import { CreateExamSubjectDto } from './dto/create-exam-subject.dto';
import { CreateGradeDto } from './dto/create-grade.dto';
import { EnterMarkDto } from './dto/enter-mark.dto';
import { ExamQueryDto } from './dto/exam-query.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';
import { ExamsService } from './exams.service';

const VIEW_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.SCHOOL_ADMIN,
  UserRole.TEACHER,
  UserRole.ACCOUNTANT,
] as const;

const MANAGE_ROLES = [UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN] as const;

const MARK_ROLES = [UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER] as const;

@ApiTags('Exams')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('exams')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @ApiOperation({ summary: 'List grade scales' })
  @Roles(...VIEW_ROLES)
  @Get('grades')
  findAllGrades(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.examsService.findAllGrades(user, schoolId);
  }

  @ApiOperation({ summary: 'Create grade scale' })
  @Roles(...MANAGE_ROLES)
  @Post('grades')
  createGrade(@Body() dto: CreateGradeDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.examsService.createGrade(dto, user);
  }

  @ApiOperation({ summary: 'Update grade scale' })
  @Roles(...MANAGE_ROLES)
  @Patch('grades/:id')
  updateGrade(
    @Param('id') id: string,
    @Body() dto: UpdateGradeDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.examsService.updateGrade(id, dto, user);
  }

  @ApiOperation({ summary: 'Delete grade scale' })
  @Roles(...MANAGE_ROLES)
  @Delete('grades/:id')
  removeGrade(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.examsService.removeGrade(id, user);
  }

  @ApiOperation({ summary: 'Enter single student mark' })
  @Roles(...MARK_ROLES)
  @Post('marks')
  enterMark(@Body() dto: EnterMarkDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.examsService.enterMark(dto, user);
  }

  @ApiOperation({ summary: 'Enter marks in bulk for one subject' })
  @Roles(...MARK_ROLES)
  @Post('marks/bulk')
  enterBulkMarks(@Body() dto: BulkMarksDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.examsService.enterBulkMarks(dto, user);
  }

  @ApiOperation({ summary: 'List exams' })
  @Roles(...VIEW_ROLES)
  @Get()
  findAllExams(@CurrentUserDecorator() user: CurrentUser, @Query() query: ExamQueryDto) {
    return this.examsService.findAllExams(user, query);
  }

  @ApiOperation({ summary: 'Create exam' })
  @Roles(...MANAGE_ROLES)
  @Post()
  createExam(@Body() dto: CreateExamDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.examsService.createExam(dto, user);
  }

  @ApiOperation({ summary: 'Get class result list for an exam' })
  @Roles(...VIEW_ROLES)
  @Get(':examId/results')
  getClassResults(@Param('examId') examId: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.examsService.getClassResults(examId, user);
  }

  @ApiOperation({ summary: 'Get student result for an exam' })
  @Roles(...VIEW_ROLES, UserRole.PARENT, UserRole.STUDENT)
  @Get(':examId/result/:studentId')
  getStudentResult(
    @Param('examId') examId: string,
    @Param('studentId') studentId: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.examsService.getStudentResult(examId, studentId, user);
  }

  @ApiOperation({ summary: 'List marks for an exam' })
  @Roles(...VIEW_ROLES)
  @Get(':examId/marks')
  findMarks(
    @Param('examId') examId: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Query() query: ExamQueryDto,
  ) {
    return this.examsService.findMarks(examId, user, query);
  }

  @ApiOperation({ summary: 'Add subject to exam' })
  @Roles(...MANAGE_ROLES)
  @Post(':examId/subjects')
  addExamSubject(
    @Param('examId') examId: string,
    @Body() dto: CreateExamSubjectDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.examsService.addExamSubject(examId, dto, user);
  }

  @ApiOperation({ summary: 'List exam subjects' })
  @Roles(...VIEW_ROLES)
  @Get(':examId/subjects')
  findExamSubjects(@Param('examId') examId: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.examsService.findExamSubjects(examId, user);
  }

  @ApiOperation({ summary: 'Remove subject from exam' })
  @Roles(...MANAGE_ROLES)
  @Delete(':examId/subjects/:examSubjectId')
  removeExamSubject(
    @Param('examId') examId: string,
    @Param('examSubjectId') examSubjectId: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.examsService.removeExamSubject(examId, examSubjectId, user);
  }

  @ApiOperation({ summary: 'Get exam by id' })
  @Roles(...VIEW_ROLES)
  @Get(':id')
  findOneExam(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.examsService.findOneExam(id, user);
  }

  @ApiOperation({ summary: 'Update exam' })
  @Roles(...MANAGE_ROLES)
  @Patch(':id')
  updateExam(
    @Param('id') id: string,
    @Body() dto: UpdateExamDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.examsService.updateExam(id, dto, user);
  }

  @ApiOperation({ summary: 'Cancel exam (soft delete)' })
  @Roles(...MANAGE_ROLES)
  @Delete(':id')
  removeExam(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.examsService.removeExam(id, user);
  }
}
