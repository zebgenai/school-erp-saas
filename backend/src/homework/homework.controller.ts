import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HomeworkStatus, UserRole } from '@prisma/client';
import { diskStorage } from 'multer';
import * as crypto from 'crypto';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import {
  CreateHomeworkDto,
  GradeHomeworkDto,
  ReturnHomeworkDto,
  SubmitHomeworkDto,
  UpdateHomeworkDto,
} from './dto/homework.dto';
import { HomeworkService } from './homework.service';
import { UPLOAD_DIR, ensureUploadDir } from '../common/utils/upload-path';

ensureUploadDir();

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

const storage = diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const unique = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${unique}${ext}`);
  },
});

const homeworkFileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  const allowedExt = [
    '.pdf',
    '.doc',
    '.docx',
    '.ppt',
    '.pptx',
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.gif',
    '.zip',
  ];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExt.includes(ext)) cb(null, true);
  else cb(new Error('File type not allowed for homework'), false);
};

@ApiTags('Homework')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('homework')
export class HomeworkController {
  constructor(private readonly homework: HomeworkService) {}

  @ApiOperation({ summary: 'My homework (student/parent/teacher portal)' })
  @Roles(UserRole.STUDENT, UserRole.PARENT, UserRole.TEACHER)
  @Get('my')
  my(@CurrentUserDecorator() user: CurrentUser) {
    return this.homework.myHomework(user);
  }

  @ApiOperation({ summary: 'Homework calendar events' })
  @Get('calendar')
  calendar(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.homework.calendar(user, from, to);
  }

  @ApiOperation({ summary: 'Dashboard widgets' })
  @Get('widgets')
  widgets(@CurrentUserDecorator() user: CurrentUser) {
    return this.homework.widgets(user);
  }

  @ApiOperation({ summary: 'Homework reports / analytics' })
  @Roles(...VIEW_ROLES)
  @Get('reports')
  reports(@CurrentUserDecorator() user: CurrentUser) {
    return this.homework.reports(user);
  }

  @ApiOperation({ summary: 'List homework' })
  @Roles(...VIEW_ROLES)
  @Get()
  findAll(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('classId') classId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('status') status?: HomeworkStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.homework.findAll(user, {
      classId,
      sectionId,
      subjectId,
      teacherId,
      status,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @ApiOperation({ summary: 'Grade a submission' })
  @Roles(...MANAGE_ROLES)
  @Post('submissions/:submissionId/grade')
  grade(
    @Param('submissionId') submissionId: string,
    @Body() dto: GradeHomeworkDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.homework.grade(submissionId, dto, user);
  }

  @ApiOperation({ summary: 'Return submission for correction' })
  @Roles(...MANAGE_ROLES)
  @Post('submissions/:submissionId/return')
  returnForCorrection(
    @Param('submissionId') submissionId: string,
    @Body() dto: ReturnHomeworkDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.homework.returnForCorrection(submissionId, dto, user);
  }

  @ApiOperation({ summary: 'Get homework detail' })
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.homework.findOne(id, user);
  }

  @ApiOperation({ summary: 'Create homework' })
  @Roles(...MANAGE_ROLES)
  @Post()
  create(@Body() dto: CreateHomeworkDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.homework.create(dto, user);
  }

  @ApiOperation({ summary: 'Update homework' })
  @Roles(...MANAGE_ROLES)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateHomeworkDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.homework.update(id, dto, user);
  }

  @ApiOperation({ summary: 'Delete homework' })
  @Roles(...MANAGE_ROLES)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.homework.remove(id, user);
  }

  @ApiOperation({ summary: 'Add homework attachment' })
  @ApiConsumes('multipart/form-data')
  @Roles(...MANAGE_ROLES)
  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage,
      fileFilter: homeworkFileFilter,
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  addAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.homework.addAttachment(id, file, user);
  }

  @ApiOperation({ summary: 'Remove homework attachment' })
  @Roles(...MANAGE_ROLES)
  @Delete(':id/attachments/:attachmentId')
  removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.homework.removeAttachment(id, attachmentId, user);
  }

  @ApiOperation({ summary: 'List submissions for homework' })
  @Roles(...MANAGE_ROLES)
  @Get(':id/submissions')
  listSubmissions(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.homework.listSubmissions(id, user);
  }

  @ApiOperation({ summary: 'Student submission history' })
  @Roles(UserRole.STUDENT)
  @Get(':id/my-history')
  myHistory(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.homework.submissionHistory(id, user);
  }

  @ApiOperation({ summary: 'Submit homework' })
  @ApiConsumes('multipart/form-data')
  @Roles(UserRole.STUDENT)
  @Post(':id/submit')
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      storage,
      fileFilter: homeworkFileFilter,
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  submit(
    @Param('id') id: string,
    @Body() dto: SubmitHomeworkDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.homework.submit(id, dto, files ?? [], user);
  }
}
