import { Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';
import { SchoolAuditService } from './school-audit.service';

@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService, SchoolAuditService],
  exports: [AuditLogsService, SchoolAuditService],
})
export class AuditLogsModule {}
