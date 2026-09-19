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
import { IdCardView, mapIdCardView, missingPhotoStudents } from './card-payload';
import { MAX_ID_CARDS_BATCH, PreviewIdCardsDto } from './dto/preview-id-cards.dto';
import { IdCardsQueryDto } from './dto/id-cards-query.dto';
import { ID_CARD_TEMPLATES } from './id-card-templates';
import { qrTokenToSvg } from './qr-render';
import { generateQrToken } from './qr-token';

const studentCardInclude = {
  class: { select: { name: true } },
  section: { select: { name: true } },
} satisfies Prisma.StudentInclude;

type StudentWithRelations = Prisma.StudentGetPayload<{ include: typeof studentCardInclude }>;

@Injectable()
export class IdCardsService {
  constructor(private readonly prisma: PrismaService) {}

  listTemplates() {
    return ID_CARD_TEMPLATES;
  }

  async findAll(currentUser: CurrentUser, query: IdCardsQueryDto) {
    const schoolId = this.requireSchoolId(currentUser, query.schoolId);
    const { take, skip } = resolvePagination(query);

    const where: Prisma.StudentIdCardWhereInput = {
      schoolId,
      isActive: true,
      ...(query.studentId ? { studentId: query.studentId } : {}),
      student: {
        schoolId,
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
        ...(query.search
          ? {
              OR: [
                { fullName: { contains: query.search, mode: 'insensitive' } },
                { admissionNo: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    };

    const [rows, total] = await Promise.all([
      this.prisma.studentIdCard.findMany({
        where,
        include: { student: { include: studentCardInclude } },
        orderBy: { issuedAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.studentIdCard.count({ where }),
    ]);

    const school = await this.loadSchool(schoolId);
    const data = await Promise.all(
      rows.map((row) => this.toView(row, row.student, school, school.idCardTemplate, true)),
    );
    return paginatedResult(data, total, take, skip);
  }

  async getForStudent(studentId: string, currentUser: CurrentUser, schoolId?: string) {
    const student = await this.assertStudentInSchool(studentId, currentUser, schoolId);
    const card = await this.prisma.studentIdCard.findFirst({
      where: { schoolId: student.schoolId, studentId: student.id, isActive: true },
    });
    const school = await this.loadSchool(student.schoolId);
    if (!card) {
      return {
        card: null,
        student: mapIdCardView({
          student,
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
        }).student,
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
        historyCount: await this.prisma.studentIdCard.count({
          where: { schoolId: student.schoolId, studentId: student.id },
        }),
      };
    }
    return this.toView(card, student, school, school.idCardTemplate, true);
  }

  async issue(studentId: string, currentUser: CurrentUser, schoolId?: string) {
    const student = await this.assertStudentInSchool(studentId, currentUser, schoolId);
    this.assertStudentActive(student);
    const existing = await this.prisma.studentIdCard.findFirst({
      where: { schoolId: student.schoolId, studentId: student.id, isActive: true },
    });
    if (existing) {
      const school = await this.loadSchool(student.schoolId);
      return this.toView(existing, student, school, school.idCardTemplate, true);
    }
    return this.createCard(student);
  }

  /** Explicit bulk mint — manage roles only. Never called from preview. */
  async bulkGenerate(dto: PreviewIdCardsDto, currentUser: CurrentUser) {
    const schoolId = this.requireSchoolId(currentUser, dto.schoolId);
    const { students, nextCursor, hasMore } = await this.loadPreviewStudents(schoolId, dto);
    const cards: IdCardView[] = [];
    let generated = 0;
    let alreadyHadActiveCard = 0;
    let skippedInactive = 0;
    let failed = 0;

    for (const student of students) {
      if (student.status !== 'ACTIVE') {
        skippedInactive += 1;
        continue;
      }
      try {
        const existing = await this.prisma.studentIdCard.findFirst({
          where: { schoolId: student.schoolId, studentId: student.id, isActive: true },
        });
        if (existing) {
          alreadyHadActiveCard += 1;
          const school = await this.loadSchool(student.schoolId);
          cards.push(await this.toView(existing, student, school, school.idCardTemplate, true));
          continue;
        }
        cards.push(await this.createCard(student));
        generated += 1;
      } catch {
        failed += 1;
      }
    }

    const school = await this.loadSchool(schoolId);
    return {
      template: dto.template ?? school.idCardTemplate,
      cards,
      missingPhotos: missingPhotoStudents(cards),
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

  async reissue(studentId: string, currentUser: CurrentUser, schoolId?: string) {
    const student = await this.assertStudentInSchool(studentId, currentUser, schoolId);
    this.assertStudentActive(student);
    try {
      const card = await this.prisma.$transaction(async (tx) => {
        await tx.studentIdCard.updateMany({
          where: { schoolId: student.schoolId, studentId: student.id, isActive: true },
          data: { isActive: false, revokedAt: new Date() },
        });
        return tx.studentIdCard.create({
          data: {
            schoolId: student.schoolId,
            studentId: student.id,
            qrToken: generateQrToken(),
          },
        });
      });
      const school = await this.loadSchool(student.schoolId);
      return this.toView(card, student, school, school.idCardTemplate, true);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.studentIdCard.findFirst({
          where: { schoolId: student.schoolId, studentId: student.id, isActive: true },
        });
        if (existing) {
          const school = await this.loadSchool(student.schoolId);
          return this.toView(existing, student, school, school.idCardTemplate, true);
        }
      }
      throw error;
    }
  }

  async revoke(studentId: string, currentUser: CurrentUser, schoolId?: string) {
    const student = await this.assertStudentInSchool(studentId, currentUser, schoolId);
    const result = await this.prisma.studentIdCard.updateMany({
      where: { schoolId: student.schoolId, studentId: student.id, isActive: true },
      data: { isActive: false, revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('No active ID card to revoke');
    }
    return { revoked: result.count };
  }

  /**
   * Read-only layout preview. Never creates StudentIdCard rows or mints QR tokens.
   * Students without an active card are returned with cardExists: false.
   */
  async preview(dto: PreviewIdCardsDto, currentUser: CurrentUser) {
    const schoolId = this.requireSchoolId(currentUser, dto.schoolId);
    const { students, nextCursor, hasMore } = await this.loadPreviewStudents(schoolId, dto);
    const school = await this.loadSchool(schoolId);
    const template = dto.template ?? school.idCardTemplate;

    const cards: IdCardView[] = [];
    for (const student of students) {
      const card = await this.prisma.studentIdCard.findFirst({
        where: { schoolId, studentId: student.id, isActive: true },
      });
      if (card) {
        cards.push(await this.toView(card, student, school, template, true));
      } else {
        cards.push(
          mapIdCardView({
            student,
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
      missingPhotos: missingPhotoStudents(cards),
      total: cards.length,
      issuedCount: cards.filter((c) => c.cardExists).length,
      pendingCount: cards.filter((c) => !c.cardExists).length,
      nextCursor,
      hasMore,
      batchSize: MAX_ID_CARDS_BATCH,
    };
  }

  private async createCard(student: StudentWithRelations) {
    try {
      const card = await this.prisma.studentIdCard.create({
        data: {
          schoolId: student.schoolId,
          studentId: student.id,
          qrToken: generateQrToken(),
        },
      });
      const school = await this.loadSchool(student.schoolId);
      return this.toView(card, student, school, school.idCardTemplate, true);
    } catch (error) {
      // Concurrent Generate: partial unique index rejects a second active card.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.studentIdCard.findFirst({
          where: { schoolId: student.schoolId, studentId: student.id, isActive: true },
        });
        if (existing) {
          const school = await this.loadSchool(student.schoolId);
          return this.toView(existing, student, school, school.idCardTemplate, true);
        }
      }
      throw error;
    }
  }

  private async toView(
    card: { id: string; qrToken: string; isActive: boolean; issuedAt: Date; revokedAt: Date | null },
    student: StudentLike,
    school: SchoolLike,
    template: IdCardTemplate,
    cardExists: boolean,
  ): Promise<IdCardView> {
    let qrSvg: string | undefined;
    if (card.qrToken) {
      try {
        qrSvg = await qrTokenToSvg(card.qrToken);
      } catch {
        qrSvg = undefined;
      }
    }
    return mapIdCardView({ student, school, card, template, qrSvg, cardExists });
  }

  private async loadPreviewStudents(schoolId: string, dto: PreviewIdCardsDto) {
    const hasIds = Boolean(dto.studentIds?.length);
    const allActive = Boolean(dto.allActive);

    if (!hasIds && !dto.classId && !allActive) {
      throw new BadRequestException('Select a class, specific students, or all active students');
    }

    if (dto.classId) {
      const classRecord = await this.prisma.class.findUnique({ where: { id: dto.classId } });
      if (!classRecord || classRecord.schoolId !== schoolId) {
        throw new ForbiddenException('Class does not belong to the specified school');
      }
    }
    if (dto.sectionId) {
      const section = await this.prisma.section.findUnique({ where: { id: dto.sectionId } });
      if (!section || section.schoolId !== schoolId) {
        throw new ForbiddenException('Section does not belong to the specified school');
      }
      if (dto.classId && section.classId !== dto.classId) {
        throw new BadRequestException('Section does not belong to the specified class');
      }
    }

    const where: Prisma.StudentWhereInput = {
      schoolId,
      ...(dto.includeInactive ? {} : { status: 'ACTIVE' }),
      ...(allActive ? {} : dto.classId ? { classId: dto.classId } : {}),
      ...(allActive ? {} : dto.sectionId ? { sectionId: dto.sectionId } : {}),
      ...(hasIds ? { id: { in: dto.studentIds } } : {}),
      ...(!hasIds && dto.cursor ? { id: { gt: dto.cursor } } : {}),
    };

    const take = MAX_ID_CARDS_BATCH;
    const rows = await this.prisma.student.findMany({
      where,
      include: studentCardInclude,
      orderBy: { id: 'asc' },
      take: hasIds ? take : take + 1,
    });

    const hasMore = !hasIds && rows.length > take;
    const students = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? students[students.length - 1]?.id : undefined;

    if (hasIds) {
      const tenancy = await this.prisma.student.findMany({
        where: { schoolId, id: { in: dto.studentIds } },
        select: { id: true },
      });
      const allowed = new Set(tenancy.map((s) => s.id));
      for (const id of dto.studentIds!) {
        if (!allowed.has(id)) {
          throw new ForbiddenException('One or more students do not belong to this school');
        }
      }
    }

    return { students, nextCursor, hasMore };
  }

  private async assertStudentInSchool(
    studentId: string,
    currentUser: CurrentUser,
    requestedSchoolId?: string,
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: studentCardInclude,
    });
    if (!student) throw new NotFoundException('Student not found');
    const schoolId = this.requireSchoolId(currentUser, requestedSchoolId ?? student.schoolId);
    if (student.schoolId !== schoolId) {
      throw new ForbiddenException('Student does not belong to the specified school');
    }
    return student;
  }

  private assertStudentActive(student: { status: string }) {
    if (student.status !== 'ACTIVE') {
      throw new BadRequestException('Inactive students cannot receive an ID card');
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

type StudentLike = {
  id: string;
  fullName: string;
  admissionNo: string;
  fatherName?: string | null;
  photoUrl?: string | null;
  status: string;
  class?: { name: string } | null;
  section?: { name: string } | null;
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
