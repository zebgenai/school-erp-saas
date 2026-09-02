import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';

@Module({
  imports: [AuthModule, AuditLogsModule, NotificationsModule],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
})
export class SuperAdminModule {}
