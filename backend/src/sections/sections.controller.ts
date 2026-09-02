import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { SectionsService } from './sections.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sections')
export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) {}

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER, UserRole.ACCOUNTANT, UserRole.RECEPTIONIST)
  @Get()
  findAll(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('schoolId') schoolId?: string,
    @Query('classId') classId?: string,
  ) {
    return this.sectionsService.findAll(user, schoolId, classId);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Post()
  create(@Body() dto: CreateSectionDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.sectionsService.create(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSectionDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.sectionsService.update(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.sectionsService.remove(id, user);
  }
}
