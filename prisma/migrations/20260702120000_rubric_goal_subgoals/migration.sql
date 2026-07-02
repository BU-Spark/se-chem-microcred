-- DropForeignKey
ALTER TABLE "public"."AssessmentCriterionResponse" DROP CONSTRAINT "AssessmentCriterionResponse_attemptId_fkey";

-- AlterTable
ALTER TABLE "AssessmentAttempt" ADD COLUMN     "pointsEarned" INTEGER,
ADD COLUMN     "pointsPossible" INTEGER;

-- DropTable
DROP TABLE "public"."AssessmentCriterionResponse";

-- CreateTable
CREATE TABLE "RubricGoal" (
    "id" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "passThreshold" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RubricGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RubricSubgoal" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RubricSubgoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentSubgoalResponse" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "subgoalId" TEXT,
    "subgoalText" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "passed" BOOLEAN NOT NULL,
    "feedback" TEXT,
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentSubgoalResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RubricGoal_badgeId_key" ON "RubricGoal"("badgeId");

-- CreateIndex
CREATE UNIQUE INDEX "RubricSubgoal_goalId_sortOrder_key" ON "RubricSubgoal"("goalId", "sortOrder");

-- CreateIndex
CREATE INDEX "AssessmentSubgoalResponse_attemptId_idx" ON "AssessmentSubgoalResponse"("attemptId");

-- AddForeignKey
ALTER TABLE "RubricGoal" ADD CONSTRAINT "RubricGoal_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricSubgoal" ADD CONSTRAINT "RubricSubgoal_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "RubricGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSubgoalResponse" ADD CONSTRAINT "AssessmentSubgoalResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSubgoalResponse" ADD CONSTRAINT "AssessmentSubgoalResponse_subgoalId_fkey" FOREIGN KEY ("subgoalId") REFERENCES "RubricSubgoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

