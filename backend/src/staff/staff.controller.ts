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
import { CreateStaffDto } from './dto/create-staff.dto';
import { StaffQueryDto } from './dto/staff-query.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { StaffService } from './staff.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT)
  @Get()
  findAll(@CurrentUserDecorator() user: CurrentUser, @Query() query: StaffQueryDto) {
    return this.staffService.findAll(user, query);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.staffService.findOne(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Post()
  create(@Body() dto: CreateStaffDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.staffService.create(dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.staffService.update(id, dto, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.staffService.remove(id, user);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete(':id/permanent')
  permanentDelete(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.staffService.permanentDelete(id, user);
  }
}
