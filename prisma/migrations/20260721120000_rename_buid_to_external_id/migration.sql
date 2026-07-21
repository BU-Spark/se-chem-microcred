-- Issue #185: rename the BU-specific `buid` column to a generic `externalId`.
-- Done as an in-place RENAME so existing values and the UNIQUE constraint are
-- preserved (no data backfill, no dropped/recreated index).
ALTER TABLE "Student" RENAME COLUMN "buid" TO "externalId";
ALTER INDEX "Student_buid_key" RENAME TO "Student_externalId_key";
