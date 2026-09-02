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
import { BookQueryDto } from './dto/book-query.dto';
import { CreateBookCategoryDto } from './dto/create-book-category.dto';
import { CreateBookDto } from './dto/create-book.dto';
import { IssueBookDto } from './dto/issue-book.dto';
import { ReturnBookDto } from './dto/return-book.dto';
import { UpdateBookCategoryDto } from './dto/update-book-category.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { LibraryService } from './library.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('library')
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  // ─── Summary ─────────────────────────────────────────────────────────────────

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Get('summary')
  getSummary(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.libraryService.getLibrarySummary(user, schoolId);
  }

  // ─── Categories ──────────────────────────────────────────────────────────────

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Get('categories')
  findAllCategories(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.libraryService.findAllCategories(user, schoolId);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Post('categories')
  createCategory(
    @Body() dto: CreateBookCategoryDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.libraryService.createCategory(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateBookCategoryDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.libraryService.updateCategory(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete('categories/:id')
  removeCategory(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.libraryService.removeCategory(id, user);
  }

  // ─── Books ───────────────────────────────────────────────────────────────────

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Get('books')
  findAllBooks(@CurrentUserDecorator() user: CurrentUser, @Query() query: BookQueryDto) {
    return this.libraryService.findAllBooks(user, query);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Get('books/:id')
  findOneBook(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.libraryService.findOneBook(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Post('books')
  createBook(@Body() dto: CreateBookDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.libraryService.createBook(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Patch('books/:id')
  updateBook(
    @Param('id') id: string,
    @Body() dto: UpdateBookDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.libraryService.updateBook(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete('books/:id')
  removeBook(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.libraryService.removeBook(id, user);
  }

  // ─── Issues ──────────────────────────────────────────────────────────────────

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Get('issues')
  findAllIssues(@CurrentUserDecorator() user: CurrentUser, @Query() query: BookQueryDto) {
    return this.libraryService.findAllIssues(user, query);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Post('issues')
  issueBook(@Body() dto: IssueBookDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.libraryService.issueBook(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER)
  @Patch('issues/:id/return')
  returnBook(
    @Param('id') id: string,
    @Body() dto: ReturnBookDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.libraryService.returnBook(id, dto, user);
  }
}
