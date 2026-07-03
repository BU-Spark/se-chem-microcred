/** @jest-environment node */

import { currentUser } from '@clerk/nextjs/server';
import { BadgeStatus } from '@prisma/client';

import { GET, POST } from '../app/api/badges/[badgeId]/feedback/route';
import prisma from '../lib/prisma';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
    },
    studentBadge: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    assessmentAttempt: {
      findFirst: jest.fn(),
    },
  },
}));

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  studentBadge: { findUnique: jest.Mock; update: jest.Mock };
  assessmentAttempt: { findFirst: jest.Mock };
};

function routeContext() {
  return {
    params: Promise.resolve({ badgeId: 'badge-1' }),
  };
}

const studentBadge = {
  id: 'student-badge-1',
  status: BadgeStatus.LEARNING,
  score: 60,
  awardedAt: null,
  badge: {
    id: 'badge-1',
    slug: 'burner-badge',
    name: 'Burner Badge',
    description: 'Use a burner safely.',
    rubricGoal: {
      id: 'goal-1',
      name: 'Operate safely',
      totalPoints: 5,
      passThreshold: 4,
      subgoals: [{ id: 'subgoal-1', text: 'Wear PPE', points: 2, sortOrder: 0 }],
    },
  },
};

const failedAttempt = {
  id: 'attempt-1',
  passed: false,
  score: 40,
  pointsEarned: 2,
  pointsPossible: 5,
  feedback: 'Review PPE expectations.',
  completedAt: new Date('2026-07-02T12:00:00.000Z'),
  assessor: {
    name: 'Assessor Demo',
    email: 'assessor@example.edu',
  },
  responses: [
    {
      id: 'response-1',
      subgoalText: 'Wear PPE',
      points: 2,
      passed: false,
      feedback: 'Goggles were missing.',
      isOverride: false,
      sortOrder: 0,
    },
  ],
};

describe('/api/badges/[badgeId]/feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'student@example.edu' }],
    } as Awaited<ReturnType<typeof currentUser>>);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'student-1' });
    mockPrisma.studentBadge.findUnique.mockResolvedValue(studentBadge);
    mockPrisma.assessmentAttempt.findFirst.mockResolvedValue(failedAttempt);
    mockPrisma.studentBadge.update.mockResolvedValue({ status: BadgeStatus.READY_FOR_ASSESSMENT });
  });

  it('returns the latest assessor rubric feedback for the signed-in student', async () => {
    const response = await GET(new Request('http://localhost/api/badges/badge-1/feedback'), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.rubric.goalName).toBe('Operate safely');
    expect(body.latestAttempt.passed).toBe(false);
    expect(body.latestAttempt.responses).toEqual([
      expect.objectContaining({ subgoalText: 'Wear PPE', feedback: 'Goggles were missing.' }),
    ]);
  });

  it('moves a failed learning badge back to ready after feedback review', async () => {
    const response = await POST(new Request('http://localhost/api/badges/badge-1/feedback'), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe(BadgeStatus.READY_FOR_ASSESSMENT);
    expect(mockPrisma.studentBadge.update).toHaveBeenCalledWith({
      where: { id: 'student-badge-1' },
      data: { status: BadgeStatus.READY_FOR_ASSESSMENT },
      select: { status: true },
    });
  });

  it('does not move ordinary learning badges without failed assessment feedback', async () => {
    mockPrisma.assessmentAttempt.findFirst.mockResolvedValue(null);

    const response = await POST(new Request('http://localhost/api/badges/badge-1/feedback'), routeContext());

    expect(response.status).toBe(409);
    expect(mockPrisma.studentBadge.update).not.toHaveBeenCalled();
  });
});
