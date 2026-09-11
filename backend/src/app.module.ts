import { ExecutionContext, Injectable, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import * as path from 'node:path';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ActivityModule } from './activity/activity.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RolesModule } from './roles/roles.module';
import { UploadsModule } from './uploads/uploads.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AuthModule } from './auth/auth.module';
import { ClassesModule } from './classes/classes.module';
import { CommunicationModule } from './communication/communication.module';
import { ExamsModule } from './exams/exams.module';
import { ExpensesModule } from './expenses/expenses.module';
import { FeesModule } from './fees/fees.module';
import { HealthModule } from './health/health.module';
import { LibraryModule } from './library/library.module';
import { ParentsModule } from './parents/parents.module';
import { PayrollModule } from './payroll/payroll.module';
import { PlansModule } from './plans/plans.module';
import { PlatformSettingsModule } from './platform-settings/platform-settings.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { SchoolsModule } from './schools/schools.module';
import { SectionsModule } from './sections/sections.module';
import { StaffModule } from './staff/staff.module';
import { StudentsModule } from './students/students.module';
import { SubjectsModule } from './subjects/subjects.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { TeachersModule } from './teachers/teachers.module';
import { TimetableModule } from './timetable/timetable.module';
import { TransportModule } from './transport/transport.module';
import { UsersModule } from './users/users.module';
import { PdfModule } from './pdf/pdf.module';
import { HomeworkModule } from './homework/homework.module';
import { OnlineClassesModule } from './online-classes/online-classes.module';
import { AcademicCalendarModule } from './academic-calendar/academic-calendar.module';
import { TenantModule } from './common/tenant/tenant.module';

@Injectable()
class AppThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (req?.method === 'OPTIONS') return true;
    return super.shouldSkip(context);
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [path.join(process.cwd(), '.env'), path.join(__dirname, '..', '.env')],
    }),
    ThrottlerModule.forRoot([
      { name: 'short',  ttl: 1000,  limit: 10  },  // 10 req/sec
      { name: 'medium', ttl: 10000, limit: 50  },  // 50 req/10s
      { name: 'long',   ttl: 60000, limit: 200 },  // 200 req/min
    ]),
    PrismaModule,
    TenantModule,
    HealthModule,
    AuthModule,
    SchoolsModule,
    UsersModule,
    ClassesModule,
    SectionsModule,
    SubjectsModule,
    StudentsModule,
    TeachersModule,
    StaffModule,
    ParentsModule,
    FeesModule,
    AttendanceModule,
    ExamsModule,
    ExpensesModule,
    PayrollModule,
    TimetableModule,
    LibraryModule,
    TransportModule,
    CommunicationModule,
    ReportsModule,
    PlansModule,
    AuditLogsModule,
    ActivityModule,
    PlatformSettingsModule,
    SuperAdminModule,
    NotificationsModule,
    UploadsModule,
    RolesModule,
    PdfModule,
    HomeworkModule,
    OnlineClassesModule,
    AcademicCalendarModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
