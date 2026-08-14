-- Uploaded badge artwork. Existing badges remain null and use their lesson/video thumbnail.
ALTER TABLE "Badge" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
