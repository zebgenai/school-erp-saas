import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [NotificationsModule],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
