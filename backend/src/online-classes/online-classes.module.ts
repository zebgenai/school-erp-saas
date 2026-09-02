import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OnlineClassesController } from './online-classes.controller';
import { OnlineClassesService } from './online-classes.service';
import { MeetingProviderRegistry } from './providers/meeting-provider.registry';

@Module({
  imports: [PrismaModule, NotificationsModule, AuditLogsModule],
  controllers: [OnlineClassesController],
  providers: [OnlineClassesService, MeetingProviderRegistry],
  exports: [OnlineClassesService, MeetingProviderRegistry],
})
export class OnlineClassesModule {}
