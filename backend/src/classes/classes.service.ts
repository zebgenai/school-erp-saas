import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

@Injectable()
export class ClassesService {
  constructor(private prisma: PrismaService) {}

  async findAll(currentUser: CurrentUser, schoolId?: string) {
    const where = this.buildSchoolFilter(currentUser, schoolId);
    return this.prisma.class.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { classTeacher: { select: { id: true, fullName: true } } },
    });
  }

  async create(dto: CreateClassDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);

    const existing = await this.prisma.class.findUnique({
      where: { schoolId_name: { schoolId, name: dto.name } },
    });
    if (existing) {
      throw new BadRequestException('Class with this name already exists in the school');
    }

    if (dto.classTeacherId) {
      await this.assertTeacherBelongsToSchool(dto.classTeacherId, schoolId);
    }

    return this.prisma.class.create({
      data: {
        name: dto.name,
        schoolId,
        ...(dto.classTeacherId !== undefined ? { classTeacherId: dto.classTeacherId } : {}),
      },
      include: { classTeacher: { select: { id: true, fullName: true } } },
    });
  }

  async update(id: string, dto: UpdateClassDto, currentUser: CurrentUser) {
    const classRecord = await this.findClassOrThrow(id);
    this.assertSchoolAccess(currentUser, classRecord.schoolId);

    if (dto.name !== undefined) {
      const duplicate = await this.prisma.class.findFirst({
        where: {
          schoolId: classRecord.schoolId,
          name: dto.name,
          NOT: { id },
        },
      });
      if (duplicate) {
        throw new BadRequestException('Class with this name already exists in the school');
      }
    }

    if (dto.classTeacherId) {
      await this.assertTeacherBelongsToSchool(dto.classTeacherId, classRecord.schoolId);
    }

    return this.prisma.class.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.classTeacherId !== undefined ? { classTeacherId: dto.classTeacherId } : {}),
      },
      include: { classTeacher: { select: { id: true, fullName: true } } },
    });
  }

  private async assertTeacherBelongsToSchool(teacherId: string, schoolId: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }
    if (teacher.schoolId !== schoolId) {
      throw new BadRequestException('Teacher does not belong to the specified school');
    }
  }

  async remove(id: string, currentUser: CurrentUser) {
    const classRecord = await this.findClassOrThrow(id);
    this.assertSchoolAccess(currentUser, classRecord.schoolId);

    const [studentCount, sectionCount, subjectCount, feeStructureCount, examCount] = await Promise.all([
      this.prisma.student.count({ where: { classId: id } }),
      this.prisma.section.count({ where: { classId: id } }),
      this.prisma.subject.count({ where: { classId: id } }),
      this.prisma.feeStructure.count({ where: { classId: id } }),
      this.prisma.exam.count({ where: { classId: id } }),
    ]);

    if (studentCount > 0) {
      throw new BadRequestException(
        `Cannot delete class "${classRecord.name}" — ${studentCount} student(s) are enrolled. Move or archive them first.`,
      );
    }

    if (sectionCount > 0) {
      throw new BadRequestException(
        `Cannot delete class "${classRecord.name}" — ${sectionCount} section(s) exist. Delete sections first.`,
      );
    }

    if (subjectCount > 0) {
      throw new BadRequestException(
        `Cannot delete class "${classRecord.name}" — ${subjectCount} subject(s) are linked. Delete subjects first.`,
      );
    }

    if (examCount > 0) {
      throw new BadRequestException(
        `Cannot delete class "${classRecord.name}" — ${examCount} exam(s) are linked. Remove the exams first.`,
      );
    }

    // Cascade delete inactive fee structures (active ones are blocked by subjectCount-like guard above if needed)
    if (feeStructureCount > 0) {
      await this.prisma.feeStructure.deleteMany({ where: { classId: id } });
    }

    return this.prisma.class.delete({ where: { id } });
  }

  private async findClassOrThrow(id: string) {
    const classRecord = await this.prisma.class.findUnique({ where: { id } });
    if (!classRecord) {
      throw new NotFoundException('Class not found');
    }
    return classRecord;
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
}
