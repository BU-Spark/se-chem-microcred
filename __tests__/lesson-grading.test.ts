/** @jest-environment node */

import type { PrismaClient } from '@prisma/client';

import { computeLessonGrade } from '../lib/lessonGrading';

function prismaWithCheckpoints(checkpoints: unknown[]) {
  return {
    lessonCheckpoint: { findMany: jest.fn().mockResolvedValue(checkpoints) },
  } as unknown as PrismaClient;
}

describe('computeLessonGrade', () => {
  it('scores a quiz lesson by correct answers', async () => {
    const prisma = prismaWithCheckpoints([
      {
        questions: [{}, {}, {}, {}],
        attempts: [
          { responses: [{ isCorrect: true }, { isCorrect: true }, { isCorrect: true }, { isCorrect: false }] },
        ],
      },
    ]);

    const result = await computeLessonGrade(prisma, { lessonId: 'l1', userId: 'u1' });

    expect(result).toEqual({ totalQuestions: 4, correctAnswers: 3, percent: 75 });
  });

  it('treats a video-only lesson (no questions) as passed at 100%', async () => {
    // Regression for #160: no-question lessons were scored 0%, so completing
    // the video could never pass the lesson or advance its badge.
    const prisma = prismaWithCheckpoints([]);

    const result = await computeLessonGrade(prisma, { lessonId: 'l1', userId: 'u1' });

    expect(result).toEqual({ totalQuestions: 0, correctAnswers: 0, percent: 100 });
  });

  it('treats checkpoints that carry no questions as a passed lesson', async () => {
    const prisma = prismaWithCheckpoints([{ questions: [], attempts: [] }]);

    const result = await computeLessonGrade(prisma, { lessonId: 'l1', userId: 'u1' });

    expect(result.totalQuestions).toBe(0);
    expect(result.percent).toBe(100);
  });
});
