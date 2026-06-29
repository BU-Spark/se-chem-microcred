-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('PENDING', 'ACTIVE');

-- AlterTable: existing rows backfill to ACTIVE via the column default
ALTER TABLE "Enrollment" ADD COLUMN "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "Enrollment_courseId_role_status_idx" ON "Enrollment"("courseId", "role", "status");
