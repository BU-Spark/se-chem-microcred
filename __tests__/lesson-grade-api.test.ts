/** @jest-environment node */

import { currentUser } from '@clerk/nextjs/server';
import { BadgeStatus } from '@prisma/client';

import { POST } from '../app/api/lessons/[lessonId]/grade/route';
import { computeLessonGrade } from '../lib/lessonGrading';
import prisma from '../lib/prisma';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

jest.mock('../lib/lessonGrading', () => ({
  computeLessonGrade: jest.fn(),
}));

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
    },
    lesson: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockComputeLessonGrade = computeLessonGrade as jest.MockedFunction<typeof computeLessonGrade>;
const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  lesson: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};

function gradeLesson(lessonId = 'lesson-1') {
  return POST(new Request(`http://localhost/api/lessons/${lessonId}/grade`, { method: 'POST' }), {
    params: Promise.resolve({ lessonId }),
  });
}

describe('POST /api/lessons/[lessonId]/grade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'student@example.edu' }],
    } as Awaited<ReturnType<typeof currentUser>>);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'student-1' });
    mockPrisma.lesson.findUnique.mockResolvedValue({
      id: 'lesson-1',
      passingPercent: 70,
      checkpoints: [{ id: 'checkpoint-1' }],
    });
  });

  it('keeps the badge learning when the QEV grade is below the passing threshold', async () => {
    const tx = {
      lessonProgress: {
        upsert: jest.fn().mockResolvedValue({ id: 'progress-1' }),
        update: jest.fn().mockResolvedValue({ id: 'progress-1' }),
        findMany: jest.fn().mockResolvedValue([{ lessonId: 'lesson-1', status: 'IN_PROGRESS', percentComplete: 0 }]),
      },
      lessonAttempt: {
        create: jest.fn().mockResolvedValue({ id: 'lesson-attempt-1' }),
      },
      checkpointResponse: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      checkpointAttempt: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      segmentProgress: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      studentBadge: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      badgeRequirement: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockComputeLessonGrade.mockResolvedValue({ totalQuestions: 10, correctAnswers: 6, percent: 60 });
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const response = await gradeLesson();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        passed: false,
        gradePercent: 60,
        passingPercent: 70,
      })
    );

    // The failed run is sealed into a LessonAttempt and archived (not deleted), so
    // it stays as history for the instructor while the student retries fresh.
    expect(tx.lessonAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ passed: false, gradePercent: 60 }) })
    );
    expect(tx.checkpointAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { archivedAt: expect.any(Date) } })
    );
    expect(tx.checkpointResponse.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { archivedAt: expect.any(Date) } })
    );

    expect(tx.studentBadge.updateMany).toHaveBeenCalledWith({
      where: {
        studentId: 'student-1',
        status: BadgeStatus.READY_FOR_ASSESSMENT,
        badge: {
          requirements: {
            some: { lessonId: 'lesson-1' },
          },
        },
      },
      data: { status: BadgeStatus.LEARNING, qevPassedAt: null, cooldownUntil: null },
    });
  });
});
