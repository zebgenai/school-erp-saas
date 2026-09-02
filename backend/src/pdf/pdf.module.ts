import { Module } from '@nestjs/common';
import { ExamsModule } from '../exams/exams.module';
import { FeesModule } from '../fees/fees.module';
import { PayrollModule } from '../payroll/payroll.module';
import { ReportsModule } from '../reports/reports.module';
import { StudentsModule } from '../students/students.module';
import { PdfController } from './pdf.controller';
import { PdfService } from './pdf.service';

@Module({
  imports: [FeesModule, StudentsModule, ExamsModule, PayrollModule, ReportsModule],
  controllers: [PdfController],
  providers: [PdfService],
  exports: [PdfService],
})
export class PdfModule {}
