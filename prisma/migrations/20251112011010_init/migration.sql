-- CreateEnum
CREATE TYPE "AvatarBase" AS ENUM ('RUBY', 'EMERALD', 'SAPPHIRE', 'AMETHYST');

-- CreateEnum
CREATE TYPE "AvatarFace" AS ENUM ('SMILE', 'SURPRISED', 'MISCHIEF');

-- CreateEnum
CREATE TYPE "AvatarAccessory" AS ENUM ('LEAF', 'FEDORA', 'PROPELLER', 'NONE');

-- CreateEnum
CREATE TYPE "CourseContactType" AS ENUM ('INSTRUCTOR', 'CHECKER');

-- CreateEnum
CREATE TYPE "CourseRole" AS ENUM ('STUDENT', 'INSTRUCTOR', 'CHECKER');

-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SegmentStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BadgeCategory" AS ENUM ('SAFETY', 'EQUIPMENT', 'WASTE', 'OTHER');

-- CreateEnum
CREATE TYPE "BadgeStatus" AS ENUM ('LEARNING', 'READY_FOR_ASSESSMENT', 'READY_FOR_FINALIZATION', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SurveyContext" AS ENUM ('LESSON', 'BADGE');

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "buid" TEXT,
    "gender" TEXT,
    "raceEthnicity" TEXT,
    "parentalEducation" TEXT,
    "pellGrantQualified" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvatarSetting" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "base" "AvatarBase" NOT NULL,
    "face" "AvatarFace" NOT NULL,
    "accessory" "AvatarAccessory",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvatarSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "section" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseContact" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "type" "CourseContactType" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "role" "CourseRole" NOT NULL DEFAULT 'STUDENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "estimatedMinutes" INTEGER,
    "dueDate" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonSkill" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "LessonSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonSegment" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "duration" INTEGER,
    "videoUrl" TEXT,
    "muxPlaybackId" TEXT,
    "thumbnailUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonCheckpoint" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "segmentId" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "label" TEXT,
    "meta" TEXT,
    "questionCount" INTEGER NOT NULL,
    "timeOffsetSeconds" INTEGER NOT NULL DEFAULT 0,
    "snapshotUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckpointQuestion" (
    "id" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctIndex" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckpointQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonProgress" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "status" "LessonStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "percentComplete" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SegmentProgress" (
    "id" TEXT NOT NULL,
    "lessonProgressId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "status" "SegmentStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SegmentProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckpointResponse" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT,
    "checkpointId" TEXT NOT NULL,
    "questionId" TEXT,
    "studentId" TEXT NOT NULL,
    "lessonProgressId" TEXT,
    "selectedIndex" INTEGER,
    "isCorrect" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckpointResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckpointAttempt" (
    "id" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonProgressId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "isPassing" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckpointAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "BadgeCategory",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BadgeRequirement" (
    "id" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "lessonId" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BadgeRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentBadge" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "status" "BadgeStatus" NOT NULL DEFAULT 'LEARNING',
    "awardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "score" INTEGER,

    CONSTRAINT "StudentBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentAnalytics" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "hoursLearning" INTEGER NOT NULL DEFAULT 0,
    "badgesCompleted" INTEGER NOT NULL DEFAULT 0,
    "badgesReadyForAssessment" INTEGER NOT NULL DEFAULT 0,
    "badgesNotAttempted" INTEGER NOT NULL DEFAULT 0,
    "questionsAnswered" INTEGER NOT NULL DEFAULT 0,
    "averageAssessmentScore" INTEGER NOT NULL DEFAULT 0,
    "highestAssessmentScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyPrompt" (
    "id" TEXT NOT NULL,
    "context" "SurveyContext" NOT NULL,
    "lessonId" TEXT,
    "badgeId" TEXT,
    "question" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Student_email_key" ON "Student"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Student_buid_key" ON "Student"("buid");

-- CreateIndex
CREATE UNIQUE INDEX "AvatarSetting_studentId_key" ON "AvatarSetting"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Course_code_section_key" ON "Course"("code", "section");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_studentId_courseId_key" ON "Enrollment"("studentId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_slug_key" ON "Lesson"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "LessonSkill_lessonId_sortOrder_key" ON "LessonSkill"("lessonId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "LessonSegment_lessonId_sortOrder_key" ON "LessonSegment"("lessonId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "LessonCheckpoint_lessonId_sortOrder_key" ON "LessonCheckpoint"("lessonId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CheckpointQuestion_checkpointId_sortOrder_key" ON "CheckpointQuestion"("checkpointId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "LessonProgress_studentId_lessonId_key" ON "LessonProgress"("studentId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "SegmentProgress_lessonProgressId_segmentId_key" ON "SegmentProgress"("lessonProgressId", "segmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_slug_key" ON "Badge"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "StudentBadge_studentId_badgeId_key" ON "StudentBadge"("studentId", "badgeId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentAnalytics_studentId_key" ON "StudentAnalytics"("studentId");

-- AddForeignKey
ALTER TABLE "AvatarSetting" ADD CONSTRAINT "AvatarSetting_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseContact" ADD CONSTRAINT "CourseContact_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonSkill" ADD CONSTRAINT "LessonSkill_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonSegment" ADD CONSTRAINT "LessonSegment_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonCheckpoint" ADD CONSTRAINT "LessonCheckpoint_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonCheckpoint" ADD CONSTRAINT "LessonCheckpoint_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "LessonSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckpointQuestion" ADD CONSTRAINT "CheckpointQuestion_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "LessonCheckpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentProgress" ADD CONSTRAINT "SegmentProgress_lessonProgressId_fkey" FOREIGN KEY ("lessonProgressId") REFERENCES "LessonProgress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentProgress" ADD CONSTRAINT "SegmentProgress_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "LessonSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckpointResponse" ADD CONSTRAINT "CheckpointResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "CheckpointAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckpointResponse" ADD CONSTRAINT "CheckpointResponse_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "LessonCheckpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckpointResponse" ADD CONSTRAINT "CheckpointResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "CheckpointQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckpointResponse" ADD CONSTRAINT "CheckpointResponse_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckpointResponse" ADD CONSTRAINT "CheckpointResponse_lessonProgressId_fkey" FOREIGN KEY ("lessonProgressId") REFERENCES "LessonProgress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckpointAttempt" ADD CONSTRAINT "CheckpointAttempt_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "LessonCheckpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckpointAttempt" ADD CONSTRAINT "CheckpointAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckpointAttempt" ADD CONSTRAINT "CheckpointAttempt_lessonProgressId_fkey" FOREIGN KEY ("lessonProgressId") REFERENCES "LessonProgress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeRequirement" ADD CONSTRAINT "BadgeRequirement_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeRequirement" ADD CONSTRAINT "BadgeRequirement_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBadge" ADD CONSTRAINT "StudentBadge_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBadge" ADD CONSTRAINT "StudentBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAnalytics" ADD CONSTRAINT "StudentAnalytics_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyPrompt" ADD CONSTRAINT "SurveyPrompt_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyPrompt" ADD CONSTRAINT "SurveyPrompt_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "SurveyPrompt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
