import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentType, UserRole } from '@prisma/client';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as crypto from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import { UPLOAD_DIR } from '../common/utils/upload-path';
import { UploadsService } from './uploads.service';

const storage = diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const unique = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${unique}${ext}`);
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExt = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
  if (allowed.includes(file.mimetype) && allowedExt.includes(ext)) cb(null, true);
  else cb(new Error('Only images (JPEG, PNG, WEBP) and PDFs are allowed'), false);
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Get('files/:filename')
  async serveFile(
    @Param('filename') filename: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.uploadsService.serveFile(filename, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Post('student/:studentId/document')
  @UseInterceptors(FileInterceptor('file', { storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadStudentDoc(
    @Param('studentId') studentId: string,
    @Query('type') docType: DocumentType,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.uploadsService.saveStudentDocument(file, studentId, docType || DocumentType.OTHER, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Get('student/:studentId/documents')
  getStudentDocs(@Param('studentId') studentId: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.uploadsService.getStudentDocuments(studentId, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete('document/:id')
  deleteDoc(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.uploadsService.deleteDocument(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Post('school/:schoolId/logo')
  @UseInterceptors(FileInterceptor('file', {
    storage,
    fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) &&
          ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Only images allowed'), false);
      }
    },
    limits: { fileSize: 2 * 1024 * 1024 },
  }))
  uploadSchoolLogo(
    @Param('schoolId') schoolId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.uploadsService.updateSchoolLogo(file, schoolId, user);
  }
}
