-- Teacher ID card design colors (school-scoped). No data backfill; null = defaults.
ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "teacherIdCardPrimaryColor" TEXT;
ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "teacherIdCardAccentColor" TEXT;
ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "teacherIdCardBackgroundColor" TEXT;
ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "teacherIdCardTextColor" TEXT;