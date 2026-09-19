-- CreateEnum
CREATE TYPE "IdCardTemplate" AS ENUM ('CLASSIC', 'MODERN', 'PREMIUM', 'MINIMAL');

-- AlterTable
ALTER TABLE "School" ADD COLUMN "idCardTemplate" "IdCardTemplate" NOT NULL DEFAULT 'CLASSIC';
ALTER TABLE "School" ADD COLUMN "attendancePresentUntil" TEXT;
ALTER TABLE "School" ADD COLUMN "attendanceLateUntil" TEXT;

-- CreateTable
CREATE TABLE "StudentIdCard" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "qrToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentIdCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentIdCard_qrToken_key" ON "StudentIdCard"("qrToken");

-- CreateIndex
CREATE INDEX "StudentIdCard_schoolId_idx" ON "StudentIdCard"("schoolId");

-- CreateIndex
CREATE INDEX "StudentIdCard_studentId_idx" ON "StudentIdCard"("studentId");

-- CreateIndex
CREATE INDEX "StudentIdCard_schoolId_studentId_idx" ON "StudentIdCard"("schoolId", "studentId");

-- CreateIndex
CREATE INDEX "StudentIdCard_schoolId_isActive_idx" ON "StudentIdCard"("schoolId", "isActive");

-- AddForeignKey
ALTER TABLE "StudentIdCard" ADD CONSTRAINT "StudentIdCard_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentIdCard" ADD CONSTRAINT "StudentIdCard_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
