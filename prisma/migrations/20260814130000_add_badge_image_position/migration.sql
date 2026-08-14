-- Persist the creator-selected focal point used when badge artwork is cropped.
ALTER TABLE "Badge"
  ADD COLUMN IF NOT EXISTS "imagePositionX" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "imagePositionY" INTEGER NOT NULL DEFAULT 50;
