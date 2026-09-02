import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';

const subjectInclude = {
  class: true,
  section: { select: { id: true, name: true, classId: true } },
  teacher: { select: { id: true, fullName: true } },
};

@Injectable()
export class SubjectsService {
  constructor(private prisma: PrismaService) {}

  async findAll(currentUser: CurrentUser, schoolId?: string, classId?: string) {
    const where = {
      ...this.buildSchoolFilter(currentUser, schoolId),
      ...(classId ? { classId } : {}),
    };

    return this.prisma.subject.findMany({
      where,
      orderBy: [{ classId: 'asc' }, { name: 'asc' }],
      include: subjectInclude,
    });
  }

  async findOne(id: string, currentUser: CurrentUser) {
    const subject = await this.findSubjectOrThrow(id);
    this.assertSchoolAccess(currentUser, subject.schoolId);
    return subject;
  }

  async create(dto: CreateSubjectDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);

    if (dto.classId) {
      await this.assertClassBelongsToSchool(dto.classId, schoolId);
    }

    const duplicate = await this.findDuplicate(schoolId, dto.name, dto.classId ?? null);
    if (duplicate) {
      throw new BadRequestException('Subject with this name already exists for the school and class');
    }

    if (dto.sectionId) {
      await this.assertSectionBelongsToSchool(dto.sectionId, schoolId, dto.classId ?? null);
    }
    if (dto.teacherId) {
      await this.assertTeacherBelongsToSchool(dto.teacherId, schoolId);
    }

    return this.prisma.subject.create({
      data: {
        name: dto.name,
        code: dto.code,
        classId: dto.classId,
        schoolId,
        ...(dto.sectionId !== undefined ? { sectionId: dto.sectionId } : {}),
        ...(dto.teacherId !== undefined ? { teacherId: dto.teacherId } : {}),
      },
      include: subjectInclude,
    });
  }

  async update(id: string, dto: UpdateSubjectDto, currentUser: CurrentUser) {
    const subject = await this.findSubjectOrThrow(id);
    this.assertSchoolAccess(currentUser, subject.schoolId);

    const classId = dto.classId !== undefined ? dto.classId : subject.classId;

    if (classId) {
      await this.assertClassBelongsToSchool(classId, subject.schoolId);
    }

    if (dto.name !== undefined) {
      const duplicate = await this.findDuplicate(subject.schoolId, dto.name, classId ?? null, id);
      if (duplicate) {
        throw new BadRequestException('Subject with this name already exists for the school and class');
      }
    }

    const sectionId = dto.sectionId !== undefined ? dto.sectionId : subject.sectionId;
    if (sectionId) {
      await this.assertSectionBelongsToSchool(sectionId, subject.schoolId, classId ?? null);
    }
    if (dto.teacherId) {
      await this.assertTeacherBelongsToSchool(dto.teacherId, subject.schoolId);
    }

    return this.prisma.subject.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.classId !== undefined ? { classId: dto.classId } : {}),
        ...(dto.sectionId !== undefined ? { sectionId: dto.sectionId } : {}),
        ...(dto.teacherId !== undefined ? { teacherId: dto.teacherId } : {}),
      },
      include: subjectInclude,
    });
  }

  private async assertSectionBelongsToSchool(
    sectionId: string,
    schoolId: string,
    classId: string | null,
  ) {
    const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
    if (!section) {
      throw new NotFoundException('Section not found');
    }
    if (section.schoolId !== schoolId) {
      throw new BadRequestException('Section does not belong to the specified school');
    }
    if (classId && section.classId !== classId) {
      throw new BadRequestException('Section does not belong to the selected class');
    }
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
    const subject = await this.findSubjectOrThrow(id);
    this.assertSchoolAccess(currentUser, subject.schoolId);

    const [examSubjectCount, markCount] = await Promise.all([
      this.prisma.examSubject.count({ where: { subjectId: id } }),
      this.prisma.mark.count({ where: { subjectId: id } }),
    ]);

    if (examSubjectCount > 0) {
      throw new BadRequestException(
        `Cannot delete subject "${subject.name}" — it is linked to ${examSubjectCount} exam(s). Remove it from those exams first.`,
      );
    }

    if (markCount > 0) {
      throw new BadRequestException(
        `Cannot delete subject "${subject.name}" — ${markCount} student mark(s) exist for it. Remove the marks first.`,
      );
    }

    return this.prisma.subject.delete({ where: { id } });
  }

  private async findSubjectOrThrow(id: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id },
      include: subjectInclude,
    });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    return subject;
  }

  private async findDuplicate(
    schoolId: string,
    name: string,
    classId: string | null,
    excludeId?: string,
  ) {
    return this.prisma.subject.findFirst({
      where: {
        schoolId,
        name,
        classId,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
  }

  private async assertClassBelongsToSchool(classId: string, schoolId: string) {
    const classRecord = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!classRecord) {
      throw new NotFoundException('Class not found');
    }
    if (classRecord.schoolId !== schoolId) {
      throw new ForbiddenException('Class does not belong to the specified school');
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
}
