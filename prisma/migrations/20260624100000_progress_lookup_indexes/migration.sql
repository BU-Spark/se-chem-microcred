-- Add indexes for course-scale badge import and progress lookup paths.
CREATE INDEX "Enrollment_courseId_idx" ON "Enrollment"("courseId");
CREATE INDEX "Enrollment_role_courseId_idx" ON "Enrollment"("role", "courseId");

CREATE INDEX "Lesson_courseId_idx" ON "Lesson"("courseId");
CREATE INDEX "LessonCheckpoint_segmentId_idx" ON "LessonCheckpoint"("segmentId");

CREATE INDEX "BadgeRequirement_badgeId_idx" ON "BadgeRequirement"("badgeId");
CREATE INDEX "BadgeRequirement_lessonId_idx" ON "BadgeRequirement"("lessonId");

CREATE INDEX "StudentBadge_badgeId_idx" ON "StudentBadge"("badgeId");
CREATE INDEX "StudentBadge_status_badgeId_idx" ON "StudentBadge"("status", "badgeId");
