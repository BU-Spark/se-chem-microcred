-- Rubric overhaul (issue #119): Badge -> RubricGoal -> RubricSubgoal -> RubricTask.
-- Destructive reset of the rubric grading tables (pre-MVP; no real rubric data).
-- Subgoals now carry a passThreshold; the point weight moves to the new task
-- leaf; grading responses move from subgoal-level to task-level.

-- DropForeignKey
ALTER TABLE "AssessmentSubgoalResponse" DROP CONSTRAINT "AssessmentSubgoalResponse_attemptId_fkey";

-- DropForeignKey
ALTER TABLE "AssessmentSubgoalResponse" DROP CONSTRAINT "AssessmentSubgoalResponse_subgoalId_fkey";

-- AlterTable
ALTER TABLE "RubricGoal" DROP COLUMN "passThreshold",
DROP COLUMN "totalPoints";

-- AlterTable
ALTER TABLE "RubricSubgoal" DROP COLUMN "points",
ADD COLUMN     "passThreshold" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "AssessmentSubgoalResponse";

-- CreateTable
CREATE TABLE "RubricTask" (
    "id" TEXT NOT NULL,
    "subgoalId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RubricTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentTaskResponse" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "taskId" TEXT,
    "subgoalText" TEXT NOT NULL,
    "taskText" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "passed" BOOLEAN NOT NULL,
    "feedback" TEXT,
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentTaskResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RubricTask_subgoalId_sortOrder_key" ON "RubricTask"("subgoalId", "sortOrder");

-- CreateIndex
CREATE INDEX "AssessmentTaskResponse_attemptId_idx" ON "AssessmentTaskResponse"("attemptId");

-- AddForeignKey
ALTER TABLE "RubricTask" ADD CONSTRAINT "RubricTask_subgoalId_fkey" FOREIGN KEY ("subgoalId") REFERENCES "RubricSubgoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentTaskResponse" ADD CONSTRAINT "AssessmentTaskResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentTaskResponse" ADD CONSTRAINT "AssessmentTaskResponse_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "RubricTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
