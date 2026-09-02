import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
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

@ApiTags('Activity')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @ApiOperation({ summary: 'Recent activity for dashboard widget' })
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
