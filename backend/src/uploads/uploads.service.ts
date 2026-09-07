import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  StreamableFile,
} from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { SchoolAuditService } from '../audit-logs/school-audit.service';
import { NotificationEngineService } from '../notifications/notification-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/types/current-user.type';
import { UPLOAD_DIR, ensureUploadDir } from '../common/utils/upload-path';

const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.zip',
]);

@Injectable()
export class UploadsService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private schoolAudit: SchoolAuditService,
    private readonly notificationEngine: NotificationEngineService,
  ) {}

  onModuleInit() {
    // Multer's diskStorage does not create the destination, so a fresh deployment would
    // reject the very first upload until this directory exists.
    ensureUploadDir();
  }

  async saveStudentDocument(
    file: Express.Multer.File,
    studentId: string,
    docType: DocumentType,
    currentUser: CurrentUser,
  ) {
    this.validateUploadedFile(file);

    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Student not found');
    if (student.schoolId !== currentUser.schoolId && currentUser.role !== 'SUPER_ADMIN') {
      throw new BadRequestException('Access denied');
    }

    const fileUrl = `/uploads/${file.filename}`;
    const doc = await this.prisma.studentDocument.create({
      data: {
        schoolId: student.schoolId,
        studentId,
        type: docType,
        fileName: file.originalname,
        fileUrl,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedById: currentUser.id,
      },
    });

    await this.schoolAudit.log({
      schoolId: student.schoolId,
      userId: currentUser.id,
      actorName: currentUser.name,
      action: 'DOCUMENT_UPLOADED',
      entity: 'StudentDocument',
      entityId: doc.id,
      description: `"${file.originalname}" uploaded for ${student.fullName}.`,
      details: { studentId, fileName: file.originalname, type: docType },
      dedupeKey: `audit:doc-upload:${doc.id}`,
    });

    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitDocumentUploaded(
        student.schoolId,
        student.fullName,
        file.originalname,
        doc.id,
      ),
    );

    return doc;
  }

  async getStudentDocuments(studentId: string, currentUser: CurrentUser) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Student not found');
    if (student.schoolId !== currentUser.schoolId && currentUser.role !== 'SUPER_ADMIN') {
      throw new BadRequestException('Access denied');
    }

    return this.prisma.studentDocument.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteDocument(id: string, currentUser: CurrentUser) {
    const doc = await this.prisma.studentDocument.findUnique({
      where: { id },
      include: { student: { select: { fullName: true } } },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.schoolId !== currentUser.schoolId && currentUser.role !== 'SUPER_ADMIN') {
      throw new BadRequestException('Access denied');
    }

    const filePath = this.resolveDiskPath(doc.fileUrl);
    if (filePath && fsSync.existsSync(filePath)) {
      await fs.unlink(filePath).catch(() => undefined);
    }

    await this.prisma.studentDocument.delete({ where: { id } });

    await this.schoolAudit.log({
      schoolId: doc.schoolId,
      userId: currentUser.id,
      actorName: currentUser.name,
      action: 'DOCUMENT_DELETED',
      entity: 'StudentDocument',
      entityId: id,
      description: `"${doc.fileName}" deleted for ${doc.student.fullName}.`,
      dedupeKey: `audit:doc-delete:${id}`,
    });

    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitDocumentDeleted(
        doc.schoolId,
        doc.student.fullName,
        doc.fileName,
        id,
      ),
    );

    return { message: 'Document deleted' };
  }

  async updateSchoolLogo(file: Express.Multer.File, schoolId: string, currentUser: CurrentUser) {
    if (currentUser.role !== 'SUPER_ADMIN' && currentUser.schoolId !== schoolId) {
      throw new BadRequestException('Access denied');
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      throw new BadRequestException('Invalid image extension');
    }

    const fileUrl = `/uploads/${file.filename}`;
    const school = await this.prisma.school.update({
      where: { id: schoolId },
      data: { logoUrl: fileUrl } as any,
    });

    await this.schoolAudit.log({
      schoolId,
      userId: currentUser.id,
      action: 'SCHOOL_LOGO_UPDATED',
      entity: 'School',
      entityId: schoolId,
    });

    return { logoUrl: fileUrl, school };
  }

  async serveFile(filename: string, currentUser: CurrentUser): Promise<StreamableFile> {
    const safeName = path.basename(filename);
    if (safeName !== filename || safeName.includes('..')) {
      throw new BadRequestException('Invalid filename');
    }

    const ext = path.extname(safeName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException('File type not allowed');
    }

    await this.assertFileAccess(safeName, currentUser);

    const diskPath = path.join(UPLOAD_DIR, safeName);
    if (!fsSync.existsSync(diskPath)) {
      throw new NotFoundException('File not found');
    }

    const stream = fsSync.createReadStream(diskPath);
    const mime = this.mimeFromExt(ext);
    return new StreamableFile(stream, { type: mime, disposition: `inline; filename="${safeName}"` });
  }

  validateUploadedFile(file: Express.Multer.File) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException('Invalid file extension');
    }
    // Homework/office types may report varying MIME strings — extension gate is primary.
    const expectedMime = this.mimeFromExt(ext);
    const looseOffice = ['.doc', '.docx', '.ppt', '.pptx', '.zip', '.gif'].includes(ext);
    if (
      !looseOffice &&
      file.mimetype !== expectedMime &&
      !(ext === '.jpg' && file.mimetype === 'image/jpeg')
    ) {
      throw new BadRequestException('File content type does not match extension');
    }
  }

  private async assertFileAccess(filename: string, currentUser: CurrentUser) {
    if (currentUser.role === 'SUPER_ADMIN') return;

    const fileUrl = `/uploads/${filename}`;
    const doc = await this.prisma.studentDocument.findFirst({ where: { fileUrl } });
    if (doc) {
      if (doc.schoolId !== currentUser.schoolId) {
        throw new ForbiddenException('Access denied');
      }
      return;
    }

    const school = await this.prisma.school.findFirst({ where: { logoUrl: fileUrl } });
    if (school) {
      if (school.id !== currentUser.schoolId) {
        throw new ForbiddenException('Access denied');
      }
      return;
    }

    const hwAtt = await this.prisma.homeworkAttachment.findFirst({ where: { fileUrl } });
    if (hwAtt) {
      if (hwAtt.schoolId !== currentUser.schoolId) {
        throw new ForbiddenException('Access denied');
      }
      return;
    }

    const hwFile = await this.prisma.homeworkSubmissionFile.findFirst({ where: { fileUrl } });
    if (hwFile) {
      if (hwFile.schoolId !== currentUser.schoolId) {
        throw new ForbiddenException('Access denied');
      }
      return;
    }

    throw new ForbiddenException('Access denied');
  }

  private resolveDiskPath(fileUrl: string) {
    const filename = path.basename(fileUrl);
    return path.join(UPLOAD_DIR, filename);
  }

  private mimeFromExt(ext: string) {
    const map: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.zip': 'application/zip',
    };
    return map[ext] || 'application/octet-stream';
  }
}
