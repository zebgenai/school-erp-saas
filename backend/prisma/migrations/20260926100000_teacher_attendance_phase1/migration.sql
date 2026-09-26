-- Teacher profile fields for Phase 1 attendance/ID-card readiness
ALTER TABLE "Teacher" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
ALTER TABLE "Teacher" ADD COLUMN IF NOT EXISTS "employeeNo" TEXT;
ALTER TABLE "Teacher" ADD COLUMN IF NOT EXISTS "designation" TEXT;

-- Unique employee number within a school (NULLs allowed multiple times in PostgreSQL)
CREATE UNIQUE INDEX IF NOT EXISTS "Teacher_schoolId_employeeNo_key" ON "Teacher"("schoolId", "employeeNo");

-- Teacher attendance punch source
DO $$ BEGIN
  CREATE TYPE "TeacherAttendanceSource" AS ENUM ('MANUAL', 'QR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "TeacherAttendance" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "workDate" TIMESTAMP(3) NOT NULL,
  "checkInAt" TIMESTAMP(3) NOT NULL,
  "checkOutAt" TIMESTAMP(3),
  "source" "TeacherAttendanceSource" NOT NULL DEFAULT 'MANUAL',
  "remarks" TEXT,
  "markedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeacherAttendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeacherAttendance_schoolId_teacherId_workDate_key"
  ON "TeacherAttendance"("schoolId", "teacherId", "workDate");

CREATE INDEX IF NOT EXISTS "TeacherAttendance_schoolId_idx" ON "TeacherAttendance"("schoolId");
CREATE INDEX IF NOT EXISTS "TeacherAttendance_teacherId_idx" ON "TeacherAttendance"("teacherId");
CREATE INDEX IF NOT EXISTS "TeacherAttendance_workDate_idx" ON "TeacherAttendance"("workDate");
CREATE INDEX IF NOT EXISTS "TeacherAttendance_schoolId_workDate_idx" ON "TeacherAttendance"("schoolId", "workDate");
CREATE INDEX IF NOT EXISTS "TeacherAttendance_schoolId_teacherId_idx" ON "TeacherAttendance"("schoolId", "teacherId");

DO $$ BEGIN
  ALTER TABLE "TeacherAttendance"
    ADD CONSTRAINT "TeacherAttendance_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TeacherAttendance"
    ADD CONSTRAINT "TeacherAttendance_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TeacherAttendance"
    ADD CONSTRAINT "TeacherAttendance_markedById_fkey"
    FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
