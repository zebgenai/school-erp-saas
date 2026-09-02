import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationAnalyticsService } from './notification-analytics.service';
import { NotificationCampaignService } from './notification-campaign.service';
import { NotificationEngineService } from './notification-engine.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { NotificationTemplateService } from './notification-template.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import {
  EmailChannelProvider,
  NotificationChannelRegistry,
  PushChannelProvider,
  SmsChannelProvider,
  WhatsAppChannelProvider,
} from './providers/notification-channel.provider';

@Module({
  imports: [
    PrismaModule,
    PlatformSettingsModule,
    AuditLogsModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationEngineService,
    NotificationTemplateService,
    NotificationCampaignService,
    NotificationAnalyticsService,
    NotificationSchedulerService,
    EmailChannelProvider,
    SmsChannelProvider,
    WhatsAppChannelProvider,
    PushChannelProvider,
    NotificationChannelRegistry,
  ],
  exports: [NotificationsService, NotificationEngineService, NotificationTemplateService],
})
export class NotificationsModule {}
