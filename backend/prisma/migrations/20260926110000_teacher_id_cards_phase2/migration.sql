-- Phase 2: Teacher ID cards (separate from StudentIdCard)

CREATE TABLE IF NOT EXISTS "TeacherIdCard" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "qrToken" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeacherIdCard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeacherIdCard_qrToken_key" ON "TeacherIdCard"("qrToken");

CREATE INDEX IF NOT EXISTS "TeacherIdCard_schoolId_idx" ON "TeacherIdCard"("schoolId");
CREATE INDEX IF NOT EXISTS "TeacherIdCard_teacherId_idx" ON "TeacherIdCard"("teacherId");
CREATE INDEX IF NOT EXISTS "TeacherIdCard_schoolId_teacherId_idx" ON "TeacherIdCard"("schoolId", "teacherId");
CREATE INDEX IF NOT EXISTS "TeacherIdCard_schoolId_isActive_idx" ON "TeacherIdCard"("schoolId", "isActive");

-- At most one active card per teacher (mirrors StudentIdCard partial unique).
CREATE UNIQUE INDEX IF NOT EXISTS "TeacherIdCard_one_active_per_teacher_idx"
ON "TeacherIdCard"("teacherId")
WHERE "isActive" = true;

DO $$ BEGIN
  ALTER TABLE "TeacherIdCard"
    ADD CONSTRAINT "TeacherIdCard_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TeacherIdCard"
    ADD CONSTRAINT "TeacherIdCard_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
