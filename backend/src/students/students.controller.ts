import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import { sendAttachment } from '../common/utils/send-attachment';
import { CreateStudentDto } from './dto/create-student.dto';
import { StudentQueryDto } from './dto/student-query.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { ImportUploadExceptionFilter } from './import/import-upload.filter';
import { StudentImportService } from './import/student-import.service';
import { MAX_IMPORT_BYTES } from './import/student-import.types';
import { StudentsService } from './students.service';

const importUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES, files: 1, fields: 4, fieldSize: 64 * 1024 },
});

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('students')
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly studentImportService: StudentImportService,
  ) {}

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.RECEPTIONIST)
  @Get('import/template')
  async downloadImportTemplate(@Res() res: Response) {
    const buffer = await this.studentImportService.template();
    sendAttachment(
      res,
      buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'clever-campus-student-import-template.xlsx',
    );
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.RECEPTIONIST)
  @Post('import/preview')
  @UseFilters(ImportUploadExceptionFilter)
  @UseInterceptors(importUpload)
  previewImport(
    @UploadedFile() file: Express.Multer.File,
    @Body('mapping') mapping: string | undefined,
    @Query('schoolId') schoolId: string | undefined,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.studentImportService.preview(file, mapping, user, schoolId);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.RECEPTIONIST)
  @Post('import')
  @UseFilters(ImportUploadExceptionFilter)
  @UseInterceptors(importUpload)
  commitImport(
    @UploadedFile() file: Express.Multer.File,
    @Body('mapping') mapping: string | undefined,
    @Query('schoolId') schoolId: string | undefined,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.studentImportService.commit(file, mapping, user, schoolId);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER, UserRole.RECEPTIONIST)
  @Get()
  findAll(@CurrentUserDecorator() user: CurrentUser, @Query() query: StudentQueryDto) {
    return this.studentsService.findAll(user, query);
  }

  @Roles(UserRole.STUDENT)
  @Get('my-portal')
  getMyPortal(@CurrentUserDecorator() user: CurrentUser) {
    return this.studentsService.getMyPortal(user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER, UserRole.RECEPTIONIST, UserRole.PARENT)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.studentsService.findOne(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.RECEPTIONIST)
  @Post()
  create(@Body() dto: CreateStudentDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.studentsService.create(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.RECEPTIONIST)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.studentsService.update(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.studentsService.remove(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete(':id/permanent')
  permanentDelete(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.studentsService.permanentDelete(id, user);
  }
}
