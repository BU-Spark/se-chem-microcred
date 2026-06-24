-- Add ownership and source tracking for reusable badge library imports.
ALTER TABLE "Badge" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Badge" ADD COLUMN "sourceBadgeId" TEXT;

CREATE INDEX "Badge_createdById_idx" ON "Badge"("createdById");
CREATE INDEX "Badge_sourceBadgeId_idx" ON "Badge"("sourceBadgeId");

ALTER TABLE "Badge"
ADD CONSTRAINT "Badge_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "Student"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Badge"
ADD CONSTRAINT "Badge_sourceBadgeId_fkey"
FOREIGN KEY ("sourceBadgeId") REFERENCES "Badge"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
