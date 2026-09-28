import { Module } from '@nestjs/common';
import { FeaturesModule } from '../features/features.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TransportController } from './transport.controller';
import { TransportService } from './transport.service';

@Module({
  imports: [PrismaModule, NotificationsModule, FeaturesModule],
  controllers: [TransportController],
  providers: [TransportService],
})
export class TransportModule {}
