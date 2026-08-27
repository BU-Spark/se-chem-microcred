-- Issue #248: point value attribution moves from the checkpoint to each
-- question, since a checkpoint can hold several questions worth different
-- amounts. The checkpoint never had a persisted points column of its own (it
-- was authoring-UI-only), so this is a pure addition, not a data migration.
ALTER TABLE "CheckpointQuestion"
  ADD COLUMN IF NOT EXISTS "points" INTEGER NOT NULL DEFAULT 1;
