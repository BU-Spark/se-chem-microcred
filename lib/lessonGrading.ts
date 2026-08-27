import type { PrismaClient } from '@prisma/client';

export type LessonGradeResult = {
  totalQuestions: number;
  correctAnswers: number;
  // Point-weighted tally (issue #248): drives `percent`/pass-fail. Counts above
  // stay unweighted so "X of Y correct" displays are unaffected.
  pointsEarned: number;
  pointsPossible: number;
  percent: number;
};

export async function computeLessonGrade(
  prisma: PrismaClient,
  {
    lessonId,
    userId,
  }: {
    lessonId: string;
    userId: string;
  }
): Promise<LessonGradeResult> {
  const checkpoints = await prisma.lessonCheckpoint.findMany({
    where: { lessonId },
    include: {
      questions: true,
      attempts: {
        // archivedAt: null keeps grading scoped to the current (unsealed) run, so a
        // retry regrades against the fresh answers rather than a past failed run.
        where: { userId, archivedAt: null },
        orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
        take: 1,
        include: {
          responses: true,
        },
      },
    },
  });

  const { totalQuestions, correctAnswers, pointsEarned, pointsPossible } = checkpoints.reduce(
    (acc, checkpoint) => {
      const latestAttempt = checkpoint.attempts[0];
      const correctResponses = latestAttempt
        ? latestAttempt.responses.filter((response) => response.isCorrect === true)
        : [];
      const pointsByQuestionId = new Map(checkpoint.questions.map((question) => [question.id, question.points]));
      const checkpointPointsPossible = checkpoint.questions.reduce((sum, question) => sum + question.points, 0);
      const checkpointPointsEarned = correctResponses.reduce(
        (sum, response) => sum + (response.questionId ? (pointsByQuestionId.get(response.questionId) ?? 0) : 0),
        0
      );

      return {
        totalQuestions: acc.totalQuestions + checkpoint.questions.length,
        correctAnswers: acc.correctAnswers + correctResponses.length,
        pointsEarned: acc.pointsEarned + checkpointPointsEarned,
        pointsPossible: acc.pointsPossible + checkpointPointsPossible,
      };
    },
    { totalQuestions: 0, correctAnswers: 0, pointsEarned: 0, pointsPossible: 0 }
  );

  // Point-weighted, mirroring the in-person assessment's pointsEarned/pointsPossible.
  const percent = pointsPossible > 0 ? (pointsEarned / pointsPossible) * 100 : 0;

  return {
    totalQuestions,
    correctAnswers,
    pointsEarned,
    pointsPossible,
    percent,
  };
}
