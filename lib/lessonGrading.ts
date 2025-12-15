import type { PrismaClient } from '@prisma/client';

export type LessonGradeResult = {
  totalQuestions: number;
  correctAnswers: number;
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
        where: { userId },
        orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
        take: 1,
        include: {
          responses: true,
        },
      },
    },
  });

  const { totalQuestions, correctAnswers } = checkpoints.reduce(
    (acc, checkpoint) => {
      const latestAttempt = checkpoint.attempts[0];
      const checkpointQuestions = checkpoint.questions.length;
      const checkpointCorrect = latestAttempt
        ? latestAttempt.responses.filter((response) => response.isCorrect === true).length
        : 0;

      return {
        totalQuestions: acc.totalQuestions + checkpointQuestions,
        correctAnswers: acc.correctAnswers + checkpointCorrect,
      };
    },
    { totalQuestions: 0, correctAnswers: 0 }
  );

  const percent = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 100;

  return {
    totalQuestions,
    correctAnswers,
    percent,
  };
}
