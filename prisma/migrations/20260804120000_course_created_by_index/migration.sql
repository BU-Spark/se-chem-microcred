-- "Courses I teach" (Course.createdById = me) is the entry point for the instructor
-- course grid and the home pending-work aggregate, but Course carried no indexes at
-- all, so every one of those lookups was a sequential scan.
CREATE INDEX "Course_createdById_idx" ON "Course"("createdById");
