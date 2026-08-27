-- Issues: #258 multi-word last names
-- Issue #258: store a person's given and family name discretely.
--
-- Until now "Student"."name" held the whole name and every read re-derived the
-- surname by taking the last whitespace-delimited token. That silently mangles
-- any multi-word surname: "Kaylin Von Bergen" reads back as first "Kaylin Von",
-- last "Bergen".
--
-- Deliberately additive, with no backfill. Backfilling would have to apply the
-- same broken heuristic, which would bake today's wrong guess into the table as
-- though it were authoritative. Leaving the columns NULL means the application
-- keeps falling back to splitName() for rows nobody has re-saved -- identical to
-- current behaviour -- while any authoritative write (roster CSV upload, the
-- onboarding form) fills them in correctly. Re-uploading a course roster is
-- therefore the repair path for existing rows.
ALTER TABLE "Student" ADD COLUMN "firstName" TEXT;
ALTER TABLE "Student" ADD COLUMN "lastName" TEXT;
