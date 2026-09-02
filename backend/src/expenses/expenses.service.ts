import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { resolvePagination } from '../common/dto/pagination-query.dto';
import { paginatedResult } from '../common/utils/paginated-result';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

const expenseInclude = { category: true } satisfies Prisma.ExpenseInclude;

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  // ─── Categories ──────────────────────────────────────────────────────────────

  async findAllCategories(currentUser: CurrentUser, schoolId?: string, isActive?: boolean) {
    return this.prisma.expenseCategory.findMany({
      where: {
        ...this.buildSchoolFilter(currentUser, schoolId),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOneCategory(id: string, currentUser: CurrentUser) {
    const category = await this.findCategoryOrThrow(id);
    this.assertSchoolAccess(currentUser, category.schoolId);
    return category;
  }

  async createCategory(dto: CreateExpenseCategoryDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);

    const duplicate = await this.prisma.expenseCategory.findUnique({
      where: { schoolId_name: { schoolId, name: dto.name } },
    });
    if (duplicate) {
      throw new BadRequestException('An expense category with this name already exists');
    }

    return this.prisma.expenseCategory.create({
      data: { schoolId, name: dto.name, description: dto.description },
    });
  }

  async updateCategory(id: string, dto: UpdateExpenseCategoryDto, currentUser: CurrentUser) {
    const category = await this.findCategoryOrThrow(id);
    this.assertSchoolAccess(currentUser, category.schoolId);

    if (dto.name && dto.name !== category.name) {
      const duplicate = await this.prisma.expenseCategory.findUnique({
        where: { schoolId_name: { schoolId: category.schoolId, name: dto.name } },
      });
      if (duplicate) {
        throw new BadRequestException('An expense category with this name already exists');
      }
    }

    return this.prisma.expenseCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async removeCategory(id: string, currentUser: CurrentUser) {
    const category = await this.findCategoryOrThrow(id);
    this.assertSchoolAccess(currentUser, category.schoolId);

    const expenseCount = await this.prisma.expense.count({ where: { categoryId: id } });
    if (expenseCount > 0) {
      throw new BadRequestException(
        `Cannot delete category "${category.name}" — ${expenseCount} expense(s) are linked. Deactivate it instead.`,
      );
    }

    return this.prisma.expenseCategory.delete({ where: { id } });
  }

  // ─── Expenses ────────────────────────────────────────────────────────────────

  async findAll(currentUser: CurrentUser, query: ExpenseQueryDto) {
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);
    const dateFilter = this.buildDateFilter(query);

    const where: Prisma.ExpenseWhereInput = {
      ...schoolFilter,
      ...dateFilter,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const { take, skip } = resolvePagination(query);
    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: expenseInclude,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take,
        skip,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return paginatedResult(data, total, take, skip);
  }

  async findOne(id: string, currentUser: CurrentUser) {
    const expense = await this.findExpenseOrThrow(id);
    this.assertSchoolAccess(currentUser, expense.schoolId);
    return expense;
  }

  async create(dto: CreateExpenseDto, currentUser: CurrentUser) {
    const schoolId = this.resolveSchoolId(currentUser, dto.schoolId);
    await this.assertCategoryBelongsToSchool(dto.categoryId, schoolId);

    return this.prisma.expense.create({
      data: {
        schoolId,
        categoryId: dto.categoryId,
        title: dto.title,
        amount: dto.amount,
        date: new Date(dto.date),
        description: dto.description,
        receiptUrl: dto.receiptUrl,
      },
      include: expenseInclude,
    });
  }

  async update(id: string, dto: UpdateExpenseDto, currentUser: CurrentUser) {
    const expense = await this.findExpenseOrThrow(id);
    this.assertSchoolAccess(currentUser, expense.schoolId);

    if (dto.categoryId) {
      await this.assertCategoryBelongsToSchool(dto.categoryId, expense.schoolId);
    }

    return this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.receiptUrl !== undefined ? { receiptUrl: dto.receiptUrl } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: expenseInclude,
    });
  }

  async remove(id: string, currentUser: CurrentUser) {
    const expense = await this.findExpenseOrThrow(id);
    this.assertSchoolAccess(currentUser, expense.schoolId);
    return this.prisma.expense.delete({ where: { id } });
  }

  async getReport(currentUser: CurrentUser, query: ExpenseQueryDto) {
    const schoolFilter = this.buildSchoolFilter(currentUser, query.schoolId);
    const dateFilter = this.buildDateFilter(query);

    const where: Prisma.ExpenseWhereInput = {
      ...schoolFilter,
      ...dateFilter,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      status: { not: 'CANCELLED' },
    };

    const [expenses, aggregate] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: expenseInclude,
        orderBy: [{ date: 'desc' }],
      }),
      this.prisma.expense.aggregate({
        where,
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    const byCategory = await this.prisma.expense.groupBy({
      by: ['categoryId'],
      where,
      _sum: { amount: true },
      _count: { id: true },
    });

    const categories = await this.prisma.expenseCategory.findMany({
      where: { id: { in: byCategory.map((g) => g.categoryId) } },
      select: { id: true, name: true },
    });

    const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

    return {
      summary: {
        totalAmount: aggregate._sum.amount ?? 0,
        totalCount: aggregate._count.id,
      },
      byCategory: byCategory.map((g) => ({
        categoryId: g.categoryId,
        categoryName: categoryMap[g.categoryId] ?? 'Unknown',
        totalAmount: g._sum.amount ?? 0,
        count: g._count.id,
      })),
      expenses,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private buildDateFilter(query: ExpenseQueryDto): Prisma.ExpenseWhereInput {
    if (query.startDate || query.endDate) {
      return {
        date: {
          ...(query.startDate ? { gte: new Date(`${query.startDate}T00:00:00.000Z`) } : {}),
          ...(query.endDate ? { lte: new Date(`${query.endDate}T23:59:59.999Z`) } : {}),
        },
      };
    }

    if (query.month && query.year) {
      const start = new Date(Date.UTC(query.year, query.month - 1, 1));
      const end = new Date(Date.UTC(query.year, query.month, 0, 23, 59, 59, 999));
      return { date: { gte: start, lte: end } };
    }

    return {};
  }

  private async findCategoryOrThrow(id: string) {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Expense category not found');
    return category;
  }

  private async findExpenseOrThrow(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: expenseInclude,
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  private async assertCategoryBelongsToSchool(categoryId: string, schoolId: string) {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Expense category not found');
    if (category.schoolId !== schoolId) {
      throw new BadRequestException('Category does not belong to the specified school');
    }
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
