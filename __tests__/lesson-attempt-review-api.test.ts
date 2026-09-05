/** @jest-environment node */

import { currentUser } from '@clerk/nextjs/server';

import { GET } from '../app/api/lessons/[lessonId]/attempts/latest/route';
import prisma from '../lib/prisma';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
    lesson: { findUnique: jest.fn() },
    lessonAttempt: { findFirst: jest.fn() },
  },
}));

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  lesson: { findUnique: jest.Mock };
  lessonAttempt: { findFirst: jest.Mock };
};

function review(lessonId = 'lesson-1') {
  return GET(new Request(`http://localhost/api/lessons/${lessonId}/attempts/latest`), {
    params: Promise.resolve({ lessonId }),
  });
}

function buildQuestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'question-1',
    prompt: '<p>What is <strong>2 + 2</strong>?</p>',
    options: { type: 'multipleChoice', options: ['<p><em>Four</em></p>', '<p>Five</p>'], correctIndices: [0] },
    correctIndex: 0,
    points: 1,
    ...overrides,
  };
}

function buildAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lesson-attempt-1',
    passed: false,
    gradePercent: 33.333333,
    correctAnswers: 1,
    totalQuestions: 3,
    completedAt: new Date('2026-09-05T12:00:00.000Z'),
    checkpointAttempts: [
      {
        completedAt: new Date('2026-09-05T11:50:00.000Z'),
        responses: [
          { questionId: 'question-1', selectedIndex: 1, selectedIndices: [1], numericAnswer: null, isCorrect: false },
        ],
        checkpoint: { id: 'checkpoint-1', label: 'Checkpoint', sortOrder: 0, questions: [buildQuestion()] },
      },
    ],
    ...overrides,
  };
}

describe('GET /api/lessons/[lessonId]/attempts/latest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'Student@Example.edu' }],
    } as Awaited<ReturnType<typeof currentUser>>);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'student-1' });
    mockPrisma.lesson.findUnique.mockResolvedValue({ passingPercent: 70 });
    mockPrisma.lessonAttempt.findFirst.mockResolvedValue(buildAttempt());
  });

  it('returns the signed-in student’s answers with the run’s grade', async () => {
    const response = await review();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.gradePercent).toBe(33.33);
    expect(body.passingPercent).toBe(70);
    expect(body.correctAnswers).toBe(1);
    expect(body.totalQuestions).toBe(3);
    expect(body.checkpoints).toHaveLength(1);
    expect(body.checkpoints[0].questions[0].isCorrect).toBe(false);
  });

  it('renders the prompt and the chosen option as rich text', async () => {
    const body = await (await review()).json();
    const question = body.checkpoints[0].questions[0];

    expect(question.promptHtml).toContain('<strong>2 + 2</strong>');
    expect(question.answerHtml).toEqual(['<p>Five</p>']);
  });

  // The whole point of the policy: a failed run is retried against these same
  // questions, so the key must never reach the browser.
  it('never serializes the correct answer', async () => {
    const raw = await (await review()).text();

    expect(raw).not.toContain('correctIndex');
    expect(raw).not.toContain('correctIndices');
    expect(raw).not.toContain('expectedAnswer');
    expect(raw).not.toContain('Four');
  });

  it('reads only the latest attempt, scoped to the signed-in student', async () => {
    await review();

    expect(mockPrisma.lessonAttempt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: 'student-1', lessonId: 'lesson-1' },
        orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      })
    );
  });

  // A failed run archives its responses; scoping by lessonAttemptId (not
  // archivedAt) is what keeps the failing case reviewable.
  it('does not filter out the archived answers of a failed run', async () => {
    await review();

    const [query] = mockPrisma.lessonAttempt.findFirst.mock.calls[0];
    expect(JSON.stringify(query)).not.toContain('archivedAt');
  });

  it('collapses a re-answered checkpoint to the student’s last answer', async () => {
    mockPrisma.lessonAttempt.findFirst.mockResolvedValue(
      buildAttempt({
        checkpointAttempts: [
          {
            completedAt: new Date('2026-09-05T11:40:00.000Z'),
            responses: [
              {
                questionId: 'question-1',
                selectedIndex: 1,
                selectedIndices: [1],
                numericAnswer: null,
                isCorrect: false,
              },
            ],
            checkpoint: { id: 'checkpoint-1', label: 'Checkpoint', sortOrder: 0, questions: [buildQuestion()] },
          },
          {
            completedAt: new Date('2026-09-05T11:55:00.000Z'),
            responses: [
              {
                questionId: 'question-1',
                selectedIndex: 0,
                selectedIndices: [0],
                numericAnswer: null,
                isCorrect: true,
              },
            ],
            checkpoint: { id: 'checkpoint-1', label: 'Checkpoint', sortOrder: 0, questions: [buildQuestion()] },
          },
        ],
      })
    );

    const body = await (await review()).json();
    const questions = body.checkpoints[0].questions;

    expect(questions).toHaveLength(1);
    expect(questions[0].isCorrect).toBe(true);
  });

  it('reports a short answer as the number the student entered', async () => {
    mockPrisma.lessonAttempt.findFirst.mockResolvedValue(
      buildAttempt({
        checkpointAttempts: [
          {
            completedAt: new Date('2026-09-05T11:50:00.000Z'),
            responses: [
              {
                questionId: 'question-1',
                selectedIndex: null,
                selectedIndices: null,
                numericAnswer: 12.5,
                isCorrect: true,
              },
            ],
            checkpoint: {
              id: 'checkpoint-1',
              label: null,
              sortOrder: 2,
              questions: [
                buildQuestion({
                  options: { type: 'shortAnswer', expectedAnswer: 12, tolerancePercent: 5 },
                  correctIndex: null,
                }),
              ],
            },
          },
        ],
      })
    );

    const body = await (await review()).json();

    expect(body.checkpoints[0].title).toBe('Checkpoint 3');
    expect(body.checkpoints[0].questions[0].answerHtml).toEqual(['<p>12.5</p>']);
  });

  it('404s before the student has finished a run', async () => {
    mockPrisma.lessonAttempt.findFirst.mockResolvedValue(null);

    expect((await review()).status).toBe(404);
  });

  it('401s an unauthenticated request', async () => {
    mockCurrentUser.mockResolvedValue(null as Awaited<ReturnType<typeof currentUser>>);

    expect((await review()).status).toBe(401);
  });
});
