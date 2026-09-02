import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTimetableEntryDto } from './dto/create-timetable-entry.dto';
import { TimetableQueryDto } from './dto/timetable-query.dto';
import { UpdateTimetableEntryDto } from './dto/update-timetable-entry.dto';

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const entryInclude = {
  class: true,
  section: true,
  subject: true,
  teacher: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.TimetableEntryInclude;

@Injectable()
export class TimetableService {
  constructor(private prisma: PrismaService) {}

  async findAll(currentUser: CurrentUser, query: TimetableQueryDto) {
    const where: Prisma.TimetableEntryWhereInput = {
      ...this.buildSchoolFilter(currentUser, query.schoolId),
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.teacherId ? { teacherId: query.teacherId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.dayOfWeek ? { dayOfWeek: query.dayOfWeek } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };

    return this.prisma.timetableEntry.findMany({
      where,
      include: entryInclude,
      orderBy: [{ dayOfWeek: 'asc' }, { periodNo: 'asc' }],
    });
  }

  async findOne(id: string, currentUser: CurrentUser) {
    const entry = await this.findEntryOrThrow(id);
    this.assertSchoolAccess(currentUser, entry.schoolId);
    return entry;
  }

  async create(dto: CreateTimetableEntryDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);

    await this.assertClassBelongsToSchool(dto.classId, schoolId);

    if (dto.sectionId) {
      await this.assertSectionBelongsToSchool(dto.sectionId, schoolId, dto.classId);
    }
    if (dto.subjectId) {
      await this.assertSubjectBelongsToSchool(dto.subjectId, schoolId);
    }
    if (dto.teacherId) {
      await this.assertTeacherBelongsToSchool(dto.teacherId, schoolId);
    }

    this.assertTimeOrder(dto.startTime, dto.endTime);

    await this.checkSlotConflict(schoolId, dto.classId, dto.sectionId ?? null, dto.dayOfWeek, dto.periodNo);
    if (dto.teacherId) {
      await this.checkTeacherConflict(schoolId, dto.teacherId, dto.dayOfWeek, dto.periodNo);
    }

    return this.prisma.timetableEntry.create({
      data: {
        schoolId,
        classId: dto.classId,
        sectionId: dto.sectionId,
        subjectId: dto.subjectId,
        teacherId: dto.teacherId,
        dayOfWeek: dto.dayOfWeek,
        periodNo: dto.periodNo,
        startTime: dto.startTime,
        endTime: dto.endTime,
        roomNo: dto.roomNo,
        isActive: dto.isActive ?? true,
      },
      include: entryInclude,
    });
  }

  async update(id: string, dto: UpdateTimetableEntryDto, currentUser: CurrentUser) {
    const entry = await this.findEntryOrThrow(id);
    this.assertSchoolAccess(currentUser, entry.schoolId);

    const newClassId = dto.classId ?? entry.classId;
    const newSectionId = dto.sectionId !== undefined ? dto.sectionId : entry.sectionId;
    const newDay = dto.dayOfWeek ?? entry.dayOfWeek;
    const newPeriod = dto.periodNo ?? entry.periodNo;
    const newTeacherId = dto.teacherId !== undefined ? dto.teacherId : entry.teacherId;

    if (dto.classId) {
      await this.assertClassBelongsToSchool(dto.classId, entry.schoolId);
    }
    if (newSectionId) {
      await this.assertSectionBelongsToSchool(newSectionId, entry.schoolId, newClassId);
    }
    if (dto.subjectId) {
      await this.assertSubjectBelongsToSchool(dto.subjectId, entry.schoolId);
    }
    if (dto.teacherId) {
      await this.assertTeacherBelongsToSchool(dto.teacherId, entry.schoolId);
    }

    this.assertTimeOrder(dto.startTime ?? entry.startTime, dto.endTime ?? entry.endTime);

    await this.checkSlotConflict(
      entry.schoolId,
      newClassId,
      newSectionId,
      newDay,
      newPeriod,
      id,
    );
    if (newTeacherId) {
      await this.checkTeacherConflict(entry.schoolId, newTeacherId, newDay, newPeriod, id);
    }

    return this.prisma.timetableEntry.update({
      where: { id },
      data: {
        ...(dto.classId !== undefined ? { classId: dto.classId } : {}),
        ...(dto.sectionId !== undefined ? { sectionId: dto.sectionId } : {}),
        ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId } : {}),
        ...(dto.teacherId !== undefined ? { teacherId: dto.teacherId } : {}),
        ...(dto.dayOfWeek !== undefined ? { dayOfWeek: dto.dayOfWeek } : {}),
        ...(dto.periodNo !== undefined ? { periodNo: dto.periodNo } : {}),
        ...(dto.startTime !== undefined ? { startTime: dto.startTime } : {}),
        ...(dto.endTime !== undefined ? { endTime: dto.endTime } : {}),
        ...(dto.roomNo !== undefined ? { roomNo: dto.roomNo } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: entryInclude,
    });
  }

  async remove(id: string, currentUser: CurrentUser) {
    const entry = await this.findEntryOrThrow(id);
    this.assertSchoolAccess(currentUser, entry.schoolId);
    return this.prisma.timetableEntry.delete({ where: { id } });
  }

  async getClassTimetable(classId: string, currentUser: CurrentUser, sectionId?: string) {
    const classRecord = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!classRecord) throw new NotFoundException('Class not found');
    this.assertSchoolAccess(currentUser, classRecord.schoolId);

    const entries = await this.prisma.timetableEntry.findMany({
      where: {
        classId,
        schoolId: classRecord.schoolId,
        isActive: true,
        ...(sectionId ? { sectionId } : {}),
      },
      include: entryInclude,
      orderBy: [{ dayOfWeek: 'asc' }, { periodNo: 'asc' }],
    });

    // Group by day
    const grouped: Record<string, typeof entries> = {};
    for (let d = 1; d <= 7; d++) {
      grouped[DAY_NAMES[d]] = entries.filter((e) => e.dayOfWeek === d);
    }
    return grouped;
  }

  async getTeacherTimetable(teacherId: string, currentUser: CurrentUser) {
    const teacher = await this.prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) throw new NotFoundException('Teacher not found');
    this.assertSchoolAccess(currentUser, teacher.schoolId);

    const entries = await this.prisma.timetableEntry.findMany({
      where: { teacherId, schoolId: teacher.schoolId, isActive: true },
      include: entryInclude,
      orderBy: [{ dayOfWeek: 'asc' }, { periodNo: 'asc' }],
    });

    const grouped: Record<string, typeof entries> = {};
    for (let d = 1; d <= 7; d++) {
      grouped[DAY_NAMES[d]] = entries.filter((e) => e.dayOfWeek === d);
    }
    return { teacher, timetable: grouped };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /** Start must be strictly before end. Both are validated as "HH:MM" by the DTO. */
  private assertTimeOrder(startTime: string, endTime: string) {
    if (startTime >= endTime) {
      throw new BadRequestException('End time must be later than start time');
    }
  }

  private async checkSlotConflict(
    schoolId: string,
    classId: string,
    sectionId: string | null,
    dayOfWeek: number,
    periodNo: number,
    excludeId?: string,
  ) {
    const existing = await this.prisma.timetableEntry.findFirst({
      where: {
        schoolId,
        classId,
        // `null` must be matched explicitly: passing `undefined` would drop the filter
        // and wrongly report a clash with entries belonging to other sections.
        sectionId,
        dayOfWeek,
        periodNo,
        isActive: true,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (existing) {
      throw new BadRequestException(
        `Period ${periodNo} on ${DAY_NAMES[dayOfWeek]} is already occupied for this class/section.`,
      );
    }
  }

  /** A teacher cannot be scheduled for two classes in the same period on the same day. */
  private async checkTeacherConflict(
    schoolId: string,
    teacherId: string,
    dayOfWeek: number,
    periodNo: number,
    excludeId?: string,
  ) {
    const clash = await this.prisma.timetableEntry.findFirst({
      where: {
        schoolId,
        teacherId,
        dayOfWeek,
        periodNo,
        isActive: true,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      include: { class: { select: { name: true } }, section: { select: { name: true } } },
    });
    if (clash) {
      const where = [clash.class?.name, clash.section?.name].filter(Boolean).join(' · ');
      throw new BadRequestException(
        `This teacher is already scheduled for period ${periodNo} on ${DAY_NAMES[dayOfWeek]}${where ? ` (${where})` : ''}.`,
      );
    }
  }

  private async findEntryOrThrow(id: string) {
    const entry = await this.prisma.timetableEntry.findUnique({
      where: { id },
      include: entryInclude,
    });
    if (!entry) throw new NotFoundException('Timetable entry not found');
    return entry;
  }

  private async assertClassBelongsToSchool(classId: string, schoolId: string) {
    const c = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!c) throw new NotFoundException('Class not found');
    if (c.schoolId !== schoolId) throw new ForbiddenException('Class does not belong to this school');
  }

  private async assertSectionBelongsToSchool(sectionId: string, schoolId: string, classId?: string) {
    const s = await this.prisma.section.findUnique({ where: { id: sectionId } });
    if (!s) throw new NotFoundException('Section not found');
    if (s.schoolId !== schoolId) throw new ForbiddenException('Section does not belong to this school');
    if (classId && s.classId !== classId) throw new BadRequestException('Section does not belong to the given class');
  }

  private async assertSubjectBelongsToSchool(subjectId: string, schoolId: string) {
    const sub = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!sub) throw new NotFoundException('Subject not found');
    if (sub.schoolId !== schoolId) throw new ForbiddenException('Subject does not belong to this school');
  }

  private async assertTeacherBelongsToSchool(teacherId: string, schoolId: string) {
    const t = await this.prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!t) throw new NotFoundException('Teacher not found');
    if (t.schoolId !== schoolId) throw new ForbiddenException('Teacher does not belong to this school');
  }

  private resolveSchoolId(currentUser: CurrentUser, schoolId?: string): string {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      if (!schoolId) throw new BadRequestException('schoolId is required');
      return schoolId;
    }
    if (!currentUser.schoolId) throw new ForbiddenException('School context missing');
    if (schoolId && schoolId !== currentUser.schoolId) {
      throw new ForbiddenException("Cannot access another school's data");
    }
    return currentUser.schoolId;
  }

  private buildSchoolFilter(currentUser: CurrentUser, schoolId?: string) {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      return schoolId ? { schoolId } : {};
    }
    if (!currentUser.schoolId) throw new ForbiddenException('School context missing');
    if (schoolId && schoolId !== currentUser.schoolId) {
      throw new ForbiddenException("Cannot access another school's data");
    }
    return { schoolId: currentUser.schoolId };
  }

  private assertSchoolAccess(currentUser: CurrentUser, resourceSchoolId: string) {
    if (currentUser.role === UserRole.SUPER_ADMIN) return;
    if (!currentUser.schoolId) throw new ForbiddenException('School context missing');
    if (currentUser.schoolId !== resourceSchoolId) {
      throw new ForbiddenException("Cannot access another school's data");
    }
  }
}
