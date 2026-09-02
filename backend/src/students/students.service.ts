import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { SchoolAuditService } from '../audit-logs/school-audit.service';
import { monthYearRange } from '../common/utils/month-year-range';
import { paginatedResult } from '../common/utils/paginated-result';
import { resolvePagination } from '../common/dto/pagination-query.dto';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEngineService } from '../notifications/notification-engine.service';
import { FeesService } from '../fees/fees.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { StudentQueryDto } from './dto/student-query.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

function studentInclude(): Prisma.StudentInclude {
  const now = new Date();
  return {
    class: true,
    section: true,
    feeInvoices: {
      where: { month: now.getUTCMonth() + 1, year: now.getUTCFullYear() },
      take: 1,
      select: { id: true, status: true, paidAmount: true, totalAmount: true, month: true, year: true },
    },
  };
}

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    private readonly notificationEngine: NotificationEngineService,
    private schoolAudit: SchoolAuditService,
    private readonly feesService: FeesService,
  ) {}

  async findAll(currentUser: CurrentUser, query: StudentQueryDto) {
    const where = this.buildListWhere(currentUser, query);
    const { take, skip } = resolvePagination(query);

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        include: studentInclude(),
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.student.count({ where }),
    ]);

    return paginatedResult(data, total, take, skip);
  }

  async findOne(id: string, currentUser: CurrentUser) {
    const student = await this.findStudentOrThrow(id);
    this.assertSchoolAccess(currentUser, student.schoolId);
    if (currentUser.role === UserRole.PARENT) {
      const parent = await this.prisma.parent.findFirst({
        where: { userId: currentUser.id, studentId: id },
      });
      if (!parent) throw new ForbiddenException('Not authorized for this student');
    }
    return student;
  }

  async create(dto: CreateStudentDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);

    const existing = await this.prisma.student.findUnique({
      where: { schoolId_admissionNo: { schoolId, admissionNo: dto.admissionNo } },
    });
    if (existing) {
      throw new BadRequestException('Student with this admission number already exists in the school');
    }

    await this.validateClassAndSection(schoolId, dto.classId, dto.sectionId);

    const student = await this.prisma.student.create({
      data: {
        schoolId,
        admissionNo: dto.admissionNo,
        admissionDate: dto.admissionDate ? new Date(dto.admissionDate) : undefined,
        fullName: dto.fullName,
        fatherName: dto.fatherName,
        guardianPhone: dto.guardianPhone,
        whatsappNumber: dto.whatsappNumber,
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        address: dto.address,
        photoUrl: dto.photoUrl,
        classId: dto.classId,
        sectionId: dto.sectionId,
        monthlyFee: dto.monthlyFee,
        status: dto.status,
      },
      include: studentInclude(),
    });

    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitNewAdmission(schoolId, student.id),
    );

    await this.schoolAudit.log({
      schoolId,
      userId: currentUser.id,
      actorName: currentUser.name,
      action: 'STUDENT_CREATED',
      entity: 'Student',
      entityId: student.id,
      description: `${student.fullName} (${student.admissionNo}) was admitted.`,
      details: { admissionNo: student.admissionNo, fullName: student.fullName },
      dedupeKey: `audit:student-created:${student.id}`,
    });

    if (student.monthlyFee > 0 && dto.feeStatus) {
      await this.feesService.applyAdmissionFee(student, dto.feeStatus, currentUser);
      return this.findStudentOrThrow(student.id);
    }

    return student;
  }

  async update(id: string, dto: UpdateStudentDto, currentUser: CurrentUser) {
    const student = await this.findStudentOrThrow(id);
    this.assertSchoolAccess(currentUser, student.schoolId);

    if (dto.admissionNo && dto.admissionNo !== student.admissionNo) {
      const duplicate = await this.prisma.student.findFirst({
        where: {
          schoolId: student.schoolId,
          admissionNo: dto.admissionNo,
          NOT: { id },
        },
      });
      if (duplicate) {
        throw new BadRequestException('Student with this admission number already exists in the school');
      }
    }

    const classId = dto.classId !== undefined ? dto.classId : student.classId;
    const sectionId = dto.sectionId !== undefined ? dto.sectionId : student.sectionId;
    await this.validateClassAndSection(student.schoolId, classId, sectionId);

    const updated = await this.prisma.student.update({
      where: { id },
      data: {
        ...(dto.admissionNo !== undefined ? { admissionNo: dto.admissionNo } : {}),
        ...(dto.admissionDate !== undefined ? { admissionDate: new Date(dto.admissionDate) } : {}),
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.fatherName !== undefined ? { fatherName: dto.fatherName } : {}),
        ...(dto.guardianPhone !== undefined ? { guardianPhone: dto.guardianPhone } : {}),
        ...(dto.whatsappNumber !== undefined ? { whatsappNumber: dto.whatsappNumber } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.dateOfBirth !== undefined ? { dateOfBirth: new Date(dto.dateOfBirth) } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.photoUrl !== undefined ? { photoUrl: dto.photoUrl } : {}),
        ...(dto.classId !== undefined ? { classId: dto.classId } : {}),
        ...(dto.sectionId !== undefined ? { sectionId: dto.sectionId } : {}),
        ...(dto.monthlyFee !== undefined ? { monthlyFee: dto.monthlyFee } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: studentInclude(),
    });

    await this.schoolAudit.log({
      schoolId: student.schoolId,
      userId: currentUser.id,
      actorName: currentUser.name,
      action: 'STUDENT_UPDATED',
      entity: 'Student',
      entityId: id,
      description: `${updated.fullName} profile was updated.`,
      oldValue: { fullName: student.fullName, status: student.status },
      newValue: { fullName: updated.fullName, status: updated.status },
      dedupeKey: `audit:student-updated:${id}:${Date.now().toString().slice(0, -4)}`,
    });

    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitStudentUpdated(student.schoolId, id, updated.fullName),
    );

    if (updated.monthlyFee > 0 && dto.feeStatus) {
      await this.feesService.applyAdmissionFee(updated, dto.feeStatus, currentUser);
      return this.findStudentOrThrow(id);
    }

    return updated;
  }

  async remove(id: string, currentUser: CurrentUser) {
    const student = await this.findStudentOrThrow(id);
    this.assertSchoolAccess(currentUser, student.schoolId);

    const archived = await this.prisma.student.update({
      where: { id },
      data: { status: 'INACTIVE' },
      include: studentInclude(),
    });

    await this.schoolAudit.log({
      schoolId: student.schoolId,
      userId: currentUser.id,
      actorName: currentUser.name,
      action: 'STUDENT_ARCHIVED',
      entity: 'Student',
      entityId: id,
      description: `${student.fullName} was archived.`,
      dedupeKey: `audit:student-archived:${id}`,
    });

    return archived;
  }

  async permanentDelete(id: string, currentUser: CurrentUser) {
    const student = await this.findStudentOrThrow(id);
    this.assertSchoolAccess(currentUser, student.schoolId);

    const invoiceCount = await this.prisma.feeInvoice.count({ where: { studentId: id } });
    if (invoiceCount > 0) {
      throw new BadRequestException(
        `Cannot permanently delete "${student.fullName}" — ${invoiceCount} fee invoice(s) exist. Archive the student instead.`,
      );
    }

    const markCount = await this.prisma.mark.count({ where: { studentId: id } });
    if (markCount > 0) {
      throw new BadRequestException(
        `Cannot permanently delete "${student.fullName}" — ${markCount} exam mark(s) exist. Archive the student instead.`,
      );
    }

    await this.prisma.studentAttendance.deleteMany({ where: { studentId: id } });

    await this.schoolAudit.log({
      schoolId: student.schoolId,
      userId: currentUser.id,
      actorName: currentUser.name,
      action: 'STUDENT_DELETED',
      entity: 'Student',
      entityId: id,
      description: `${student.fullName} was permanently deleted.`,
      details: { fullName: student.fullName },
      dedupeKey: `audit:student-deleted:${id}`,
    });

    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitStudentDeleted(student.schoolId, student.fullName),
    );

    return this.prisma.student.delete({ where: { id } });
  }

  private async findStudentOrThrow(id: string) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: studentInclude(),
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    return student;
  }

  private buildListWhere(currentUser: CurrentUser, query: StudentQueryDto): Prisma.StudentWhereInput {
    const admissionRange = monthYearRange(query.month, query.year);
    const where: Prisma.StudentWhereInput = {
      ...this.buildSchoolFilter(currentUser, query.schoolId),
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(admissionRange ? { admissionDate: admissionRange } : {}),
    };

    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { admissionNo: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private async validateClassAndSection(
    schoolId: string,
    classId?: string | null,
    sectionId?: string | null,
  ) {
    if (classId) {
      const classRecord = await this.prisma.class.findUnique({ where: { id: classId } });
      if (!classRecord) {
        throw new NotFoundException('Class not found');
      }
      if (classRecord.schoolId !== schoolId) {
        throw new BadRequestException('Class does not belong to the specified school');
      }
    }

    if (sectionId) {
      const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
      if (!section) {
        throw new NotFoundException('Section not found');
      }
      if (section.schoolId !== schoolId) {
        throw new BadRequestException('Section does not belong to the specified school');
      }
      if (classId && section.classId !== classId) {
        throw new BadRequestException('Section does not belong to the specified class');
      }
    }
  }

  private resolveSchoolId(currentUser: CurrentUser, schoolId?: string): string {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      if (!schoolId) {
        throw new BadRequestException('schoolId is required');
      }
      return schoolId;
    }

    if (!currentUser.schoolId) {
      throw new ForbiddenException('School context missing');
    }

    if (schoolId && schoolId !== currentUser.schoolId) {
      throw new ForbiddenException('Cannot access another school\'s data');
    }

    return currentUser.schoolId;
  }

  private buildSchoolFilter(currentUser: CurrentUser, schoolId?: string) {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      return schoolId ? { schoolId } : {};
    }

    if (!currentUser.schoolId) {
      throw new ForbiddenException('School context missing');
    }

    if (schoolId && schoolId !== currentUser.schoolId) {
      throw new ForbiddenException('Cannot access another school\'s data');
    }

    return { schoolId: currentUser.schoolId };
  }

  private assertSchoolAccess(currentUser: CurrentUser, resourceSchoolId: string) {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      return;
    }

    if (!currentUser.schoolId) {
      throw new ForbiddenException('School context missing');
    }

    if (currentUser.schoolId !== resourceSchoolId) {
      throw new ForbiddenException('Cannot access another school\'s data');
    }
  }

  async getMyPortal(currentUser: CurrentUser) {
    if (!currentUser.schoolId) {
      throw new ForbiddenException('School context missing');
    }

    const student = await this.prisma.student.findFirst({
      where: { userId: currentUser.id, schoolId: currentUser.schoolId },
      include: { class: true, section: true },
    });

    if (!student) {
      throw new NotFoundException('Student profile not found for this account');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [attendance, fees, notices, timetable, marks, documents] = await Promise.all([
      this.prisma.studentAttendance.findMany({
        where: { studentId: student.id },
        orderBy: { date: 'desc' },
        take: 60,
        select: { date: true, status: true },
      }),
      this.prisma.feeInvoice.findMany({
        where: { studentId: student.id },
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
          id: true, invoiceNo: true, month: true, year: true,
          amount: true, totalAmount: true, paidAmount: true, status: true, dueDate: true,
        },
      }),
      this.prisma.notice.findMany({
        where: {
          schoolId: currentUser.schoolId,
          isPublished: true,
          OR: [{ targetRoles: null }, { targetRoles: { contains: 'STUDENT' } }, { targetRoles: { contains: 'ALL' } }],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, title: true, content: true, type: true, startDate: true },
      }),
      this.prisma.timetableEntry.findMany({
        where: { schoolId: currentUser.schoolId, classId: student.classId ?? '' },
        include: {
          subject: { select: { name: true } },
          teacher: { select: { fullName: true } },
        },
        orderBy: [{ dayOfWeek: 'asc' }, { periodNo: 'asc' }],
      }),
      this.prisma.mark.findMany({
        where: { studentId: student.id },
        include: {
          exam:    { select: { name: true, startDate: true } },
          subject: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.studentDocument.findMany({
        where: { studentId: student.id },
        select: { id: true, type: true, fileName: true, fileUrl: true, createdAt: true },
      }),
    ]);

    const presentCount = attendance.filter((a) => a.status === 'PRESENT').length;
    const attendancePct = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;

    return {
      student: {
        id:           student.id,
        fullName:     student.fullName,
        admissionNo:  student.admissionNo,
        gender:       student.gender,
        dateOfBirth:  student.dateOfBirth,
        photoUrl:     student.photoUrl,
        class:        student.class?.name,
        section:      student.section?.name,
        status:       student.status,
      },
      attendanceSummary: {
        total: attendance.length,
        present: presentCount,
        absent: attendance.length - presentCount,
        percentage: attendancePct,
      },
      attendance,
      fees,
      notices,
      timetable,
      marks,
      documents,
    };
  }
}
