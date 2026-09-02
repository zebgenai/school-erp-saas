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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CampaignAudience,
  CampaignStatus,
  NotificationCategory,
  NotificationChannel,
  PushPlatform,
  RecurrenceType,
  UserRole,
} from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import { NotificationAnalyticsService } from './notification-analytics.service';
import { NotificationCampaignService } from './notification-campaign.service';
import { NotificationTemplateService } from './notification-template.service';
import { NotificationsService } from './notifications.service';

const ADMIN_ROLES = [UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN] as const;

class PreferenceItemDto {
  @IsEnum(NotificationCategory)
  category!: NotificationCategory;

  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  smsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;
}

class UpdatePreferencesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreferenceItemDto)
  preferences!: PreferenceItemDto[];
}

class CreateTemplateDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsEnum(NotificationCategory)
  category!: NotificationCategory;

  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;
}

class ComposeDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  templateCode?: string;

  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels!: NotificationChannel[];

  @IsEnum(CampaignAudience)
  audienceType!: CampaignAudience;

  @IsOptional()
  @IsObject()
  audienceFilter?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  templateVars?: Record<string, string | number>;

  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @IsOptional()
  @IsEnum(RecurrenceType)
  recurrence?: RecurrenceType;

  @IsOptional()
  @IsBoolean()
  sendNow?: boolean;

  @IsOptional()
  @IsBoolean()
  retryFailed?: boolean;
}

class PushTokenDto {
  @IsString()
  token!: string;

  @IsOptional()
  @IsEnum(PushPlatform)
  platform?: PushPlatform;
}

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly templates: NotificationTemplateService,
    private readonly campaigns: NotificationCampaignService,
    private readonly analytics: NotificationAnalyticsService,
  ) {}

  // ── Inbox ─────────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'List in-app notifications for current user (paginated)' })
  @Get()
  list(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('category') category?: NotificationCategory,
    @Query('isRead') isRead?: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('archived') archived?: string,
    @Query('search') search?: string,
  ) {
    return this.notifications.listForUser(user.id, {
      limit: limit ? parseInt(limit, 10) : 30,
      offset: offset ? parseInt(offset, 10) : 0,
      category,
      isRead: isRead === undefined ? undefined : isRead === 'true',
      unreadOnly: unreadOnly === 'true',
      archived: archived === 'true',
      search,
    });
  }

  @ApiOperation({ summary: 'Unread notification count' })
  @Get('unread-count')
  unreadCount(@CurrentUserDecorator() user: CurrentUser) {
    return this.notifications.getUnreadCount(user.id).then((count) => ({ count }));
  }

  @ApiOperation({ summary: 'Get notification preferences for current user' })
  @Get('preferences')
  getPreferences(@CurrentUserDecorator() user: CurrentUser) {
    return this.notifications.getPreferences(user.id);
  }

  @ApiOperation({ summary: 'Update notification preferences for current user' })
  @Put('preferences')
  updatePreferences(
    @CurrentUserDecorator() user: CurrentUser,
    @Body() body: UpdatePreferencesDto,
  ) {
    return this.notifications.updatePreferences(user.id, body.preferences);
  }

  @ApiOperation({ summary: 'Mark all notifications as read' })
  @Patch('read-all')
  markAllRead(@CurrentUserDecorator() user: CurrentUser) {
    return this.notifications.markAllRead(user.id);
  }

  // ── Push tokens (future-ready) ────────────────────────────────────────────

  @ApiOperation({ summary: 'Register a push device token' })
  @Post('push-tokens')
  registerPush(@CurrentUserDecorator() user: CurrentUser, @Body() body: PushTokenDto) {
    return this.notifications.registerPushToken(user.id, body.token, body.platform ?? 'WEB');
  }

  @ApiOperation({ summary: 'Unregister a push device token' })
  @Delete('push-tokens')
  unregisterPush(@CurrentUserDecorator() user: CurrentUser, @Body() body: PushTokenDto) {
    return this.notifications.unregisterPushToken(user.id, body.token);
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'List notification templates' })
  @Roles(...ADMIN_ROLES)
  @Get('templates')
  listTemplates(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('category') category?: NotificationCategory,
    @Query('channel') channel?: NotificationChannel,
  ) {
    return this.templates.list(user, { category, channel });
  }

  @ApiOperation({ summary: 'Template placeholder keys' })
  @Roles(...ADMIN_ROLES)
  @Get('templates/placeholders')
  placeholders() {
    return { placeholders: this.templates.placeholders() };
  }

  @ApiOperation({ summary: 'Create notification template' })
  @Roles(...ADMIN_ROLES)
  @Post('templates')
  createTemplate(@CurrentUserDecorator() user: CurrentUser, @Body() body: CreateTemplateDto) {
    return this.templates.create(user, body);
  }

  @ApiOperation({ summary: 'Update notification template' })
  @Roles(...ADMIN_ROLES)
  @Put('templates/:id')
  updateTemplate(
    @Param('id') id: string,
    @CurrentUserDecorator() user: CurrentUser,
    @Body() body: UpdateTemplateDto,
  ) {
    return this.templates.update(id, user, body);
  }

  @ApiOperation({ summary: 'Delete notification template' })
  @Roles(...ADMIN_ROLES)
  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.templates.remove(id, user);
  }

  // ── Compose / campaigns ───────────────────────────────────────────────────

  @ApiOperation({ summary: 'Compose / schedule a notification campaign' })
  @Roles(...ADMIN_ROLES)
  @Post('compose')
  compose(@CurrentUserDecorator() user: CurrentUser, @Body() body: ComposeDto) {
    return this.campaigns.compose(user, body as any);
  }

  @ApiOperation({ summary: 'List notification campaigns' })
  @Roles(...ADMIN_ROLES)
  @Get('campaigns')
  listCampaigns(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: CampaignStatus,
  ) {
    return this.campaigns.list(user, {
      limit: limit ? parseInt(limit, 10) : 30,
      offset: offset ? parseInt(offset, 10) : 0,
      status,
    });
  }

  @ApiOperation({ summary: 'Cancel a scheduled campaign' })
  @Roles(...ADMIN_ROLES)
  @Patch('campaigns/:id/cancel')
  cancelCampaign(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.campaigns.cancel(id, user);
  }

  @ApiOperation({ summary: 'Retry failed deliveries for a campaign' })
  @Roles(...ADMIN_ROLES)
  @Post('campaigns/:id/retry')
  retryCampaign(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.campaigns.retryFailed(id, user);
  }

  // ── Analytics / widgets ───────────────────────────────────────────────────

  @ApiOperation({ summary: 'Dashboard notification widgets' })
  @Roles(...ADMIN_ROLES)
  @Get('stats/widgets')
  widgets(@CurrentUserDecorator() user: CurrentUser) {
    return this.analytics.dashboardWidgets(user);
  }

  @ApiOperation({ summary: 'Notification analytics report' })
  @Roles(...ADMIN_ROLES)
  @Get('stats/analytics')
  analyticsReport(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('days') days?: string,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.analytics.analytics(user, {
      days: days ? parseInt(days, 10) : 30,
      schoolId,
    });
  }

  @ApiOperation({ summary: 'Platform-wide notification usage (Super Admin)' })
  @Roles(UserRole.SUPER_ADMIN)
  @Get('stats/platform')
  platformStats() {
    return this.analytics.platformStats();
  }

  @ApiOperation({ summary: 'Outbound channel configuration status' })
  @Roles(...ADMIN_ROLES)
  @Get('channels/status')
  channelStatus() {
    return this.notifications.channelStatus();
  }

  // ── Delivery history ──────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Notification delivery audit log' })
  @Roles(...ADMIN_ROLES)
  @Get('logs/audit')
  auditLogs(
    @CurrentUserDecorator() user: CurrentUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
    @Query('channel') channel?: NotificationChannel,
    @Query('schoolId') schoolId?: string,
  ) {
    const resolvedSchoolId =
      user.role === UserRole.SUPER_ADMIN ? (schoolId ?? user.schoolId ?? null) : user.schoolId ?? null;

    if (!resolvedSchoolId && user.role !== UserRole.SUPER_ADMIN) {
      return { items: [], total: 0 };
    }

    return this.notifications.listLogs(
      resolvedSchoolId,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
      { status, channel },
    );
  }

  // ── Inbox item actions (parameterized — must be last) ─────────────────────

  @ApiOperation({ summary: 'Mark a notification as read' })
  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.notifications.markRead(user.id, id);
  }

  @ApiOperation({ summary: 'Archive a notification' })
  @Patch(':id/archive')
  archive(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.notifications.archive(user.id, id);
  }

  @ApiOperation({ summary: 'Unarchive a notification' })
  @Patch(':id/unarchive')
  unarchive(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.notifications.unarchive(user.id, id);
  }

  @ApiOperation({ summary: 'Delete a notification' })
  @Delete(':id')
  deleteNotification(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.notifications.deleteNotification(user.id, id);
  }
}
