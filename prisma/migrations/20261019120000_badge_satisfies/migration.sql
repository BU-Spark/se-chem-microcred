-- "Completing badge A also earns badge B" relationships. Additive only: no
-- existing rows change. The new enum value is not used in this migration, so
-- ADD VALUE is safe inside the migration transaction.
ALTER TYPE "BadgeRelationType" ADD VALUE 'SATISFIES';

ALTER TABLE "StudentBadge" ADD COLUMN "satisfiedByBadgeId" TEXT,
ADD COLUMN "satisfiedPriorStatus" "BadgeStatus";

CREATE INDEX "StudentBadge_satisfiedByBadgeId_idx" ON "StudentBadge"("satisfiedByBadgeId");

ALTER TABLE "StudentBadge" ADD CONSTRAINT "StudentBadge_satisfiedByBadgeId_fkey" FOREIGN KEY ("satisfiedByBadgeId") REFERENCES "Badge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
