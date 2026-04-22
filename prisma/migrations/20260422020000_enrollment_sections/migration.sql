CREATE TABLE "EnrollmentSection" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollmentSection_pkey" PRIMARY KEY ("id")
);

INSERT INTO "EnrollmentSection" ("id", "enrollmentId", "section", "createdAt")
SELECT
    md5(random()::text || clock_timestamp()::text || "id"),
    "id",
    trim("section"),
    CURRENT_TIMESTAMP
FROM "Enrollment"
WHERE "section" IS NOT NULL
  AND length(trim("section")) > 0;

CREATE UNIQUE INDEX "EnrollmentSection_enrollmentId_section_key" ON "EnrollmentSection" ("enrollmentId", "section");

ALTER TABLE "EnrollmentSection"
    ADD CONSTRAINT "EnrollmentSection_enrollmentId_fkey"
        FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Enrollment"
    DROP COLUMN "section";
