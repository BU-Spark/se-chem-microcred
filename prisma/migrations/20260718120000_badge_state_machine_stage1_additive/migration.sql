-- Badge state machine — Stage 1 (additive only).
-- Deployable anytime; breaks nothing. Old application code keeps working because
-- every column added here is nullable and the enum only gains values.
-- See docs/badge-state-machine.md.

-- AlterTable: authored assessment-policy defaults on the badge.
-- Nullable, no default => metadata-only ADD COLUMN (no table rewrite/backfill).
ALTER TABLE "Badge" ADD COLUMN "reassessmentLimit" INTEGER,
ADD COLUMN "cooldownDays" INTEGER,
ADD COLUMN "reassessmentRequired" BOOLEAN;

-- AlterTable: per-student milestone timestamps (honest, drift-free flow view).
ALTER TABLE "StudentBadge" ADD COLUMN "qevPassedAt" TIMESTAMP(3),
ADD COLUMN "cooldownUntil" TIMESTAMP(3),
ADD COLUMN "feedbackReviewedAt" TIMESTAMP(3);

-- AlterEnum: additive, non-breaking. New values append to the end of the type.
-- Safe on PostgreSQL 12+ because they are not referenced in this same migration
-- (the backfill that uses them lives in Stage 2, a separate transaction).
ALTER TYPE "BadgeStatus" ADD VALUE 'IN_REVIEW';
ALTER TYPE "BadgeStatus" ADD VALUE 'LOCKED';
