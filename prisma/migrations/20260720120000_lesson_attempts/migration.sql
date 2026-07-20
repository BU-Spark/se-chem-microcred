-- QEV attempt history: a first-class LessonAttempt (one graded watch-through),
-- plus archive markers so failed runs are retained for the instructor view while
-- the student retries from a fresh slate. Additive + nullable — safe on a live DB.

-- CreateTable
CREATE TABLE "LessonAttempt" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "gradePercent" DOUBLE PRECISION NOT NULL,
    "correctAnswers" INTEGER,
    "totalQuestions" INTEGER,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LessonAttempt_studentId_lessonId_idx" ON "LessonAttempt"("studentId", "lessonId");

-- AlterTable: run grouping + student-hide markers (metadata-only ADD COLUMN).
ALTER TABLE "CheckpointAttempt" ADD COLUMN "lessonAttemptId" TEXT,
ADD COLUMN "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CheckpointResponse" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CheckpointAttempt_lessonAttemptId_idx" ON "CheckpointAttempt"("lessonAttemptId");

-- AddForeignKey
ALTER TABLE "LessonAttempt" ADD CONSTRAINT "LessonAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonAttempt" ADD CONSTRAINT "LessonAttempt_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckpointAttempt" ADD CONSTRAINT "CheckpointAttempt_lessonAttemptId_fkey" FOREIGN KEY ("lessonAttemptId") REFERENCES "LessonAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
