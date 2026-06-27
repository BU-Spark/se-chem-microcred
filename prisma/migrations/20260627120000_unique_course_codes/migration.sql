UPDATE "Course"
SET "code" = upper(substr(md5("id"), 1, 8))
WHERE "code" IS NULL OR length(trim("code")) = 0;

UPDATE "Course"
SET "code" = upper(regexp_replace(trim("code"), '[^A-Za-z0-9]', '', 'g'))
WHERE "code" IS NOT NULL;

CREATE UNIQUE INDEX "Course_code_key" ON "Course"("code");
