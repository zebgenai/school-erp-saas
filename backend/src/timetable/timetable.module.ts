import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TimetableController } from './timetable.controller';
import { TimetableService } from './timetable.service';

@Module({
  imports: [PrismaModule],
  controllers: [TimetableController],
  providers: [TimetableService],
})
export class TimetableModule {}
