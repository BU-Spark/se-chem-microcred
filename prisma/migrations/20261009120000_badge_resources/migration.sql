-- Badge extra resources: links and PDFs Additive only: no existing
-- rows change.
CREATE TYPE "BadgeResourceKind" AS ENUM ('LINK', 'FILE');

CREATE TABLE "BadgeResource" (
    "id" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "kind" "BadgeResourceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BadgeResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BadgeResourceFile" (
    "resourceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "BadgeResourceFile_pkey" PRIMARY KEY ("resourceId")
);

CREATE INDEX "BadgeResource_badgeId_idx" ON "BadgeResource"("badgeId");

ALTER TABLE "BadgeResource" ADD CONSTRAINT "BadgeResource_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BadgeResourceFile" ADD CONSTRAINT "BadgeResourceFile_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "BadgeResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
