import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { resolvePagination } from '../common/dto/pagination-query.dto';
import { paginatedResult } from '../common/utils/paginated-result';
import { NotificationEngineService } from '../notifications/notification-engine.service';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { BookQueryDto } from './dto/book-query.dto';
import { CreateBookCategoryDto } from './dto/create-book-category.dto';
import { CreateBookDto } from './dto/create-book.dto';
import { IssueBookDto } from './dto/issue-book.dto';
import { ReturnBookDto } from './dto/return-book.dto';
import { UpdateBookCategoryDto } from './dto/update-book-category.dto';
import { UpdateBookDto } from './dto/update-book.dto';

const bookInclude = { category: true } satisfies Prisma.BookInclude;

const issueInclude = {
  book: { include: { category: true } },
  student: { select: { id: true, fullName: true, admissionNo: true, class: true } },
  issuedBy: { select: { id: true, name: true } },
} satisfies Prisma.BookIssueInclude;

@Injectable()
export class LibraryService {
  constructor(
    private prisma: PrismaService,
    private readonly notificationEngine: NotificationEngineService,
  ) {}

  // ─── Categories ──────────────────────────────────────────────────────────────

  async findAllCategories(currentUser: CurrentUser, schoolId?: string) {
    return this.prisma.bookCategory.findMany({
      where: this.buildSchoolFilter(currentUser, schoolId),
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(dto: CreateBookCategoryDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);

    const dup = await this.prisma.bookCategory.findUnique({
      where: { schoolId_name: { schoolId, name: dto.name } },
    });
    if (dup) throw new BadRequestException('A book category with this name already exists');

    return this.prisma.bookCategory.create({
      data: { schoolId, name: dto.name, description: dto.description, isActive: dto.isActive ?? true },
    });
  }

  async updateCategory(id: string, dto: UpdateBookCategoryDto, currentUser: CurrentUser) {
    const cat = await this.findCategoryOrThrow(id);
    this.assertSchoolAccess(currentUser, cat.schoolId);

    if (dto.name && dto.name !== cat.name) {
      const dup = await this.prisma.bookCategory.findUnique({
        where: { schoolId_name: { schoolId: cat.schoolId, name: dto.name } },
      });
      if (dup) throw new BadRequestException('A book category with this name already exists');
    }

    return this.prisma.bookCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async removeCategory(id: string, currentUser: CurrentUser) {
    const cat = await this.findCategoryOrThrow(id);
    this.assertSchoolAccess(currentUser, cat.schoolId);

    const bookCount = await this.prisma.book.count({ where: { categoryId: id } });
    if (bookCount > 0) {
      throw new BadRequestException(
        `Cannot delete category "${cat.name}" — ${bookCount} book(s) are linked. Reassign them first.`,
      );
    }
    return this.prisma.bookCategory.delete({ where: { id } });
  }

  // ─── Books ───────────────────────────────────────────────────────────────────

  async findAllBooks(currentUser: CurrentUser, query: BookQueryDto) {
    const where: Prisma.BookWhereInput = {
      ...this.buildSchoolFilter(currentUser, query.schoolId),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { author: { contains: query.search, mode: 'insensitive' } },
        { isbn: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const { take, skip } = resolvePagination(query);
    const [data, total] = await Promise.all([
      this.prisma.book.findMany({
        where,
        include: bookInclude,
        orderBy: { title: 'asc' },
        take,
        skip,
      }),
      this.prisma.book.count({ where }),
    ]);

    return paginatedResult(data, total, take, skip);
  }

  async findOneBook(id: string, currentUser: CurrentUser) {
    const book = await this.findBookOrThrow(id);
    this.assertSchoolAccess(currentUser, book.schoolId);
    return book;
  }

  async createBook(dto: CreateBookDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);
    await this.assertCategoryBelongsToSchool(dto.categoryId, schoolId);

    const copies = dto.totalCopies ?? 1;

    return this.prisma.book.create({
      data: {
        schoolId,
        categoryId: dto.categoryId,
        title: dto.title,
        author: dto.author,
        isbn: dto.isbn,
        publisher: dto.publisher,
        edition: dto.edition,
        totalCopies: copies,
        availableCopies: copies,
        shelfLocation: dto.shelfLocation,
      },
      include: bookInclude,
    });
  }

  async updateBook(id: string, dto: UpdateBookDto, currentUser: CurrentUser) {
    const book = await this.findBookOrThrow(id);
    this.assertSchoolAccess(currentUser, book.schoolId);

    if (dto.categoryId) {
      await this.assertCategoryBelongsToSchool(dto.categoryId, book.schoolId);
    }

    const newTotal = dto.totalCopies;
    let availableUpdate: number | undefined;

    if (newTotal !== undefined) {
      const issuedCount = book.totalCopies - book.availableCopies;
      availableUpdate = Math.max(newTotal - issuedCount, 0);
    }

    return this.prisma.book.update({
      where: { id },
      data: {
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.author !== undefined ? { author: dto.author } : {}),
        ...(dto.isbn !== undefined ? { isbn: dto.isbn } : {}),
        ...(dto.publisher !== undefined ? { publisher: dto.publisher } : {}),
        ...(dto.edition !== undefined ? { edition: dto.edition } : {}),
        ...(newTotal !== undefined ? { totalCopies: newTotal, availableCopies: availableUpdate } : {}),
        ...(dto.shelfLocation !== undefined ? { shelfLocation: dto.shelfLocation } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: bookInclude,
    });
  }

  async removeBook(id: string, currentUser: CurrentUser) {
    const book = await this.findBookOrThrow(id);
    this.assertSchoolAccess(currentUser, book.schoolId);

    const activeIssues = await this.prisma.bookIssue.count({
      where: { bookId: id, status: 'ISSUED' },
    });
    if (activeIssues > 0) {
      throw new BadRequestException(
        `Cannot delete book "${book.title}" — ${activeIssues} copy/copies are currently issued.`,
      );
    }

    await this.prisma.bookIssue.deleteMany({ where: { bookId: id } });
    return this.prisma.book.delete({ where: { id } });
  }

  // ─── Issues ──────────────────────────────────────────────────────────────────

  async findAllIssues(currentUser: CurrentUser, query: BookQueryDto) {
    const where: Prisma.BookIssueWhereInput = {
      ...this.buildSchoolFilter(currentUser, query.schoolId),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.issueStatus ? { status: query.issueStatus } : {}),
    };

    if (query.search) {
      where.issuedToName = { contains: query.search, mode: 'insensitive' };
    }

    const { take, skip } = resolvePagination(query);
    const [data, total] = await Promise.all([
      this.prisma.bookIssue.findMany({
        where,
        include: issueInclude,
        orderBy: { issueDate: 'desc' },
        take,
        skip,
      }),
      this.prisma.bookIssue.count({ where }),
    ]);

    return paginatedResult(data, total, take, skip);
  }

  async issueBook(dto: IssueBookDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);
    const book = await this.findBookOrThrow(dto.bookId);
    if (book.schoolId !== schoolId) throw new ForbiddenException('Book does not belong to this school');

    if (book.availableCopies < 1) {
      throw new BadRequestException(`No copies of "${book.title}" are currently available`);
    }
    if (book.status !== 'ACTIVE') {
      throw new BadRequestException(`Book "${book.title}" is not available for issue`);
    }

    if (dto.studentId) {
      const active = await this.prisma.bookIssue.findFirst({
        where: { studentId: dto.studentId, status: 'ISSUED' },
      });
      if (active) {
        throw new BadRequestException('This student already has an unreturned book issued');
      }
    }

    const [issue] = await this.prisma.$transaction([
      this.prisma.bookIssue.create({
        data: {
          schoolId,
          bookId: dto.bookId,
          studentId: dto.studentId,
          issuedToName: dto.issuedToName,
          dueDate: new Date(dto.dueDate),
          remarks: dto.remarks,
          issuedById: currentUser.id,
          status: 'ISSUED',
        },
        include: issueInclude,
      }),
      this.prisma.book.update({
        where: { id: dto.bookId },
        data: { availableCopies: { decrement: 1 } },
      }),
    ]);

    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitLibraryBookIssued(schoolId, issue.id),
    );

    return issue;
  }

  async returnBook(issueId: string, dto: ReturnBookDto, currentUser: CurrentUser) {
    const issue = await this.findIssueOrThrow(issueId);
    this.assertSchoolAccess(currentUser, issue.schoolId);

    if (issue.status === 'RETURNED') {
      throw new BadRequestException('This book has already been returned');
    }

    const returnDate = dto.returnDate ? new Date(dto.returnDate) : new Date();
    const isLost = dto.isLost ?? false;
    const newStatus = isLost ? 'LOST' : 'RETURNED';

    const fine = dto.fine ?? this.calculateFine(issue.dueDate, returnDate);

    await this.prisma.$transaction([
      this.prisma.bookIssue.update({
        where: { id: issueId },
        data: {
          returnDate,
          fine,
          finePaid: dto.finePaid ?? false,
          status: newStatus,
        },
      }),
      ...(!isLost
        ? [this.prisma.book.update({
            where: { id: issue.bookId },
            data: { availableCopies: { increment: 1 } },
          })]
        : []),
    ]);

    this.notificationEngine.dispatch(() =>
      this.notificationEngine.emitLibraryBookReturned(issue.schoolId, issueId),
    );

    return this.findIssueOrThrow(issueId);
  }

  async getLibrarySummary(currentUser: CurrentUser, schoolId?: string) {
    const filter = this.buildSchoolFilter(currentUser, schoolId);

    const [totalBooks, totalCategories, issued, overdue, lost] = await Promise.all([
      this.prisma.book.count({ where: filter }),
      this.prisma.bookCategory.count({ where: filter }),
      this.prisma.bookIssue.count({ where: { ...filter, status: 'ISSUED' } }),
      this.prisma.bookIssue.count({
        where: { ...filter, status: 'ISSUED', dueDate: { lt: new Date() } },
      }),
      this.prisma.bookIssue.count({ where: { ...filter, status: 'LOST' } }),
    ]);

    const totalCopies = await this.prisma.book.aggregate({
      where: filter,
      _sum: { totalCopies: true, availableCopies: true },
    });

    return {
      totalBooks,
      totalCategories,
      totalCopies: totalCopies._sum.totalCopies ?? 0,
      availableCopies: totalCopies._sum.availableCopies ?? 0,
      issued,
      overdue,
      lost,
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private calculateFine(dueDate: Date, returnDate: Date, ratePerDay = 5): number {
    const msPerDay = 1000 * 60 * 60 * 24;
    const overdueDays = Math.max(Math.floor((returnDate.getTime() - dueDate.getTime()) / msPerDay), 0);
    return overdueDays * ratePerDay;
  }

  private async findCategoryOrThrow(id: string) {
    const cat = await this.prisma.bookCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Book category not found');
    return cat;
  }

  private async findBookOrThrow(id: string) {
    const book = await this.prisma.book.findUnique({ where: { id }, include: bookInclude });
    if (!book) throw new NotFoundException('Book not found');
    return book;
  }

  private async findIssueOrThrow(id: string) {
    const issue = await this.prisma.bookIssue.findUnique({ where: { id }, include: issueInclude });
    if (!issue) throw new NotFoundException('Book issue record not found');
    return issue;
  }

  private async assertCategoryBelongsToSchool(categoryId: string, schoolId: string) {
    const cat = await this.prisma.bookCategory.findUnique({ where: { id: categoryId } });
    if (!cat) throw new NotFoundException('Book category not found');
    if (cat.schoolId !== schoolId) throw new ForbiddenException('Category does not belong to this school');
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
