import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import { CreateSchoolDto } from './dto-create-school';
import { UpdateSchoolDto } from './dto-update-school';
import { SchoolsService } from './schools.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('schools')
export class SchoolsController {
  constructor(private readonly schoolsService: SchoolsService) {}

  @Roles(UserRole.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateSchoolDto) {
    return this.schoolsService.create(dto);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Get()
  findAll() {
    return this.schoolsService.findAll();
  }

  /** School admin reads their own school */
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER)
  @Get('mine')
  findMine(@CurrentUserDecorator() user: CurrentUser) {
    if (!user.schoolId) return null;
    return this.schoolsService.findOne(user.schoolId);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.schoolsService.findOne(id);
  }

  /** SUPER_ADMIN updates any school; SCHOOL_ADMIN updates their own */
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSchoolDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    const targetId = user.role === UserRole.SUPER_ADMIN ? id : (user.schoolId ?? id);
    return this.schoolsService.update(targetId, dto);
  }
}
