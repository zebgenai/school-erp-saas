import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TransportController } from './transport.controller';
import { TransportService } from './transport.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [TransportController],
  providers: [TransportService],
})
export class TransportModule {}
