-- WhatsApp attendance notifications: tracking fields + status values on NotificationLog
ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'READ';
ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'SKIPPED';

ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "notificationType" TEXT;
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "errorCode" TEXT;
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "skipReason" TEXT;
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "studentId" TEXT;
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "attendanceId" TEXT;
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill updatedAt for existing rows if column was just added without default application
UPDATE "NotificationLog" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationLog_idempotencyKey_key" ON "NotificationLog"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "NotificationLog_schoolId_status_idx" ON "NotificationLog"("schoolId", "status");
CREATE INDEX IF NOT EXISTS "NotificationLog_schoolId_notificationType_idx" ON "NotificationLog"("schoolId", "notificationType");
CREATE INDEX IF NOT EXISTS "NotificationLog_studentId_idx" ON "NotificationLog"("studentId");
CREATE INDEX IF NOT EXISTS "NotificationLog_attendanceId_idx" ON "NotificationLog"("attendanceId");

DO $$ BEGIN
  ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_attendanceId_fkey"
    FOREIGN KEY ("attendanceId") REFERENCES "StudentAttendance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
