/** @jest-environment node */

import { currentUser } from '@clerk/nextjs/server';

import { POST } from '../app/api/lessons/[lessonId]/start/route';
import { findLessonPrerequisiteLock } from '../lib/badges/badge-prerequisites.service';
import prisma from '../lib/prisma';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

jest.mock('../lib/badgeProgress', () => ({
  syncLessonBadgesForStudent: jest.fn(),
}));

jest.mock('../lib/badges/badge-prerequisites.service', () => ({
  ...jest.requireActual('../lib/badges/badge-prerequisites.service'),
  findLessonPrerequisiteLock: jest.fn(),
}));

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
    lesson: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockFindLock = findLessonPrerequisiteLock as jest.MockedFunction<typeof findLessonPrerequisiteLock>;
const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  lesson: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};

function startLesson(lessonId = 'lesson-b') {
  return POST(new Request(`http://localhost/api/lessons/${lessonId}/start`, { method: 'POST' }), {
    params: Promise.resolve({ lessonId }),
  });
}

describe('POST /api/lessons/[lessonId]/start prerequisite gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'student@example.edu' }],
    } as Awaited<ReturnType<typeof currentUser>>);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'student-1' });
    mockPrisma.lesson.findUnique.mockResolvedValue({ id: 'lesson-b', dueDate: null, badgeRequirements: [] });
    mockPrisma.$transaction.mockResolvedValue(undefined);
  });

  it('refuses to start a badge whose prerequisite is not completed', async () => {
    mockFindLock.mockResolvedValue([{ id: 'a-copy', name: 'Gas Safety' }]);

    const response = await startLesson();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Complete Gas Safety first.',
      requires: [{ id: 'a-copy', name: 'Gas Safety' }],
    });
    expect(mockFindLock).toHaveBeenCalledWith(prisma, { studentId: 'student-1', lessonId: 'lesson-b' });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('starts the lesson when nothing is locking it', async () => {
    mockFindLock.mockResolvedValue(null);

    const response = await startLesson();

    expect(response.status).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});
