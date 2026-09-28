import { Module } from '@nestjs/common';
import { FeaturesModule } from '../features/features.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TimetableController } from './timetable.controller';
import { TimetableService } from './timetable.service';

@Module({
  imports: [PrismaModule, FeaturesModule],
  controllers: [TimetableController],
  providers: [TimetableService],
})
export class TimetableModule {}
