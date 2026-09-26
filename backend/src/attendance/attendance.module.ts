import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { TeacherAttendanceService } from './teacher-attendance.service';

@Module({
  imports: [NotificationsModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, TeacherAttendanceService],
  exports: [AttendanceService, TeacherAttendanceService],
})
export class AttendanceModule {}
