/** @jest-environment node */

import { computeLessonGrade } from '../lib/lessonGrading';

function fakePrisma(checkpoints: unknown[]) {
  return {
    lessonCheckpoint: {
      findMany: jest.fn().mockResolvedValue(checkpoints),
    },
  } as never;
}

describe('computeLessonGrade', () => {
  it('weights the grade by question points rather than question count (#248)', async () => {
    // One checkpoint: a 1-point question answered correctly and a 4-point
    // question answered wrong. Count-based grading would read this as 50%;
    // point-weighted grading should read it as 1 / 5 = 20%.
    const prisma = fakePrisma([
      {
        questions: [
          { id: 'q1', points: 1 },
          { id: 'q2', points: 4 },
        ],
        attempts: [
          {
            responses: [
              { questionId: 'q1', isCorrect: true },
              { questionId: 'q2', isCorrect: false },
            ],
          },
        ],
      },
    ]);

    const result = await computeLessonGrade(prisma, { lessonId: 'lesson-1', userId: 'student-1' });

    expect(result.totalQuestions).toBe(2);
    expect(result.correctAnswers).toBe(1);
    expect(result.pointsEarned).toBe(1);
    expect(result.pointsPossible).toBe(5);
    expect(result.percent).toBe(20);
  });

  it('sums points across checkpoints and treats an ungraded checkpoint as no points earned', async () => {
    const prisma = fakePrisma([
      {
        questions: [{ id: 'q1', points: 2 }],
        attempts: [{ responses: [{ questionId: 'q1', isCorrect: true }] }],
      },
      {
        questions: [{ id: 'q2', points: 3 }],
        attempts: [],
      },
    ]);

    const result = await computeLessonGrade(prisma, { lessonId: 'lesson-1', userId: 'student-1' });

    expect(result.pointsEarned).toBe(2);
    expect(result.pointsPossible).toBe(5);
    expect(result.percent).toBe(40);
  });

  it('returns 0 percent instead of dividing by zero when there are no questions', async () => {
    const prisma = fakePrisma([]);

    const result = await computeLessonGrade(prisma, { lessonId: 'lesson-1', userId: 'student-1' });

    expect(result.pointsPossible).toBe(0);
    expect(result.percent).toBe(0);
  });
});
