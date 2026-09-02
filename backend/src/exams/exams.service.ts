import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExamStatus, Prisma, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEngineService } from '../notifications/notification-engine.service';
import { BulkMarksDto } from './dto/bulk-marks.dto';
import { CreateExamDto } from './dto/create-exam.dto';
import { CreateExamSubjectDto } from './dto/create-exam-subject.dto';
import { CreateGradeDto } from './dto/create-grade.dto';
import { EnterMarkDto } from './dto/enter-mark.dto';
import { ExamQueryDto } from './dto/exam-query.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';

const DEFAULT_GRADES = [
  { name: 'A+', minPercent: 90, maxPercent: 100 },
  { name: 'A', minPercent: 80, maxPercent: 89 },
  { name: 'B', minPercent: 70, maxPercent: 79 },
  { name: 'C', minPercent: 60, maxPercent: 69 },
  { name: 'D', minPercent: 50, maxPercent: 59 },
  { name: 'E', minPercent: 40, maxPercent: 49 },
  { name: 'F', minPercent: 0, maxPercent: 39 },
];

const examDetailInclude = {
  class: true,
  section: true,
  examSubjects: { include: { subject: true } },
} satisfies Prisma.ExamInclude;

const markInclude = {
  student: { include: { class: true, section: true } },
  subject: true,
  exam: true,
} satisfies Prisma.MarkInclude;

@Injectable()
export class ExamsService {
  constructor(
    private prisma: PrismaService,
    private readonly notificationEngine: NotificationEngineService,
  ) {}

  async findAllExams(currentUser: CurrentUser, query: ExamQueryDto) {
    return this.prisma.exam.findMany({
      where: {
        ...this.buildSchoolFilter(currentUser, query.schoolId),
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: examDetailInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneExam(id: string, currentUser: CurrentUser) {
    const exam = await this.findExamOrThrow(id);
    this.assertSchoolAccess(currentUser, exam.schoolId);
    return exam;
  }

  async createExam(dto: CreateExamDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);
    await this.assertClassBelongsToSchool(dto.classId, schoolId);

    if (dto.sectionId) {
      await this.assertSectionBelongsToSchool(dto.sectionId, schoolId, dto.classId);
    }

    const exam = await this.prisma.exam.create({
      data: {
        schoolId,
        name: dto.name,
        classId: dto.classId,
        sectionId: dto.sectionId,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        status: dto.status,
        description: dto.description,
      },
      include: examDetailInclude,
    });

    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitExamScheduled(schoolId, exam.id),
    );
    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitExamCreated(schoolId, exam.id),
    );

    return exam;
  }

  async updateExam(id: string, dto: UpdateExamDto, currentUser: CurrentUser) {
    const exam = await this.findExamOrThrow(id);
    this.assertSchoolAccess(currentUser, exam.schoolId);

    const classId = dto.classId ?? exam.classId;
    const sectionId = dto.sectionId !== undefined ? dto.sectionId : exam.sectionId;

    if (dto.classId) {
      await this.assertClassBelongsToSchool(dto.classId, exam.schoolId);
    }
    if (sectionId) {
      await this.assertSectionBelongsToSchool(sectionId, exam.schoolId, classId);
    }

    const updated = await this.prisma.exam.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.classId !== undefined ? { classId: dto.classId } : {}),
        ...(dto.sectionId !== undefined ? { sectionId: dto.sectionId } : {}),
        ...(dto.startDate !== undefined ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate !== undefined ? { endDate: new Date(dto.endDate) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
      include: examDetailInclude,
    });

    if (dto.status === ExamStatus.COMPLETED && exam.status !== ExamStatus.COMPLETED) {
      this.notificationEngine.dispatch(() =>
        this.notificationEngine.emitExamResultPublished(exam.schoolId, id),
      );
    }

    return updated;
  }

  async removeExam(id: string, currentUser: CurrentUser) {
    const exam = await this.findExamOrThrow(id);
    this.assertSchoolAccess(currentUser, exam.schoolId);

    return this.prisma.exam.update({
      where: { id },
      data: { status: ExamStatus.CANCELLED },
      include: examDetailInclude,
    });
  }

  async addExamSubject(examId: string, dto: CreateExamSubjectDto, currentUser: CurrentUser) {
    const exam = await this.findExamOrThrow(examId);
    this.assertSchoolAccess(currentUser, exam.schoolId);

    if (dto.passingMarks > dto.totalMarks) {
      throw new BadRequestException('passingMarks cannot be greater than totalMarks');
    }

    await this.assertSubjectBelongsToSchool(dto.subjectId, exam.schoolId);

    const existing = await this.prisma.examSubject.findUnique({
      where: {
        schoolId_examId_subjectId: {
          schoolId: exam.schoolId,
          examId,
          subjectId: dto.subjectId,
        },
      },
    });
    if (existing) {
      throw new BadRequestException('Subject already added to this exam');
    }

    return this.prisma.examSubject.create({
      data: {
        schoolId: exam.schoolId,
        examId,
        subjectId: dto.subjectId,
        totalMarks: dto.totalMarks,
        passingMarks: dto.passingMarks,
      },
      include: { subject: true },
    });
  }

  async findExamSubjects(examId: string, currentUser: CurrentUser) {
    const exam = await this.findExamOrThrow(examId);
    this.assertSchoolAccess(currentUser, exam.schoolId);

    return this.prisma.examSubject.findMany({
      where: { examId, schoolId: exam.schoolId },
      include: { subject: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async removeExamSubject(examId: string, examSubjectId: string, currentUser: CurrentUser) {
    const exam = await this.findExamOrThrow(examId);
    this.assertSchoolAccess(currentUser, exam.schoolId);

    const examSubject = await this.prisma.examSubject.findFirst({
      where: { id: examSubjectId, examId, schoolId: exam.schoolId },
    });
    if (!examSubject) {
      throw new NotFoundException('Exam subject not found');
    }

    return this.prisma.examSubject.delete({ where: { id: examSubjectId } });
  }

  async enterMark(dto: EnterMarkDto, currentUser: CurrentUser) {
    const exam = await this.findExamOrThrow(dto.examId);
    this.assertSchoolAccess(currentUser, exam.schoolId);

    const examSubject = await this.getExamSubjectOrThrow(exam.schoolId, dto.examId, dto.subjectId);
    await this.assertStudentMatchesExam(exam, dto.studentId);

    if (dto.obtainedMarks > examSubject.totalMarks) {
      throw new BadRequestException('obtainedMarks cannot be greater than totalMarks');
    }

    return this.prisma.mark.upsert({
      where: {
        schoolId_examId_subjectId_studentId: {
          schoolId: exam.schoolId,
          examId: dto.examId,
          subjectId: dto.subjectId,
          studentId: dto.studentId,
        },
      },
      create: {
        schoolId: exam.schoolId,
        examId: dto.examId,
        subjectId: dto.subjectId,
        studentId: dto.studentId,
        obtainedMarks: dto.obtainedMarks,
        remarks: dto.remarks,
      },
      update: {
        obtainedMarks: dto.obtainedMarks,
        remarks: dto.remarks,
      },
      include: markInclude,
    });
  }

  async enterBulkMarks(dto: BulkMarksDto, currentUser: CurrentUser) {
    const exam = await this.findExamOrThrow(dto.examId);
    this.assertSchoolAccess(currentUser, exam.schoolId);

    const examSubject = await this.getExamSubjectOrThrow(exam.schoolId, dto.examId, dto.subjectId);
    const results: Prisma.MarkGetPayload<{ include: typeof markInclude }>[] = [];

    for (const record of dto.records) {
      if (record.obtainedMarks > examSubject.totalMarks) {
        throw new BadRequestException(
          `obtainedMarks for student ${record.studentId} cannot be greater than totalMarks`,
        );
      }

      await this.assertStudentMatchesExam(exam, record.studentId);

      const mark = await this.prisma.mark.upsert({
        where: {
          schoolId_examId_subjectId_studentId: {
            schoolId: exam.schoolId,
            examId: dto.examId,
            subjectId: dto.subjectId,
            studentId: record.studentId,
          },
        },
        create: {
          schoolId: exam.schoolId,
          examId: dto.examId,
          subjectId: dto.subjectId,
          studentId: record.studentId,
          obtainedMarks: record.obtainedMarks,
          remarks: record.remarks,
        },
        update: {
          obtainedMarks: record.obtainedMarks,
          remarks: record.remarks,
        },
        include: markInclude,
      });

      results.push(mark);
    }

    return results;
  }

  async findMarks(examId: string, currentUser: CurrentUser, query: ExamQueryDto) {
    const exam = await this.findExamOrThrow(examId);
    this.assertSchoolAccess(currentUser, exam.schoolId);

    return this.prisma.mark.findMany({
      where: {
        examId,
        schoolId: exam.schoolId,
        ...(query.studentId ? { studentId: query.studentId } : {}),
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      },
      include: markInclude,
      orderBy: [{ student: { fullName: 'asc' } }, { subject: { name: 'asc' } }],
    });
  }

  async getStudentResult(examId: string, studentId: string, currentUser: CurrentUser) {
    const exam = await this.findExamOrThrow(examId);
    this.assertSchoolAccess(currentUser, exam.schoolId);
    if (currentUser.role === UserRole.PARENT) {
      const parent = await this.prisma.parent.findFirst({
        where: { userId: currentUser.id, studentId },
      });
      if (!parent) throw new ForbiddenException('Not authorized for this student');
    }
    if (currentUser.role === UserRole.STUDENT) {
      const self = await this.prisma.student.findFirst({
        where: { id: studentId, userId: currentUser.id },
      });
      if (!self) throw new ForbiddenException('Not authorized for this student');
    }
    await this.assertStudentMatchesExam(exam, studentId);

    const classResults = await this.buildClassResults(exam, exam.schoolId);
    const studentResult = classResults.find((r) => r.student.id === studentId);
    if (!studentResult) {
      throw new NotFoundException('Result not found for student');
    }

    const { student, subjects, totalMarks, obtainedMarks, percentage, grade, position, resultStatus } =
      studentResult;

    return {
      student,
      exam,
      subjects,
      totalMarks,
      obtainedMarks,
      percentage,
      grade,
      position,
      resultStatus,
    };
  }

  async getClassResults(examId: string, currentUser: CurrentUser) {
    const exam = await this.findExamOrThrow(examId);
    this.assertSchoolAccess(currentUser, exam.schoolId);

    const results = await this.buildClassResults(exam, exam.schoolId);

    return {
      exam,
      results,
    };
  }

  async findAllGrades(currentUser: CurrentUser, schoolId?: string) {
    const filter = this.buildSchoolFilter(currentUser, schoolId);

    return this.prisma.grade.findMany({
      where: filter,
      orderBy: [{ minPercent: 'desc' }, { name: 'asc' }],
    });
  }

  async createGrade(dto: CreateGradeDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);

    if (dto.minPercent > dto.maxPercent) {
      throw new BadRequestException('minPercent cannot be greater than maxPercent');
    }

    const existing = await this.prisma.grade.findFirst({
      where: { schoolId, name: dto.name },
    });
    if (existing) {
      throw new BadRequestException('Grade with this name already exists in the school');
    }

    return this.prisma.grade.create({
      data: {
        schoolId,
        name: dto.name,
        minPercent: dto.minPercent,
        maxPercent: dto.maxPercent,
        remarks: dto.remarks,
      },
    });
  }

  async updateGrade(id: string, dto: UpdateGradeDto, currentUser: CurrentUser) {
    const grade = await this.findGradeOrThrow(id);
    this.assertSchoolAccess(currentUser, grade.schoolId);

    const minPercent = dto.minPercent ?? grade.minPercent;
    const maxPercent = dto.maxPercent ?? grade.maxPercent;
    if (minPercent > maxPercent) {
      throw new BadRequestException('minPercent cannot be greater than maxPercent');
    }

    if (dto.name && dto.name !== grade.name) {
      const duplicate = await this.prisma.grade.findFirst({
        where: { schoolId: grade.schoolId, name: dto.name, NOT: { id } },
      });
      if (duplicate) {
        throw new BadRequestException('Grade with this name already exists in the school');
      }
    }

    return this.prisma.grade.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.minPercent !== undefined ? { minPercent: dto.minPercent } : {}),
        ...(dto.maxPercent !== undefined ? { maxPercent: dto.maxPercent } : {}),
        ...(dto.remarks !== undefined ? { remarks: dto.remarks } : {}),
      },
    });
  }

  async removeGrade(id: string, currentUser: CurrentUser) {
    const grade = await this.findGradeOrThrow(id);
    this.assertSchoolAccess(currentUser, grade.schoolId);
    return this.prisma.grade.delete({ where: { id } });
  }

  private async buildClassResults(exam: Prisma.ExamGetPayload<{ include: typeof examDetailInclude }>, schoolId: string) {
    const students = await this.prisma.student.findMany({
      where: {
        schoolId,
        status: 'ACTIVE',
        classId: exam.classId,
        ...(exam.sectionId ? { sectionId: exam.sectionId } : {}),
      },
      orderBy: { fullName: 'asc' },
    });

    const marks = await this.prisma.mark.findMany({
      where: { examId: exam.id, schoolId },
    });

    const marksByStudent = marks.reduce<Record<string, typeof marks>>((acc, mark) => {
      if (!acc[mark.studentId]) acc[mark.studentId] = [];
      acc[mark.studentId].push(mark);
      return acc;
    }, {});

    const grades = await this.prisma.grade.findMany({
      where: { schoolId },
      orderBy: { minPercent: 'desc' },
    });

    const rawResults = students.map((student) => {
      const studentMarks = marksByStudent[student.id] ?? [];
      const subjects = exam.examSubjects.map((examSubject) => {
        const mark = studentMarks.find((m) => m.subjectId === examSubject.subjectId);
        const obtainedMarks = mark?.obtainedMarks ?? 0;
        const status =
          !mark
            ? 'NOT_MARKED'
            : obtainedMarks >= examSubject.passingMarks
              ? 'PASS'
              : 'FAIL';

        return {
          subjectId: examSubject.subjectId,
          subjectName: examSubject.subject.name,
          totalMarks: examSubject.totalMarks,
          passingMarks: examSubject.passingMarks,
          obtainedMarks: mark ? obtainedMarks : null,
          status,
        };
      });

      const totalMarks = exam.examSubjects.reduce((sum, s) => sum + s.totalMarks, 0);
      const obtainedMarks = subjects.reduce((sum, s) => sum + (s.obtainedMarks ?? 0), 0);
      const percentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 10000) / 100 : 0;
      const grade = this.resolveGradeName(percentage, grades);

      const allMarked = subjects.every((s) => s.status !== 'NOT_MARKED');
      const anyFailed = subjects.some((s) => s.status === 'FAIL');

      const resultStatus = !allMarked ? 'INCOMPLETE' : anyFailed ? 'FAIL' : 'PASS';

      return {
        student,
        subjects,
        totalMarks,
        obtainedMarks,
        percentage,
        grade,
        resultStatus,
      };
    });

    const sorted = [...rawResults].sort((a, b) => {
      if (b.obtainedMarks !== a.obtainedMarks) return b.obtainedMarks - a.obtainedMarks;
      return b.percentage - a.percentage;
    });

    let position = 0;
    let lastScore = -1;

    return sorted.map((result, index) => {
      if (result.obtainedMarks !== lastScore) {
        position = index + 1;
        lastScore = result.obtainedMarks;
      }

      return {
        ...result,
        position,
      };
    });
  }

  private resolveGradeName(
    percentage: number,
    grades: { name: string; minPercent: number; maxPercent: number }[],
  ): string {
    const list = grades.length > 0 ? grades : DEFAULT_GRADES;
    const match = list.find((g) => percentage >= g.minPercent && percentage <= g.maxPercent);
    return match?.name ?? 'F';
  }

  private async getExamSubjectOrThrow(schoolId: string, examId: string, subjectId: string) {
    const examSubject = await this.prisma.examSubject.findUnique({
      where: {
        schoolId_examId_subjectId: { schoolId, examId, subjectId },
      },
    });
    if (!examSubject) {
      throw new NotFoundException('Exam subject not found');
    }
    return examSubject;
  }

  private async assertStudentMatchesExam(
    exam: { schoolId: string; classId: string; sectionId: string | null },
    studentId: string,
  ) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    if (student.schoolId !== exam.schoolId) {
      throw new ForbiddenException('Student does not belong to the specified school');
    }
    if (student.classId !== exam.classId) {
      throw new BadRequestException('Student does not belong to the exam class');
    }
    if (exam.sectionId && student.sectionId !== exam.sectionId) {
      throw new BadRequestException('Student does not belong to the exam section');
    }
    return student;
  }

  private async findExamOrThrow(id: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: examDetailInclude,
    });
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    return exam;
  }

  private async findGradeOrThrow(id: string) {
    const grade = await this.prisma.grade.findUnique({ where: { id } });
    if (!grade) {
      throw new NotFoundException('Grade not found');
    }
    return grade;
  }

  private async assertClassBelongsToSchool(classId: string, schoolId: string) {
    const classRecord = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!classRecord) {
      throw new NotFoundException('Class not found');
    }
    if (classRecord.schoolId !== schoolId) {
      throw new ForbiddenException('Class does not belong to the specified school');
    }
    return classRecord;
  }

  private async assertSectionBelongsToSchool(
    sectionId: string,
    schoolId: string,
    classId?: string,
  ) {
    const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
    if (!section) {
      throw new NotFoundException('Section not found');
    }
    if (section.schoolId !== schoolId) {
      throw new ForbiddenException('Section does not belong to the specified school');
    }
    if (classId && section.classId !== classId) {
      throw new BadRequestException('Section does not belong to the specified class');
    }
    return section;
  }

  private async assertSubjectBelongsToSchool(subjectId: string, schoolId: string) {
    const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    if (subject.schoolId !== schoolId) {
      throw new ForbiddenException('Subject does not belong to the specified school');
    }
    return subject;
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
