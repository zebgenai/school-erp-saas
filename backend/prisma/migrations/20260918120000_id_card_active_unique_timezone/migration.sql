-- School-local timezone for QR attendance (Pakistan default).
-- Existing schools automatically receive Asia/Karachi via the column default.
-- IF NOT EXISTS keeps a manual re-apply from failing on already-migrated DBs.
ALTER TABLE "School" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Asia/Karachi';

-- Guarantee at most one active ID card per student.
-- Prisma cannot express partial unique indexes in schema.prisma, so this is
-- enforced here: UNIQUE(studentId) WHERE isActive = true.
-- First revoke extras (keep the newest active card) so the index can be created.
-- Safe to re-run: no-op when each student already has ≤1 active card.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "studentId"
      ORDER BY "issuedAt" DESC, "createdAt" DESC, id DESC
    ) AS rn
  FROM "StudentIdCard"
  WHERE "isActive" = true
)
UPDATE "StudentIdCard" AS c
SET
  "isActive" = false,
  "revokedAt" = COALESCE(c."revokedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
FROM ranked AS r
WHERE c.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "StudentIdCard_one_active_per_student_idx"
ON "StudentIdCard"("studentId")
WHERE "isActive" = true;
