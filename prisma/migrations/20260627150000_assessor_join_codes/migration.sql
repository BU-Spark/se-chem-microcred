-- Separate invite code for assessors (CHECKER role), distinct from the student
-- course code so the two roles join with different codes.
ALTER TABLE "Course" ADD COLUMN "assessorCode" TEXT;

-- Backfill existing courses. Salt the hash with 'assessor' so the generated
-- code differs from the student "code" (which is derived from the bare id).
UPDATE "Course"
SET "assessorCode" = upper(substr(md5("id" || 'assessor'), 1, 8))
WHERE "assessorCode" IS NULL OR length(trim("assessorCode")) = 0;

CREATE UNIQUE INDEX "Course_assessorCode_key" ON "Course"("assessorCode");
