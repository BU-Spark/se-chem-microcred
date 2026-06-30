-- CreateTable
CREATE TABLE "AssessmentAccessCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentAccessCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAccessCode_code_key" ON "AssessmentAccessCode"("code");

-- CreateIndex
CREATE INDEX "AssessmentAccessCode_expiresAt_idx" ON "AssessmentAccessCode"("expiresAt");

-- CreateIndex
CREATE INDEX "AssessmentAccessCode_studentId_badgeId_courseId_idx" ON "AssessmentAccessCode"("studentId", "badgeId", "courseId");
