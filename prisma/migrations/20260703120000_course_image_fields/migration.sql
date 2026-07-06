-- Instructor-chosen "course image": an Iconify icon name (e.g. "mdi:flask")
-- rendered over a background color from a fixed 7-color palette, with a
-- light/dark icon foreground. All nullable so existing courses keep their
-- current lesson-thumbnail fallback with no backfill.
ALTER TABLE "Course" ADD COLUMN "iconName" TEXT;
ALTER TABLE "Course" ADD COLUMN "iconBgColor" TEXT;
ALTER TABLE "Course" ADD COLUMN "iconFgColor" TEXT;
