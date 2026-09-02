import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';

const sectionInclude = {
  class: true,
  teacher: { select: { id: true, fullName: true } },
};

@Injectable()
export class SectionsService {
  constructor(private prisma: PrismaService) {}

  async findAll(currentUser: CurrentUser, schoolId?: string, classId?: string) {
    const where = {
      ...this.buildSchoolFilter(currentUser, schoolId),
      ...(classId ? { classId } : {}),
    };

    return this.prisma.section.findMany({
      where,
      orderBy: [{ classId: 'asc' }, { name: 'asc' }],
      include: sectionInclude,
    });
  }

  async create(dto: CreateSectionDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);

    const classRecord = await this.prisma.class.findUnique({
      where: { id: dto.classId },
    });
    if (!classRecord) {
      throw new NotFoundException('Class not found');
    }
    if (classRecord.schoolId !== schoolId) {
      throw new ForbiddenException('Class does not belong to the specified school');
    }

    const existing = await this.prisma.section.findUnique({
      where: {
        schoolId_classId_name: {
          schoolId,
          classId: dto.classId,
          name: dto.name,
        },
      },
    });
    if (existing) {
      throw new BadRequestException('Section with this name already exists in the class');
    }

    if (dto.teacherId) {
      await this.assertTeacherBelongsToSchool(dto.teacherId, schoolId);
    }

    return this.prisma.section.create({
      data: {
        name: dto.name,
        classId: dto.classId,
        schoolId,
        ...(dto.teacherId !== undefined ? { teacherId: dto.teacherId } : {}),
      },
      include: sectionInclude,
    });
  }

  async update(id: string, dto: UpdateSectionDto, currentUser: CurrentUser) {
    const section = await this.findSectionOrThrow(id);
    this.assertSchoolAccess(currentUser, section.schoolId);

    if (dto.name !== undefined) {
      const duplicate = await this.prisma.section.findFirst({
        where: {
          schoolId: section.schoolId,
          classId: section.classId,
          name: dto.name,
          NOT: { id },
        },
      });
      if (duplicate) {
        throw new BadRequestException('Section with this name already exists in the class');
      }
    }

    if (dto.teacherId) {
      await this.assertTeacherBelongsToSchool(dto.teacherId, section.schoolId);
    }

    return this.prisma.section.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.teacherId !== undefined ? { teacherId: dto.teacherId } : {}),
      },
      include: sectionInclude,
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
    const section = await this.findSectionOrThrow(id);
    this.assertSchoolAccess(currentUser, section.schoolId);

    const [studentCount, examCount] = await Promise.all([
      this.prisma.student.count({ where: { sectionId: id } }),
      this.prisma.exam.count({ where: { sectionId: id } }),
    ]);

    if (studentCount > 0) {
      throw new BadRequestException(
        `Cannot delete section "${section.name}" — ${studentCount} student(s) are assigned to it. Move them first.`,
      );
    }

    if (examCount > 0) {
      throw new BadRequestException(
        `Cannot delete section "${section.name}" — ${examCount} exam(s) are linked to it. Remove the exams first.`,
      );
    }

    // Remove orphaned attendance records for this section before deleting
    await this.prisma.studentAttendance.deleteMany({ where: { sectionId: id } });

    return this.prisma.section.delete({ where: { id } });
  }

  private async findSectionOrThrow(id: string) {
    const section = await this.prisma.section.findUnique({ where: { id } });
    if (!section) {
      throw new NotFoundException('Section not found');
    }
    return section;
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
