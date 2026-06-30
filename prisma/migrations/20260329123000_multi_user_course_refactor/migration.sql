ALTER TABLE "Course"
    ADD COLUMN "createdById" TEXT,
    ADD COLUMN "sectionCount" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Course"
    ADD CONSTRAINT "Course_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "Student" ("id")
            ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Enrollment"
    ADD COLUMN "section" TEXT;

CREATE TABLE "CourseSettings"
(
    "id"                    TEXT         NOT NULL,
    "courseId"              TEXT         NOT NULL,
    "allowCooldownOverride" BOOLEAN      NOT NULL DEFAULT false,
    "allowAssessorMessages" BOOLEAN      NOT NULL DEFAULT false,
    "allowCrossSectionView" BOOLEAN      NOT NULL DEFAULT false,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseSettings_courseId_key" ON "CourseSettings" ("courseId");

ALTER TABLE "CourseSettings"
    ADD CONSTRAINT "CourseSettings_courseId_fkey"
        FOREIGN KEY ("courseId") REFERENCES "Course" ("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;