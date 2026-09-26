import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import { ActivityService } from './activity.service';

class RecentActivityQueryDto {
  @IsOptional()
  @IsEnum(['today', 'week', 'month'])
  period?: 'today' | 'week' | 'month';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  schoolId?: string;
}

/** Dashboard / timeline roles — excludes ATTENDANCE_SCANNER and portal-only roles. */
const ACTIVITY_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.PLATFORM_MANAGER,
  UserRole.SCHOOL_ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.TEACHER,
  UserRole.RECEPTIONIST,
] as const;

@ApiTags('Activity')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @ApiOperation({ summary: 'Recent activity for dashboard widget' })
  @Roles(...ACTIVITY_ROLES)
  @Get('recent')
  recent(@CurrentUserDecorator() user: CurrentUser, @Query() query: RecentActivityQueryDto) {
    return this.activity.getRecent(
      user,
      query.period ?? 'week',
      query.limit ?? 20,
      query.schoolId,
    );
  }

  @ApiOperation({ summary: 'Entity activity timeline' })
  @Roles(...ACTIVITY_ROLES)
  @Get('timeline/:entity/:entityId')
  timeline(
    @CurrentUserDecorator() user: CurrentUser,
    @Param('entity') entity: string,
    @Param('entityId') entityId: string,
    @Query('schoolId') schoolId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.activity.getTimeline(
      user,
      entity,
      entityId,
      schoolId,
      limit ? parseInt(limit, 10) : 50,
    );
  }
}
