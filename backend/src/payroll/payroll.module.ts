import { Module } from '@nestjs/common';
import { FeaturesModule } from '../features/features.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

@Module({
  imports: [NotificationsModule, FeaturesModule],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
