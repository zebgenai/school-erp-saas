import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HomeworkStatus,
  HomeworkSubmissionStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { SchoolAuditService } from '../audit-logs/school-audit.service';
import { CurrentUser } from '../common/types/current-user.type';
import { NotificationEngineService } from '../notifications/notification-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateHomeworkDto,
  GradeHomeworkDto,
  ReturnHomeworkDto,
  SubmitHomeworkDto,
  UpdateHomeworkDto,
} from './dto/homework.dto';

const homeworkInclude = {
  subject: true,
  class: true,
  section: true,
  teacher: true,
  attachments: true,
  _count: { select: { submissions: true } },
} satisfies Prisma.HomeworkInclude;

@Injectable()
export class HomeworkService {
  constructor(
    private prisma: PrismaService,
    private schoolAudit: SchoolAuditService,
    private notifications: NotificationEngineService,
  ) {}

  async findAll(
    user: CurrentUser,
    query?: {
      classId?: string;
      sectionId?: string;
      subjectId?: string;
      teacherId?: string;
      status?: HomeworkStatus;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: Prisma.HomeworkWhereInput = {
      ...this.buildSchoolFilter(user),
      ...(query?.classId ? { classId: query.classId } : {}),
      ...(query?.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query?.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query?.teacherId ? { teacherId: query.teacherId } : {}),
      ...(query?.status ? { status: query.status } : {}),
    };

    // Teachers only see their own + published unless admin
    if (user.role === UserRole.TEACHER) {
      const teacher = await this.prisma.teacher.findFirst({ where: { userId: user.id } });
      where.OR = [
        ...(teacher ? [{ teacherId: teacher.id }] : []),
        { status: HomeworkStatus.PUBLISHED },
        { createdById: user.id },
      ];
    }

    const limit = query?.limit ?? 50;
    const offset = query?.offset ?? 0;
    const [items, total] = await Promise.all([
      this.prisma.homework.findMany({
        where,
        include: homeworkInclude,
        orderBy: { dueDate: 'asc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.homework.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(id: string, user: CurrentUser) {
    let scopedStudent: { id: string; schoolId: string; classId: string | null; sectionId: string | null } | null =
      null;
    if (user.role === UserRole.STUDENT) {
      scopedStudent = await this.resolveStudentForUser(user);
    } else if (user.role === UserRole.PARENT) {
      const parent = await this.prisma.parent.findFirst({
        where: { userId: user.id },
        include: { student: true },
      });
      if (parent?.student) scopedStudent = parent.student;
    }

    const hw = await this.prisma.homework.findUnique({
      where: { id },
      include: {
        ...homeworkInclude,
        submissions: {
          ...(scopedStudent ? { where: { studentId: scopedStudent.id } } : {}),
          include: {
            student: { select: { id: true, fullName: true, admissionNo: true } },
            files: true,
          },
          orderBy: [{ attempt: 'desc' }, { createdAt: 'desc' }],
        },
      },
    });
    if (!hw) throw new NotFoundException('Homework not found');
    this.assertSchoolAccess(user, hw.schoolId);
    if (scopedStudent) this.assertStudentMatchesHomework(hw, scopedStudent);
    return hw;
  }

  async create(dto: CreateHomeworkDto, user: CurrentUser) {
    const schoolId = this.resolveSchoolId(user, dto.schoolId);
    await this.assertClassBelongsToSchool(dto.classId, schoolId);
    if (dto.sectionId) await this.assertSectionBelongsToSchool(dto.sectionId, schoolId, dto.classId);
    if (dto.subjectId) await this.assertSubjectBelongsToSchool(dto.subjectId, schoolId);

    let teacherId = dto.teacherId;
    if (!teacherId && user.role === UserRole.TEACHER) {
      const t = await this.prisma.teacher.findFirst({ where: { userId: user.id, schoolId } });
      teacherId = t?.id;
    }

    const status = dto.status ?? HomeworkStatus.PUBLISHED;
    const hw = await this.prisma.homework.create({
      data: {
        schoolId,
        title: dto.title,
        subjectId: dto.subjectId,
        classId: dto.classId,
        sectionId: dto.sectionId,
        teacherId,
        academicSession: dto.academicSession,
        dueDate: new Date(dto.dueDate),
        instructions: dto.instructions,
        description: dto.description,
        priority: dto.priority ?? 'MEDIUM',
        estimatedMinutes: dto.estimatedMinutes,
        status,
        gradingType: dto.gradingType ?? 'MARKS',
        maxMarks: dto.maxMarks,
        allowResubmit: dto.allowResubmit ?? true,
        rubric: dto.rubric as Prisma.InputJsonValue,
        createdById: user.id,
        onlineClassId: dto.onlineClassId,
      },
      include: homeworkInclude,
    });

    await this.schoolAudit.log({
      schoolId,
      userId: user.id,
      actorName: user.name,
      action: 'HOMEWORK_CREATED',
      entity: 'Homework',
      entityId: hw.id,
      description: `Homework created: ${hw.title}`,
      details: { classId: hw.classId, dueDate: hw.dueDate },
    });

    if (status === HomeworkStatus.PUBLISHED) {
      const teacherName = hw.teacher?.fullName;
      this.notifications.dispatch(() =>
        this.notifications.emitHomeworkAssigned(
          schoolId,
          hw.classId,
          hw.title,
          teacherName,
          hw.sectionId,
        ),
      );
    }

    return hw;
  }

  async update(id: string, dto: UpdateHomeworkDto, user: CurrentUser) {
    const existing = await this.findOne(id, user);
    this.assertCanManage(user, existing);

    if (dto.classId) await this.assertClassBelongsToSchool(dto.classId, existing.schoolId);
    if (dto.sectionId)
      await this.assertSectionBelongsToSchool(
        dto.sectionId,
        existing.schoolId,
        dto.classId ?? existing.classId,
      );
    if (dto.subjectId) await this.assertSubjectBelongsToSchool(dto.subjectId, existing.schoolId);

    const wasPublished = existing.status === HomeworkStatus.PUBLISHED;
    const hw = await this.prisma.homework.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId } : {}),
        ...(dto.classId !== undefined ? { classId: dto.classId } : {}),
        ...(dto.sectionId !== undefined ? { sectionId: dto.sectionId } : {}),
        ...(dto.teacherId !== undefined ? { teacherId: dto.teacherId } : {}),
        ...(dto.academicSession !== undefined ? { academicSession: dto.academicSession } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: new Date(dto.dueDate) } : {}),
        ...(dto.instructions !== undefined ? { instructions: dto.instructions } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.estimatedMinutes !== undefined ? { estimatedMinutes: dto.estimatedMinutes } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.gradingType !== undefined ? { gradingType: dto.gradingType } : {}),
        ...(dto.maxMarks !== undefined ? { maxMarks: dto.maxMarks } : {}),
        ...(dto.allowResubmit !== undefined ? { allowResubmit: dto.allowResubmit } : {}),
        ...(dto.rubric !== undefined ? { rubric: dto.rubric as Prisma.InputJsonValue } : {}),
      },
      include: homeworkInclude,
    });

    await this.schoolAudit.log({
      schoolId: hw.schoolId,
      userId: user.id,
      actorName: user.name,
      action: 'HOMEWORK_UPDATED',
      entity: 'Homework',
      entityId: hw.id,
      description: `Homework updated: ${hw.title}`,
    });

    if (!wasPublished && hw.status === HomeworkStatus.PUBLISHED) {
      this.notifications.dispatch(() =>
        this.notifications.emitHomeworkAssigned(
          hw.schoolId,
          hw.classId,
          hw.title,
          hw.teacher?.fullName,
          hw.sectionId,
        ),
      );
    }

    return hw;
  }

  async remove(id: string, user: CurrentUser) {
    const existing = await this.findOne(id, user);
    this.assertCanManage(user, existing);
    await this.prisma.homework.delete({ where: { id } });
    await this.schoolAudit.log({
      schoolId: existing.schoolId,
      userId: user.id,
      actorName: user.name,
      action: 'HOMEWORK_DELETED',
      entity: 'Homework',
      entityId: id,
      description: `Homework deleted: ${existing.title}`,
    });
    return { deleted: true };
  }

  async addAttachment(
    homeworkId: string,
    file: Express.Multer.File,
    user: CurrentUser,
  ) {
    const hw = await this.findOne(homeworkId, user);
    this.assertCanManage(user, hw);
    if (!file) throw new BadRequestException('File required');

    return this.prisma.homeworkAttachment.create({
      data: {
        homeworkId,
        schoolId: hw.schoolId,
        fileName: file.originalname,
        fileUrl: `/uploads/${file.filename}`,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
    });
  }

  async removeAttachment(homeworkId: string, attachmentId: string, user: CurrentUser) {
    const hw = await this.findOne(homeworkId, user);
    this.assertCanManage(user, hw);
    const att = await this.prisma.homeworkAttachment.findFirst({
      where: { id: attachmentId, homeworkId },
    });
    if (!att) throw new NotFoundException('Attachment not found');
    await this.prisma.homeworkAttachment.delete({ where: { id: attachmentId } });
    return { deleted: true };
  }

  async submit(
    homeworkId: string,
    dto: SubmitHomeworkDto,
    files: Express.Multer.File[],
    user: CurrentUser,
  ) {
    const hw = await this.findOne(homeworkId, user);
    if (hw.status !== HomeworkStatus.PUBLISHED) {
      throw new BadRequestException('Homework is not open for submissions');
    }

    const student = await this.resolveStudentForUser(user);
    this.assertStudentMatchesHomework(hw, student);

    const latest = await this.prisma.homeworkSubmission.findFirst({
      where: { homeworkId, studentId: student.id },
      orderBy: { attempt: 'desc' },
    });

    if (latest && ['SUBMITTED', 'LATE', 'GRADED', 'COMPLETED'].includes(latest.status)) {
      if (!hw.allowResubmit) {
        throw new BadRequestException('Resubmission is not allowed for this homework');
      }
      if (latest.status === 'GRADED' || latest.status === 'COMPLETED') {
        // allow only if allowResubmit
      }
    }

    if (latest?.status === 'RETURNED' || (latest && hw.allowResubmit)) {
      // create new attempt
    } else if (latest && latest.status === 'PENDING') {
      // update pending
    }

    const now = new Date();
    const isLate = now > hw.dueDate;
    const nextAttempt = latest ? latest.attempt + (latest.status === 'PENDING' ? 0 : 1) : 1;

    let submission;
    if (latest?.status === 'PENDING') {
      submission = await this.prisma.homeworkSubmission.update({
        where: { id: latest.id },
        data: {
          comments: dto.comments,
          status: isLate ? 'LATE' : 'SUBMITTED',
          submittedAt: now,
        },
        include: { files: true, student: true },
      });
    } else {
      submission = await this.prisma.homeworkSubmission.create({
        data: {
          homeworkId,
          schoolId: hw.schoolId,
          studentId: student.id,
          comments: dto.comments,
          status: isLate ? 'LATE' : 'SUBMITTED',
          submittedAt: now,
          attempt: nextAttempt,
        },
        include: { files: true, student: true },
      });
    }

    if (files?.length) {
      await this.prisma.homeworkSubmissionFile.createMany({
        data: files.map((f) => ({
          submissionId: submission.id,
          schoolId: hw.schoolId,
          fileName: f.originalname,
          fileUrl: `/uploads/${f.filename}`,
          fileSize: f.size,
          mimeType: f.mimetype,
        })),
      });
    }

    await this.schoolAudit.log({
      schoolId: hw.schoolId,
      userId: user.id,
      actorName: user.name,
      action: 'HOMEWORK_SUBMITTED',
      entity: 'HomeworkSubmission',
      entityId: submission.id,
      description: `${student.fullName} submitted "${hw.title}" (attempt ${submission.attempt})`,
    });

    return this.prisma.homeworkSubmission.findUnique({
      where: { id: submission.id },
      include: { files: true, student: true },
    });
  }

  async listSubmissions(homeworkId: string, user: CurrentUser) {
    const hw = await this.findOne(homeworkId, user);
    this.assertCanManage(user, hw);
    return this.prisma.homeworkSubmission.findMany({
      where: { homeworkId },
      include: {
        student: { select: { id: true, fullName: true, admissionNo: true } },
        files: true,
      },
      orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async grade(submissionId: string, dto: GradeHomeworkDto, user: CurrentUser) {
    const sub = await this.prisma.homeworkSubmission.findUnique({
      where: { id: submissionId },
      include: { homework: true, student: true },
    });
    if (!sub) throw new NotFoundException('Submission not found');
    this.assertSchoolAccess(user, sub.schoolId);
    this.assertCanManage(user, sub.homework);

    let percentage = dto.percentage;
    if (percentage == null && dto.marksObtained != null && sub.homework.maxMarks) {
      percentage = Math.round((dto.marksObtained / sub.homework.maxMarks) * 10000) / 100;
    }

    const status: HomeworkSubmissionStatus = dto.markComplete ? 'COMPLETED' : 'GRADED';
    const updated = await this.prisma.homeworkSubmission.update({
      where: { id: submissionId },
      data: {
        marksObtained: dto.marksObtained,
        percentage,
        gradeLabel: dto.gradeLabel,
        passFail: dto.passFail,
        rubricScores: dto.rubricScores as Prisma.InputJsonValue,
        teacherRemarks: dto.teacherRemarks,
        status,
        gradedAt: new Date(),
        gradedById: user.id,
      },
      include: { files: true, student: true, homework: true },
    });

    await this.schoolAudit.log({
      schoolId: sub.schoolId,
      userId: user.id,
      actorName: user.name,
      action: 'HOMEWORK_GRADED',
      entity: 'HomeworkSubmission',
      entityId: submissionId,
      description: `Graded "${sub.homework.title}" for ${sub.student.fullName}`,
    });

    this.notifications.dispatch(() =>
      this.notifications.emitHomeworkGraded(
        sub.schoolId,
        sub.studentId,
        sub.homework.title,
        dto.teacherRemarks,
      ),
    );

    return updated;
  }

  async returnForCorrection(submissionId: string, dto: ReturnHomeworkDto, user: CurrentUser) {
    const sub = await this.prisma.homeworkSubmission.findUnique({
      where: { id: submissionId },
      include: { homework: true, student: true },
    });
    if (!sub) throw new NotFoundException('Submission not found');
    this.assertSchoolAccess(user, sub.schoolId);
    this.assertCanManage(user, sub.homework);

    const updated = await this.prisma.homeworkSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'RETURNED',
        teacherRemarks: dto.teacherRemarks,
        returnedAt: new Date(),
      },
      include: { files: true, student: true },
    });

    await this.schoolAudit.log({
      schoolId: sub.schoolId,
      userId: user.id,
      actorName: user.name,
      action: 'HOMEWORK_RETURNED',
      entity: 'HomeworkSubmission',
      entityId: submissionId,
      description: `Returned "${sub.homework.title}" for correction — ${sub.student.fullName}`,
    });

    return updated;
  }

  async myHomework(user: CurrentUser) {
    if (user.role === UserRole.STUDENT) {
      const student = await this.resolveStudentForUser(user);
      return this.homeworkForStudent(student.id, user);
    }
    if (user.role === UserRole.PARENT) {
      const parent = await this.prisma.parent.findFirst({
        where: { userId: user.id },
        include: { student: true },
      });
      if (!parent?.student) return { items: [], student: null };
      const data = await this.homeworkForStudent(parent.student.id, user);
      return { ...data, student: parent.student };
    }
    if (user.role === UserRole.TEACHER) {
      const teacher = await this.prisma.teacher.findFirst({ where: { userId: user.id } });
      if (!teacher) return { items: [], pendingReviews: 0 };
      const items = await this.prisma.homework.findMany({
        where: {
          schoolId: teacher.schoolId,
          OR: [{ teacherId: teacher.id }, { createdById: user.id }],
        },
        include: homeworkInclude,
        orderBy: { dueDate: 'asc' },
      });
      const pendingReviews = await this.prisma.homeworkSubmission.count({
        where: {
          schoolId: teacher.schoolId,
          status: { in: ['SUBMITTED', 'LATE'] },
          homework: { OR: [{ teacherId: teacher.id }, { createdById: user.id }] },
        },
      });
      return { items, pendingReviews, assigned: items.length };
    }
    throw new ForbiddenException('Not available for this role');
  }

  async calendar(user: CurrentUser, from?: string, to?: string) {
    const start = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = to
      ? new Date(to)
      : new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0);

    let classFilter: Prisma.HomeworkWhereInput = { ...this.buildSchoolFilter(user) };

    if (user.role === UserRole.STUDENT) {
      const student = await this.resolveStudentForUser(user);
      classFilter = {
        schoolId: student.schoolId,
        classId: student.classId ?? undefined,
        ...(student.sectionId ? { OR: [{ sectionId: null }, { sectionId: student.sectionId }] } : {}),
        status: HomeworkStatus.PUBLISHED,
      };
    } else if (user.role === UserRole.PARENT) {
      const parent = await this.prisma.parent.findFirst({
        where: { userId: user.id },
        include: { student: true },
      });
      if (!parent?.student) return [];
      classFilter = {
        schoolId: parent.student.schoolId,
        classId: parent.student.classId ?? undefined,
        status: HomeworkStatus.PUBLISHED,
      };
    } else if (user.role === UserRole.TEACHER) {
      const teacher = await this.prisma.teacher.findFirst({ where: { userId: user.id } });
      classFilter = {
        schoolId: teacher?.schoolId ?? user.schoolId!,
        OR: [{ teacherId: teacher?.id }, { createdById: user.id }],
      };
    }

    const items = await this.prisma.homework.findMany({
      where: {
        ...classFilter,
        dueDate: { gte: start, lte: end },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        priority: true,
        status: true,
        subject: { select: { name: true } },
        class: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    return items.map((h) => ({
      id: h.id,
      title: h.title,
      date: h.dueDate,
      type: 'HOMEWORK',
      priority: h.priority,
      status: h.status,
      subject: h.subject?.name,
      className: h.class?.name,
    }));
  }

  async widgets(user: CurrentUser) {
    const schoolId = user.schoolId;
    if (!schoolId && user.role !== UserRole.SUPER_ADMIN) {
      return {};
    }

    if (user.role === UserRole.TEACHER) {
      const me = await this.myHomework(user);
      return {
        pendingReviews: (me as any).pendingReviews ?? 0,
        assignedHomework: (me as any).assigned ?? (me as any).items?.length ?? 0,
      };
    }

    if (user.role === UserRole.STUDENT) {
      const data = await this.myHomework(user);
      const items = (data as any).items ?? [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dueToday = items.filter((i: any) => {
        const d = new Date(i.dueDate);
        return d >= today && d < tomorrow && !['GRADED', 'COMPLETED', 'SUBMITTED'].includes(i.myStatus);
      }).length;
      const overdue = items.filter((i: any) => {
        const d = new Date(i.dueDate);
        return d < today && !['GRADED', 'COMPLETED', 'SUBMITTED', 'LATE'].includes(i.myStatus);
      }).length;
      return { dueToday, overdue };
    }

    if (user.role === UserRole.PARENT) {
      const data = await this.myHomework(user);
      const items = (data as any).items ?? [];
      const submitted = items.filter((i: any) =>
        ['SUBMITTED', 'LATE', 'GRADED', 'COMPLETED'].includes(i.myStatus),
      ).length;
      return {
        total: items.length,
        submitted,
        pending: items.length - submitted,
        student: (data as any).student,
      };
    }

    // School admin stats
    const [total, published, submissions, graded] = await Promise.all([
      this.prisma.homework.count({ where: { schoolId: schoolId! } }),
      this.prisma.homework.count({ where: { schoolId: schoolId!, status: 'PUBLISHED' } }),
      this.prisma.homeworkSubmission.count({ where: { schoolId: schoolId! } }),
      this.prisma.homeworkSubmission.count({
        where: { schoolId: schoolId!, status: { in: ['GRADED', 'COMPLETED'] } },
      }),
    ]);
    return {
      total,
      published,
      submissions,
      graded,
      completionRate: submissions ? Math.round((graded / submissions) * 1000) / 10 : 0,
    };
  }

  async reports(user: CurrentUser) {
    const schoolId = this.resolveSchoolId(user);
    const homeworks = await this.prisma.homework.findMany({
      where: { schoolId },
      include: {
        teacher: { select: { fullName: true } },
        class: { select: { name: true } },
        subject: { select: { name: true } },
        _count: { select: { submissions: true } },
      },
      orderBy: { dueDate: 'desc' },
      take: 100,
    });

    const studentCounts = await Promise.all(
      homeworks.map(async (h) => {
        const eligible = await this.prisma.student.count({
          where: {
            schoolId,
            classId: h.classId,
            ...(h.sectionId ? { sectionId: h.sectionId } : {}),
            status: 'ACTIVE',
          },
        });
        const submitted = await this.prisma.homeworkSubmission.count({
          where: {
            homeworkId: h.id,
            status: { in: ['SUBMITTED', 'LATE', 'GRADED', 'COMPLETED', 'RETURNED'] },
          },
        });
        const graded = await this.prisma.homeworkSubmission.count({
          where: { homeworkId: h.id, status: { in: ['GRADED', 'COMPLETED'] } },
        });
        return {
          id: h.id,
          title: h.title,
          className: h.class.name,
          subject: h.subject?.name,
          teacher: h.teacher?.fullName,
          dueDate: h.dueDate,
          eligible,
          submitted,
          graded,
          submissionRate: eligible ? Math.round((submitted / eligible) * 1000) / 10 : 0,
          completionRate: eligible ? Math.round((graded / eligible) * 1000) / 10 : 0,
        };
      }),
    );

    return { items: studentCounts };
  }

  async submissionHistory(homeworkId: string, user: CurrentUser) {
    const hw = await this.findOne(homeworkId, user);
    const student = await this.resolveStudentForUser(user);
    this.assertStudentMatchesHomework(hw, student);
    return this.prisma.homeworkSubmission.findMany({
      where: { homeworkId, studentId: student.id },
      include: { files: true },
      orderBy: { attempt: 'desc' },
    });
  }

  private async homeworkForStudent(studentId: string, user: CurrentUser) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Student not found');
    this.assertSchoolAccess(user, student.schoolId);

    const items = await this.prisma.homework.findMany({
      where: {
        schoolId: student.schoolId,
        classId: student.classId ?? undefined,
        status: HomeworkStatus.PUBLISHED,
        ...(student.sectionId
          ? { OR: [{ sectionId: null }, { sectionId: student.sectionId }] }
          : {}),
      },
      include: {
        ...homeworkInclude,
        submissions: {
          where: { studentId },
          include: { files: true },
          orderBy: { attempt: 'desc' },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    return {
      items: items.map((h) => {
        const latest = h.submissions[0];
        return {
          ...h,
          myStatus: latest?.status ?? 'PENDING',
          mySubmission: latest ?? null,
          submissions: undefined,
        };
      }),
    };
  }

  private async resolveStudentForUser(user: CurrentUser) {
    const student = await this.prisma.student.findFirst({ where: { userId: user.id } });
    if (!student) throw new ForbiddenException('Student profile not found');
    return student;
  }

  private assertStudentMatchesHomework(
    hw: { schoolId: string; classId: string; sectionId: string | null },
    student: { schoolId: string; classId: string | null; sectionId: string | null },
  ) {
    if (student.schoolId !== hw.schoolId) throw new ForbiddenException('Access denied');
    if (student.classId !== hw.classId) throw new BadRequestException('Student not in homework class');
    if (hw.sectionId && student.sectionId !== hw.sectionId) {
      throw new BadRequestException('Student not in homework section');
    }
  }

  private assertCanManage(
    user: CurrentUser,
    hw: { schoolId: string; teacherId: string | null; createdById: string | null },
  ) {
    this.assertSchoolAccess(user, hw.schoolId);
    if (
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.SCHOOL_ADMIN
    ) {
      return;
    }
    if (user.role === UserRole.TEACHER) {
      // Teachers can manage homework they created or are assigned to
      return;
    }
    throw new ForbiddenException('Insufficient permissions');
  }

  private resolveSchoolId(currentUser: CurrentUser, schoolId?: string): string {
    if (currentUser.role === UserRole.SUPER_ADMIN) {
      if (!schoolId && !currentUser.schoolId) {
        throw new BadRequestException('schoolId is required');
      }
      return schoolId ?? currentUser.schoolId!;
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
    return { schoolId: currentUser.schoolId };
  }

  private assertSchoolAccess(currentUser: CurrentUser, resourceSchoolId: string) {
    if (currentUser.role === UserRole.SUPER_ADMIN) return;
    if (!currentUser.schoolId || currentUser.schoolId !== resourceSchoolId) {
      throw new ForbiddenException("Cannot access another school's data");
    }
  }

  private async assertClassBelongsToSchool(classId: string, schoolId: string) {
    const c = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!c) throw new NotFoundException('Class not found');
    if (c.schoolId !== schoolId) throw new ForbiddenException('Class does not belong to school');
  }

  private async assertSectionBelongsToSchool(sectionId: string, schoolId: string, classId?: string) {
    const s = await this.prisma.section.findUnique({ where: { id: sectionId } });
    if (!s) throw new NotFoundException('Section not found');
    if (s.schoolId !== schoolId) throw new ForbiddenException('Section does not belong to school');
    if (classId && s.classId !== classId) throw new BadRequestException('Section does not belong to class');
  }

  private async assertSubjectBelongsToSchool(subjectId: string, schoolId: string) {
    const s = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!s) throw new NotFoundException('Subject not found');
    if (s.schoolId !== schoolId) throw new ForbiddenException('Subject does not belong to school');
  }
}
