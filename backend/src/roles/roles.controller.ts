import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { RolesService } from './roles.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /** List all roles with metadata */
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER, UserRole.RECEPTIONIST)
  @Get()
  listRoles(@CurrentUserDecorator() user: CurrentUser) {
    return this.rolesService.listRoles(user);
  }

  /** Full permission matrix for the school */
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER, UserRole.RECEPTIONIST)
  @Get('matrix')
  getMatrix(@CurrentUserDecorator() user: CurrentUser, @Query('schoolId') schoolId?: string) {
    // Super admin can pass a schoolId override via query
    if (user.role === UserRole.SUPER_ADMIN && schoolId) {
      return this.rolesService.getMatrix({ ...user, schoolId });
    }
    return this.rolesService.getMatrix(user);
  }

  /** Get permissions for a single role */
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT, UserRole.TEACHER, UserRole.RECEPTIONIST)
  @Get(':role')
  getRolePermissions(@Param('role') role: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.rolesService.getRolePermissions(role as UserRole, user);
  }

  /** Update permissions for a role */
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Put(':role/permissions')
  updatePermissions(
    @Param('role') role: string,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.rolesService.updateRolePermissions(role as UserRole, dto.permissions, user);
  }

  /** Reset permissions to system defaults */
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Delete(':role/permissions')
  resetPermissions(@Param('role') role: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.rolesService.resetRolePermissions(role as UserRole, user);
  }
}
