import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditAction, UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import { AuditLogsService } from './audit-logs.service';
import { SchoolAuditService } from './school-audit.service';

class AuditQueryDto {
  @IsOptional() @IsString() schoolId?: string;
  @IsOptional() @IsEnum(AuditAction) action?: AuditAction;
  @IsOptional() @IsString() actionFilter?: string;
  @IsOptional() @IsString() entity?: string;
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(
    private readonly auditLogsService: AuditLogsService,
    private readonly schoolAuditService: SchoolAuditService,
  ) {}

  @Roles(UserRole.SUPER_ADMIN, UserRole.PLATFORM_MANAGER)
  @Get()
  findAll(@Query() query: AuditQueryDto) {
    return this.auditLogsService.findAll({
      schoolId: query.schoolId,
      action: query.action,
      limit: query.limit,
      skip: query.skip,
    });
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @Get('school')
  findSchoolLogs(@Query() query: AuditQueryDto, @CurrentUserDecorator() user: CurrentUser) {
    const schoolId =
      user.role === UserRole.SUPER_ADMIN ? (query.schoolId ?? '') : (user.schoolId ?? '');
    return this.schoolAuditService.findBySchool(schoolId, {
      limit: query.limit,
      skip: query.skip,
      action: query.actionFilter,
      entity: query.entity,
      entityId: query.entityId,
      userId: query.userId,
      search: query.search,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
  }
}
