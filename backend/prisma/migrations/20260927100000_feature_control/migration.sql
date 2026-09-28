-- Feature Control: additive Feature + SchoolFeature tables.
-- Existing schools need no SchoolFeature rows (missing = INHERIT / ON when global ON).

CREATE TABLE IF NOT EXISTS "Feature" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isGloballyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isCore" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Feature_key_key" ON "Feature"("key");

CREATE TABLE IF NOT EXISTS "SchoolFeature" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolFeature_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SchoolFeature_schoolId_featureId_key" ON "SchoolFeature"("schoolId", "featureId");
CREATE INDEX IF NOT EXISTS "SchoolFeature_schoolId_idx" ON "SchoolFeature"("schoolId");
CREATE INDEX IF NOT EXISTS "SchoolFeature_featureId_idx" ON "SchoolFeature"("featureId");

DO $$ BEGIN
  ALTER TABLE "SchoolFeature"
    ADD CONSTRAINT "SchoolFeature_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SchoolFeature"
    ADD CONSTRAINT "SchoolFeature_featureId_fkey"
    FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
