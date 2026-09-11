import { Module } from '@nestjs/common';
import { PublicSchoolsController } from './public-schools.controller';
import { SchoolsController } from './schools.controller';
import { SchoolsService } from './schools.service';

@Module({
  controllers: [PublicSchoolsController, SchoolsController],
  providers: [SchoolsService],
  exports: [SchoolsService],
})
export class SchoolsModule {}
