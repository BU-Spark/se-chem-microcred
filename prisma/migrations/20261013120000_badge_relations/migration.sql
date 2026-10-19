-- Badge prerequisite relationships between badge family roots. Additive only:
-- no existing rows change.
CREATE TYPE "BadgeRelationType" AS ENUM ('PREREQUISITE');

CREATE TABLE "BadgeRelation" (
    "id" TEXT NOT NULL,
    "type" "BadgeRelationType" NOT NULL DEFAULT 'PREREQUISITE',
    "fromBadgeId" TEXT NOT NULL,
    "toBadgeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BadgeRelation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BadgeRelation_toBadgeId_type_idx" ON "BadgeRelation"("toBadgeId", "type");

CREATE UNIQUE INDEX "BadgeRelation_type_fromBadgeId_toBadgeId_key" ON "BadgeRelation"("type", "fromBadgeId", "toBadgeId");

ALTER TABLE "BadgeRelation" ADD CONSTRAINT "BadgeRelation_fromBadgeId_fkey" FOREIGN KEY ("fromBadgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BadgeRelation" ADD CONSTRAINT "BadgeRelation_toBadgeId_fkey" FOREIGN KEY ("toBadgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
