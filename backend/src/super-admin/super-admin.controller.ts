import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole, SubscriptionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  MinLength,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import { IsStrongPassword } from '../common/validators/password.validator';
import { SuperAdminService } from './super-admin.service';

class SchoolsQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number;
}

class AssignPlanDto {
  @IsString() planId: string;
  @IsOptional() @IsISO8601() endDate?: string;
  @IsOptional() @IsEnum(SubscriptionStatus) status?: SubscriptionStatus;
}

class ExtendDto {
  @Type(() => Number) @IsInt() @Min(1) days: number;
}

class SuspendDto {
  @IsOptional() @IsString() reason?: string;
}

class CreateInvoiceDto {
  @IsString() schoolId: string;
  @Type(() => Number) @IsNumber() @Min(0) amount: number;
  @IsString() period: string;
  @IsISO8601() dueDate: string;
  @IsOptional() @IsString() notes?: string;
}

class UpdateSchoolDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() ownerName?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() code?: string;
}

class CreateSchoolDto {
  @IsString() name: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsString() adminName: string;
  @IsEmail() adminEmail: string;
  @IsString() @MinLength(6) adminPassword: string;
}

class CreateUserDto {
  @IsString() name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsEnum(UserRole) role: UserRole;
}

class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
}

class ResetPasswordDto {
  @IsString() @MinLength(6) newPassword: string;
  @IsOptional() @IsBoolean() forceChange?: boolean;
}

class ChangeRoleDto {
  @IsEnum(UserRole) role: UserRole;
}

class UserStatusDto {
  @IsEnum(['ACTIVATE', 'DEACTIVATE', 'UNLOCK', 'LOCK']) action: 'ACTIVATE' | 'DEACTIVATE' | 'UNLOCK' | 'LOCK';
}

class ChangeAdminDto {
  @IsString() newAdminUserId: string;
}

class UsersQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number;
}

class RolesOverviewQueryDto {
  @IsOptional() @IsString() search?: string;
}

class CreateCustomRoleDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() description?: string;
  @IsEnum(UserRole) baseRole: UserRole;
  @IsOptional() @IsObject() permissions?: Record<string, boolean>;
}

class UpdateCustomRoleDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(UserRole) baseRole?: UserRole;
  @IsOptional() @IsObject() permissions?: Record<string, boolean>;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class UpdateSystemRolePermissionsDto {
  @IsObject() permissions: Record<string, boolean>;
}

class PlatformUsersQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() status?: string;
}

class CreatePlatformUserDto {
  @IsString() @MinLength(2) name: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() phone?: string;
  @IsString() @IsStrongPassword() password: string;
  @IsIn([UserRole.SUPER_ADMIN, UserRole.PLATFORM_MANAGER]) role: UserRole;
}

class UpdatePlatformUserDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_MANAGER)
@Controller('super-admin')
export class SuperAdminController {
  constructor(private readonly service: SuperAdminService) {}

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  @Get('dashboard')
  getDashboard() {
    return this.service.getDashboard();
  }

  @Get('revenue-chart')
  getRevenueChart() {
    return this.service.getRevenueChart();
  }

  @Get('school-growth')
  getSchoolGrowth() {
    return this.service.getSchoolGrowth();
  }

  // ─── Schools ───────────────────────────────────────────────────────────────
  @Get('schools')
  getSchools(@Query() query: SchoolsQueryDto) {
    return this.service.getSchools(query);
  }

  @Post('schools')
  createSchool(@Body() dto: CreateSchoolDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.service.createSchoolWithAdmin(dto, user);
  }

  @Get('schools/:id')
  getSchoolById(@Param('id') id: string) {
    return this.service.getSchoolById(id);
  }

  @Patch('schools/:id')
  updateSchool(
    @Param('id') id: string,
    @Body() dto: UpdateSchoolDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.updateSchool(id, dto, user);
  }

  @Delete('schools/:id')
  @Roles(UserRole.SUPER_ADMIN)
  deleteSchool(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.service.deleteSchool(id, user);
  }

  @Patch('schools/:id/change-admin')
  changeAdmin(
    @Param('id') id: string,
    @Body() dto: ChangeAdminDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.changeSchoolAdmin(id, dto.newAdminUserId, user);
  }

  // ─── School Users ───────────────────────────────────────────────────────────
  @Get('schools/:schoolId/users')
  getSchoolUsers(@Param('schoolId') schoolId: string, @Query() query: UsersQueryDto) {
    return this.service.getSchoolUsers(schoolId, query);
  }

  @Post('schools/:schoolId/users')
  createSchoolUser(
    @Param('schoolId') schoolId: string,
    @Body() dto: CreateUserDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.createSchoolUser(schoolId, dto, user);
  }

  // ─── User Management ────────────────────────────────────────────────────────
  @Patch('users/:id')
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.updateSchoolUser(id, dto, user);
  }

  @Patch('users/:id/reset-password')
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.resetUserPassword(id, dto.newPassword, dto.forceChange ?? false, user);
  }

  @Patch('users/:id/change-role')
  changeUserRole(
    @Param('id') id: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.changeUserRole(id, dto.role, user);
  }

  @Patch('users/:id/status')
  updateUserStatus(
    @Param('id') id: string,
    @Body() dto: UserStatusDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.updateUserStatus(id, dto.action, user);
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.service.deleteUser(id, user);
  }

  @Patch('schools/:id/activate')
  activate(
    @Param('id') id: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.activateSchool(id, user);
  }

  @Patch('schools/:id/suspend')
  suspend(
    @Param('id') id: string,
    @Body() dto: SuspendDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.suspendSchool(id, dto.reason, user);
  }

  @Post('schools/:id/assign-plan')
  assignPlan(
    @Param('id') id: string,
    @Body() dto: AssignPlanDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.assignPlan(id, dto.planId, { endDate: dto.endDate, status: dto.status }, user);
  }

  @Post('schools/:id/extend')
  extend(
    @Param('id') id: string,
    @Body() dto: ExtendDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.extendSubscription(id, dto.days, user);
  }

  @Post('schools/:id/impersonate')
  @Roles(UserRole.SUPER_ADMIN)
  impersonate(
    @Param('id') id: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.impersonate(id, user);
  }

  // ─── Role Management ───────────────────────────────────────────────────────
  @Get('roles/overview')
  getRolesOverview(@Query() query: RolesOverviewQueryDto) {
    return this.service.getRolesOverview(query);
  }

  @Get('schools/:schoolId/roles')
  getSchoolRoles(@Param('schoolId') schoolId: string) {
    return this.service.getSchoolRoles(schoolId);
  }

  @Post('schools/:schoolId/roles')
  createSchoolRole(
    @Param('schoolId') schoolId: string,
    @Body() dto: CreateCustomRoleDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.createCustomRole(schoolId, dto, user);
  }

  @Patch('schools/:schoolId/roles/:roleId')
  updateSchoolRole(
    @Param('schoolId') schoolId: string,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateCustomRoleDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.updateCustomRole(schoolId, roleId, dto, user);
  }

  @Delete('schools/:schoolId/roles/:roleId')
  deleteSchoolRole(
    @Param('schoolId') schoolId: string,
    @Param('roleId') roleId: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.deleteCustomRole(schoolId, roleId, user);
  }

  @Put('schools/:schoolId/system-roles/:role/permissions')
  updateSystemRolePermissions(
    @Param('schoolId') schoolId: string,
    @Param('role') role: string,
    @Body() dto: UpdateSystemRolePermissionsDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.updateSystemRolePermissions(schoolId, role as UserRole, dto.permissions, user);
  }

  @Delete('schools/:schoolId/system-roles/:role/permissions')
  resetSystemRolePermissions(
    @Param('schoolId') schoolId: string,
    @Param('role') role: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.resetSystemRolePermissions(schoolId, role as UserRole, user);
  }

  @Delete('schools/:schoolId/system-roles/:role')
  removeSystemRole(
    @Param('schoolId') schoolId: string,
    @Param('role') role: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.removeSystemRole(schoolId, role as UserRole, user);
  }

  @Post('schools/:schoolId/system-roles/:role/restore')
  restoreSystemRole(
    @Param('schoolId') schoolId: string,
    @Param('role') role: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.restoreSystemRole(schoolId, role as UserRole, user);
  }

  // ─── Platform Team ─────────────────────────────────────────────────────────
  @Get('platform-users')
  @Roles(UserRole.SUPER_ADMIN)
  getPlatformUsers(@Query() query: PlatformUsersQueryDto) {
    return this.service.getPlatformUsers(query);
  }

  @Post('platform-users')
  @Roles(UserRole.SUPER_ADMIN)
  createPlatformUser(@Body() dto: CreatePlatformUserDto, @CurrentUserDecorator() user: CurrentUser) {
    return this.service.createPlatformUser(dto, user);
  }

  @Patch('platform-users/:id')
  @Roles(UserRole.SUPER_ADMIN)
  updatePlatformUser(
    @Param('id') id: string,
    @Body() dto: UpdatePlatformUserDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.updatePlatformUser(id, dto, user);
  }

  @Patch('platform-users/:id/change-role')
  @Roles(UserRole.SUPER_ADMIN)
  changePlatformUserRole(
    @Param('id') id: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.service.changePlatformUserRole(id, dto.role, user);
  }

  @Delete('platform-users/:id')
  @Roles(UserRole.SUPER_ADMIN)
  deletePlatformUser(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.service.deletePlatformUser(id, user);
  }

  // ─── Billing ───────────────────────────────────────────────────────────────
  @Get('billing')
  getBilling(
    @Query('schoolId') schoolId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getBilling({ schoolId, status, limit: limit ? +limit : undefined });
  }

  @Post('billing/invoices')
  createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.service.createInvoice(dto);
  }

  @Patch('billing/invoices/:id/mark-paid')
  markInvoicePaid(@Param('id') id: string) {
    return this.service.markInvoicePaid(id);
  }
}
