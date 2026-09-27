-- Course sections — Stage 1 (schema). Stores the course's section names so a section that
-- loses its last member can still be assigned to.
ALTER TABLE "Course" ADD COLUMN "sections" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
