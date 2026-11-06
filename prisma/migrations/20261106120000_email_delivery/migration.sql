-- Email delivery and automated feedback-review reminders (issue #323).
-- Additive only: existing messages default to IN_APP and reminders are off.

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('IN_APP', 'EMAIL', 'BOTH');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "channel" "MessageChannel" NOT NULL DEFAULT 'IN_APP';

-- AlterTable
ALTER TABLE "MessageReceipt" ADD COLUMN     "emailError" TEXT,
ADD COLUMN     "emailId" TEXT,
ADD COLUMN     "emailStatus" "EmailStatus",
ADD COLUMN     "emailedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CourseSettings" ADD COLUMN     "feedbackReminderIntervalDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "feedbackRemindersEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FeedbackReminder" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "cycleKey" TEXT NOT NULL,
    "messageId" TEXT,
    "emailStatus" "EmailStatus",
    "emailError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedbackReminder_courseId_idx" ON "FeedbackReminder"("courseId");

-- CreateIndex
CREATE INDEX "FeedbackReminder_badgeId_idx" ON "FeedbackReminder"("badgeId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackReminder_studentId_badgeId_cycleKey_key" ON "FeedbackReminder"("studentId", "badgeId", "cycleKey");

-- AddForeignKey
ALTER TABLE "FeedbackReminder" ADD CONSTRAINT "FeedbackReminder_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackReminder" ADD CONSTRAINT "FeedbackReminder_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackReminder" ADD CONSTRAINT "FeedbackReminder_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

