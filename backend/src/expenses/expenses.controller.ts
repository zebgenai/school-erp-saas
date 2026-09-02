import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpensesService } from './expenses.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  // ─── Categories ──────────────────────────────────────────────────────────────

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT)
  @Get('categories')
  findAllCategories(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
    @Query('isActive') isActive?: string,
  ) {
    const active = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.expensesService.findAllCategories(user, schoolId, active);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT)
  @Get('categories/:id')
  findOneCategory(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.expensesService.findOneCategory(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Post('categories')
  createCategory(
    @Body() dto: CreateExpenseCategoryDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.expensesService.createCategory(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseCategoryDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.expensesService.updateCategory(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete('categories/:id')
  removeCategory(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.expensesService.removeCategory(id, user);
  }

  // ─── Expenses ────────────────────────────────────────────────────────────────

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT)
  @Get('report')
  getReport(@CurrentUserDecorator() user: CurrentUser, @Query() query: ExpenseQueryDto) {
    return this.expensesService.getReport(user, query);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT)
  @Get()
  findAll(@CurrentUserDecorator() user: CurrentUser, @Query() query: ExpenseQueryDto) {
    return this.expensesService.findAll(user, query);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.expensesService.findOne(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT)
  @Post()
  create(@Body() dto: CreateExpenseDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.expensesService.create(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.expensesService.update(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.expensesService.remove(id, user);
  }
}
