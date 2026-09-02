import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [LibraryController],
  providers: [LibraryService],
})
export class LibraryModule {}
