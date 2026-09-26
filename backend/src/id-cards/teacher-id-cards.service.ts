import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdCardTemplate, Prisma, UserRole } from '@prisma/client';
import { resolvePagination } from '../common/dto/pagination-query.dto';
import { paginatedResult } from '../common/utils/paginated-result';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_ID_CARDS_BATCH } from './dto/preview-id-cards.dto';
import { PreviewTeacherIdCardsDto } from './dto/preview-teacher-id-cards.dto';
import { TeacherIdCardsQueryDto } from './dto/teacher-id-cards-query.dto';
import { qrTokenToSvg } from './qr-render';
import { generateTeacherQrToken, normalizeScannedTeacherQr } from './qr-token';
import {
  mapTeacherIdCardView,
  missingPhotoTeachers,
  TeacherIdCardView,
} from './teacher-card-payload';

type TeacherLike = {
  id: string;
  schoolId: string;
  fullName: string;
  employeeNo?: string | null;
  designation?: string | null;
  photoUrl?: string | null;
  status: string;
};

type SchoolLike = {
  id: string;
  name: string;
  logoUrl?: string | null;
  themeColor?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  domain?: string | null;
  idCardTemplate: IdCardTemplate;
};

@Injectable()
export class TeacherIdCardsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(currentUser: CurrentUser, query: TeacherIdCardsQueryDto) {
    const schoolId = this.requireSchoolId(currentUser, query.schoolId);
    const { take, skip } = resolvePagination(query);

    const where: Prisma.TeacherIdCardWhereInput = {
      schoolId,
      isActive: true,
      ...(query.teacherId ? { teacherId: query.teacherId } : {}),
      teacher: {
        schoolId,
        ...(query.search
          ? {
              OR: [
                { fullName: { contains: query.search, mode: 'insensitive' } },
                { employeeNo: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    };

    const [rows, total] = await Promise.all([
      this.prisma.teacherIdCard.findMany({
        where,
        include: { teacher: true },
        orderBy: { issuedAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.teacherIdCard.count({ where }),
    ]);

    const school = await this.loadSchool(schoolId);
    const data = await Promise.all(
      rows.map((row) => this.toView(row, row.teacher, school, school.idCardTemplate, true)),
    );
    return paginatedResult(data, total, take, skip);
  }

  async getForTeacher(teacherId: string, currentUser: CurrentUser, schoolId?: string) {
    const teacher = await this.assertTeacherInSchool(teacherId, currentUser, schoolId);
    const card = await this.prisma.teacherIdCard.findFirst({
      where: { schoolId: teacher.schoolId, teacherId: teacher.id, isActive: true },
    });
    const school = await this.loadSchool(teacher.schoolId);
    if (!card) {
      return {
        card: null,
        teacher: mapTeacherIdCardView({
          teacher,
          school,
          card: {
            id: '',
            qrToken: '',
            isActive: false,
            issuedAt: new Date(0),
            revokedAt: null,
          },
          template: school.idCardTemplate,
          cardExists: false,
        }).teacher,
        school: {
          id: school.id,
          name: school.name,
          logoUrl: school.logoUrl,
          themeColor: school.themeColor,
          address: school.address,
          phone: school.phone,
          email: school.email,
          domain: school.domain,
        },
        template: school.idCardTemplate,
        historyCount: await this.prisma.teacherIdCard.count({
          where: { schoolId: teacher.schoolId, teacherId: teacher.id },
        }),
      };
    }
    return this.toView(card, teacher, school, school.idCardTemplate, true);
  }

  async issue(teacherId: string, currentUser: CurrentUser, schoolId?: string) {
    const teacher = await this.assertTeacherInSchool(teacherId, currentUser, schoolId);
    this.assertTeacherActive(teacher);
    const existing = await this.prisma.teacherIdCard.findFirst({
      where: { schoolId: teacher.schoolId, teacherId: teacher.id, isActive: true },
    });
    if (existing) {
      const school = await this.loadSchool(teacher.schoolId);
      return this.toView(existing, teacher, school, school.idCardTemplate, true);
    }
    return this.createCard(teacher);
  }

  async bulkGenerate(dto: PreviewTeacherIdCardsDto, currentUser: CurrentUser) {
    const schoolId = this.requireSchoolId(currentUser, dto.schoolId);
    const { teachers, nextCursor, hasMore } = await this.loadPreviewTeachers(schoolId, dto);
    const cards: TeacherIdCardView[] = [];
    let generated = 0;
    let alreadyHadActiveCard = 0;
    let skippedInactive = 0;
    let failed = 0;

    for (const teacher of teachers) {
      if (teacher.status !== 'ACTIVE') {
        skippedInactive += 1;
        continue;
      }
      try {
        const existing = await this.prisma.teacherIdCard.findFirst({
          where: { schoolId: teacher.schoolId, teacherId: teacher.id, isActive: true },
        });
        if (existing) {
          alreadyHadActiveCard += 1;
          const school = await this.loadSchool(teacher.schoolId);
          cards.push(await this.toView(existing, teacher, school, school.idCardTemplate, true));
          continue;
        }
        cards.push(await this.createCard(teacher));
        generated += 1;
      } catch {
        failed += 1;
      }
    }

    const school = await this.loadSchool(schoolId);
    return {
      template: dto.template ?? school.idCardTemplate,
      cards,
      missingPhotos: missingPhotoTeachers(cards),
      total: cards.length,
      generated,
      alreadyHadActiveCard,
      skippedInactive,
      failed,
      nextCursor,
      hasMore,
      batchSize: MAX_ID_CARDS_BATCH,
    };
  }

  async reissue(teacherId: string, currentUser: CurrentUser, schoolId?: string) {
    const teacher = await this.assertTeacherInSchool(teacherId, currentUser, schoolId);
    this.assertTeacherActive(teacher);
    try {
      const card = await this.prisma.$transaction(async (tx) => {
        await tx.teacherIdCard.updateMany({
          where: { schoolId: teacher.schoolId, teacherId: teacher.id, isActive: true },
          data: { isActive: false, revokedAt: new Date() },
        });
        return tx.teacherIdCard.create({
          data: {
            schoolId: teacher.schoolId,
            teacherId: teacher.id,
            qrToken: generateTeacherQrToken(),
          },
        });
      });
      const school = await this.loadSchool(teacher.schoolId);
      return this.toView(card, teacher, school, school.idCardTemplate, true);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.teacherIdCard.findFirst({
          where: { schoolId: teacher.schoolId, teacherId: teacher.id, isActive: true },
        });
        if (existing) {
          const school = await this.loadSchool(teacher.schoolId);
          return this.toView(existing, teacher, school, school.idCardTemplate, true);
        }
      }
      throw error;
    }
  }

  async revoke(teacherId: string, currentUser: CurrentUser, schoolId?: string) {
    const teacher = await this.assertTeacherInSchool(teacherId, currentUser, schoolId);
    const result = await this.prisma.teacherIdCard.updateMany({
      where: { schoolId: teacher.schoolId, teacherId: teacher.id, isActive: true },
      data: { isActive: false, revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('No active teacher ID card to revoke');
    }
    return { revoked: result.count };
  }

  /**
   * Read-only layout preview. Never creates TeacherIdCard rows or mints QR tokens.
   */
  async preview(dto: PreviewTeacherIdCardsDto, currentUser: CurrentUser) {
    const schoolId = this.requireSchoolId(currentUser, dto.schoolId);
    const { teachers, nextCursor, hasMore } = await this.loadPreviewTeachers(schoolId, dto);
    const school = await this.loadSchool(schoolId);
    const template = dto.template ?? school.idCardTemplate;

    const cards: TeacherIdCardView[] = [];
    for (const teacher of teachers) {
      const card = await this.prisma.teacherIdCard.findFirst({
        where: { schoolId, teacherId: teacher.id, isActive: true },
      });
      if (card) {
        cards.push(await this.toView(card, teacher, school, template, true));
      } else {
        cards.push(
          mapTeacherIdCardView({
            teacher,
            school,
            card: {
              id: '',
              qrToken: '',
              isActive: false,
              issuedAt: new Date(0),
              revokedAt: null,
            },
            template,
            cardExists: false,
          }),
        );
      }
    }

    return {
      template,
      cards,
      missingPhotos: missingPhotoTeachers(cards),
      total: cards.length,
      issuedCount: cards.filter((c) => c.cardExists).length,
      pendingCount: cards.filter((c) => !c.cardExists).length,
      nextCursor,
      hasMore,
      batchSize: MAX_ID_CARDS_BATCH,
    };
  }

  /**
   * Resolve an active teacher card by QR token (for future attendance scanning).
   * Does not trust a client-provided teacherId — only the token.
   */
  async resolveActiveByToken(rawToken: string, schoolId: string) {
    const token = normalizeScannedTeacherQr(rawToken);
    if (!token) {
      throw new BadRequestException('Invalid teacher QR token');
    }

    const card = await this.prisma.teacherIdCard.findFirst({
      where: { qrToken: token, schoolId, isActive: true },
      include: { teacher: true },
    });

    if (!card) {
      throw new NotFoundException('Teacher ID card not found or inactive');
    }
    if (card.revokedAt) {
      throw new BadRequestException('Teacher ID card has been revoked');
    }
    if (card.teacher.status !== 'ACTIVE') {
      throw new BadRequestException('Teacher is inactive');
    }
    if (card.teacher.schoolId !== schoolId) {
      throw new ForbiddenException("Cannot access another school's data");
    }

    const school = await this.loadSchool(schoolId);
    return this.toView(card, card.teacher, school, school.idCardTemplate, true);
  }

  private async createCard(teacher: TeacherLike) {
    try {
      const card = await this.prisma.teacherIdCard.create({
        data: {
          schoolId: teacher.schoolId,
          teacherId: teacher.id,
          qrToken: generateTeacherQrToken(),
        },
      });
      const school = await this.loadSchool(teacher.schoolId);
      return this.toView(card, teacher, school, school.idCardTemplate, true);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.teacherIdCard.findFirst({
          where: { schoolId: teacher.schoolId, teacherId: teacher.id, isActive: true },
        });
        if (existing) {
          const school = await this.loadSchool(teacher.schoolId);
          return this.toView(existing, teacher, school, school.idCardTemplate, true);
        }
      }
      throw error;
    }
  }

  private async toView(
    card: { id: string; qrToken: string; isActive: boolean; issuedAt: Date; revokedAt: Date | null },
    teacher: TeacherLike,
    school: SchoolLike,
    template: IdCardTemplate,
    cardExists: boolean,
  ): Promise<TeacherIdCardView> {
    let qrSvg: string | undefined;
    if (card.qrToken) {
      try {
        qrSvg = await qrTokenToSvg(card.qrToken);
      } catch {
        qrSvg = undefined;
      }
    }
    return mapTeacherIdCardView({ teacher, school, card, template, qrSvg, cardExists });
  }

  private async loadPreviewTeachers(schoolId: string, dto: PreviewTeacherIdCardsDto) {
    const hasIds = Boolean(dto.teacherIds?.length);
    const allActive = Boolean(dto.allActive);

    if (!hasIds && !allActive) {
      throw new BadRequestException('Select specific teachers or all active teachers');
    }

    const where: Prisma.TeacherWhereInput = {
      schoolId,
      ...(dto.includeInactive ? {} : { status: 'ACTIVE' }),
      ...(hasIds ? { id: { in: dto.teacherIds } } : {}),
      ...(!hasIds && dto.cursor ? { id: { gt: dto.cursor } } : {}),
    };

    const take = MAX_ID_CARDS_BATCH;
    const rows = await this.prisma.teacher.findMany({
      where,
      orderBy: { id: 'asc' },
      take: hasIds ? take : take + 1,
    });

    const hasMore = !hasIds && rows.length > take;
    const teachers = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? teachers[teachers.length - 1]?.id : undefined;

    if (hasIds) {
      const tenancy = await this.prisma.teacher.findMany({
        where: { schoolId, id: { in: dto.teacherIds } },
        select: { id: true },
      });
      const allowed = new Set(tenancy.map((t) => t.id));
      for (const id of dto.teacherIds!) {
        if (!allowed.has(id)) {
          throw new ForbiddenException('One or more teachers do not belong to this school');
        }
      }
    }

    return { teachers, nextCursor, hasMore };
  }

  private async assertTeacherInSchool(
    teacherId: string,
    currentUser: CurrentUser,
    requestedSchoolId?: string,
  ) {
    const teacher = await this.prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) throw new NotFoundException('Teacher not found');
    const schoolId = this.requireSchoolId(currentUser, requestedSchoolId ?? teacher.schoolId);
    if (teacher.schoolId !== schoolId) {
      throw new ForbiddenException('Teacher does not belong to the specified school');
    }
    return teacher;
  }

  private assertTeacherActive(teacher: { status: string }) {
    if (teacher.status !== 'ACTIVE') {
      throw new BadRequestException('Inactive teachers cannot receive an ID card');
    }
  }

  private async loadSchool(schoolId: string) {
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new NotFoundException('School not found');
    return school;
  }

  requireSchoolId(currentUser: CurrentUser, schoolId?: string): string {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      if (!schoolId) throw new BadRequestException('schoolId is required');
      return schoolId;
    }
    if (!currentUser.schoolId) {
      throw new ForbiddenException('School context missing');
    }
    if (schoolId && schoolId !== currentUser.schoolId) {
      throw new ForbiddenException("Cannot access another school's data");
    }
    return currentUser.schoolId;
  }
}
