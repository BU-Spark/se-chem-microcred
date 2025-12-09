-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "passingPercent" INTEGER NOT NULL DEFAULT 70;

-- AlterTable
ALTER TABLE "LessonProgress" ADD COLUMN     "lastGradePassed" BOOLEAN,
ADD COLUMN     "lastGradePercent" DOUBLE PRECISION,
ADD COLUMN     "lastGradedAt" TIMESTAMP(3);
