/** @jest-environment node */

import { currentUser } from '@clerk/nextjs/server';

import { POST } from '../app/api/checkpoints/[checkpointId]/attempt/route';
import { syncLessonBadgesForStudent } from '../lib/badgeProgress';
import prisma from '../lib/prisma';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

jest.mock('../lib/badgeProgress', () => ({
  syncLessonBadgesForStudent: jest.fn(),
}));

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
    },
    lessonCheckpoint: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockSync = syncLessonBadgesForStudent as jest.MockedFunction<typeof syncLessonBadgesForStudent>;
const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  lessonCheckpoint: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};

function submitAttempt(body: Record<string, unknown>, checkpointId = 'checkpoint-1') {
  return POST(
    new Request(`http://localhost/api/checkpoints/${checkpointId}/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ checkpointId }) }
  );
}

describe('POST /api/checkpoints/[checkpointId]/attempt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'student@example.edu' }],
    } as Awaited<ReturnType<typeof currentUser>>);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'student-1' });
    mockPrisma.lessonCheckpoint.findUnique.mockResolvedValue({
      id: 'checkpoint-1',
      lessonId: 'lesson-1',
      segmentId: 'segment-1',
      questions: [
        {
          id: 'question-1',
          prompt: 'Pick A',
          correctIndex: 0,
          options: { type: 'multipleChoice', options: ['A', 'B'], correctIndices: [0] },
        },
      ],
      lesson: { id: 'lesson-1' },
    });
  });

  const correctAnswer = {
    answers: [{ questionId: 'question-1', selectedIndex: 0, selectedIndices: [0], numericAnswer: null }],
  };

  it('grades a practice attempt for feedback without persisting anything', async () => {
    const response = await submitAttempt({ ...correctAnswer, practice: true });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ attemptId: null, isPassing: true, practice: true })
    );
    // Practice must not touch the recorded grade/badge state.
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('persists a real (non-practice) attempt', async () => {
    mockPrisma.$transaction.mockResolvedValue({ id: 'attempt-1', responses: [] });

    const response = await submitAttempt(correctAnswer);

    expect(response.status).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
