import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { PrismaModule } from '../prisma/prisma.module';
import { parseRedisConnection } from '../whatsapp/redis-connection';
import { ATTENDANCE_WHATSAPP_QUEUE } from '../whatsapp/whatsapp.types';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { WhatsAppWebhookController } from '../whatsapp/whatsapp-webhook.controller';
import { AttendanceWhatsAppProcessor } from './attendance-whatsapp.processor';
import { AttendanceWhatsAppService } from './attendance-whatsapp.service';
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
    ConfigModule,
    WhatsAppModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: parseRedisConnection(config.get<string>('REDIS_URL')),
      }),
    }),
    BullModule.registerQueue({
      name: ATTENDANCE_WHATSAPP_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'custom' },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    }),
  ],
  controllers: [NotificationsController, WhatsAppWebhookController],
  providers: [
    NotificationsService,
    NotificationEngineService,
    NotificationTemplateService,
    NotificationCampaignService,
    NotificationAnalyticsService,
    NotificationSchedulerService,
    AttendanceWhatsAppService,
    AttendanceWhatsAppProcessor,
    EmailChannelProvider,
    SmsChannelProvider,
    WhatsAppChannelProvider,
    PushChannelProvider,
    NotificationChannelRegistry,
  ],
  exports: [
    NotificationsService,
    NotificationEngineService,
    NotificationTemplateService,
    AttendanceWhatsAppService,
  ],
})
export class NotificationsModule {}
