-- Additive, nullable, non-destructive columns. No defaults / constraints, so
-- these ADD COLUMN operations are metadata-only on Postgres (no table rewrite,
-- no backfill) and safe to run against a live database.

-- AlterTable
ALTER TABLE "Badge" ADD COLUMN "availableOn" TIMESTAMP(3),
ADD COLUMN "closesOn" TIMESTAMP(3),
ADD COLUMN "neverCloses" BOOLEAN;

-- AlterTable
ALTER TABLE "StudentBadge" ADD COLUMN "reassessmentLimit" INTEGER,
ADD COLUMN "cooldownDays" INTEGER,
ADD COLUMN "reassessmentRequired" BOOLEAN;
