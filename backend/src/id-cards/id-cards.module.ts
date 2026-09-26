import { Module } from '@nestjs/common';
import { IdCardsController } from './id-cards.controller';
import { IdCardsService } from './id-cards.service';
import { TeacherIdCardsService } from './teacher-id-cards.service';

@Module({
  controllers: [IdCardsController],
  providers: [IdCardsService, TeacherIdCardsService],
  exports: [IdCardsService, TeacherIdCardsService],
})
export class IdCardsModule {}
