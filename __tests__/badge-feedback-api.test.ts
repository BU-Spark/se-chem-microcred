/** @jest-environment node */

import { currentUser } from '@clerk/nextjs/server';
import { BadgeStatus } from '@prisma/client';

import { GET, POST } from '../app/api/badges/[badgeId]/feedback/route';
import prisma from '../lib/prisma';
import { isAlphaMode } from '../lib/adminAccess';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

// The route consults isAlphaMode() to suppress the LOCKED transition during alpha.
// Mock it so these tests control the flag explicitly rather than depend on the
// ambient ALPHA_MODE env value (.env sets it true).
jest.mock('../lib/adminAccess', () => ({
  __esModule: true,
  isAlphaMode: jest.fn(),
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
      count: jest.fn(),
    },
  },
}));

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockIsAlphaMode = isAlphaMode as jest.MockedFunction<typeof isAlphaMode>;
const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  studentBadge: { findUnique: jest.Mock; update: jest.Mock };
  assessmentAttempt: { findFirst: jest.Mock; count: jest.Mock };
};

function routeContext() {
  return {
    params: Promise.resolve({ badgeId: 'badge-1' }),
  };
}

const studentBadge = {
  id: 'student-badge-1',
  status: BadgeStatus.IN_REVIEW,
  score: 60,
  awardedAt: null,
  cooldownUntil: null,
  feedbackReviewedAt: null,
  // Per-student override that allows retries so a single fail routes back to
  // READY_FOR_ASSESSMENT rather than immediately LOCKED (systemDefault limit is 0).
  reassessmentLimit: 2,
  cooldownDays: 0,
  reassessmentRequired: false,
  badge: {
    id: 'badge-1',
    slug: 'burner-badge',
    name: 'Burner Badge',
    description: 'Use a burner safely.',
    reassessmentLimit: null,
    cooldownDays: null,
    reassessmentRequired: null,
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
    // Default to alpha off so these tests exercise the real locking logic; the
    // alpha-suppression case sets it true explicitly.
    mockIsAlphaMode.mockReturnValue(false);
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'student@example.edu' }],
    } as Awaited<ReturnType<typeof currentUser>>);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'student-1' });
    mockPrisma.studentBadge.findUnique.mockResolvedValue(studentBadge);
    mockPrisma.assessmentAttempt.findFirst.mockResolvedValue(failedAttempt);
    mockPrisma.assessmentAttempt.count.mockResolvedValue(1);
    mockPrisma.studentBadge.update.mockResolvedValue({
      status: BadgeStatus.READY_FOR_ASSESSMENT,
      cooldownUntil: null,
    });
  });

  it('returns the latest assessor rubric feedback for the signed-in student', async () => {
    const response = await GET(new Request('http://localhost/api/badges/badge-1/feedback'), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.rubric.goalName).toBe('Operate safely');
    // Cooldown + resolved effective policy travel to the client for the panel.
    expect(body.badge).toEqual(expect.objectContaining({ cooldownUntil: null, cooldownDays: 0 }));
    expect(body.latestAttempt.passed).toBe(false);
    expect(body.latestAttempt.responses).toEqual([
      expect.objectContaining({ subgoalText: 'Wear PPE', feedback: 'Goggles were missing.' }),
    ]);
  });

  it('applies the badge-authored cooldown automatically when the student has no override', async () => {
    // The instructor set a 3-day cooldown at badge creation; the student has no
    // per-student override, so the effective cooldown inherits the badge's value.
    mockPrisma.studentBadge.findUnique.mockResolvedValue({
      ...studentBadge,
      cooldownDays: null,
      badge: { ...studentBadge.badge, cooldownDays: 3 },
    });

    const before = Date.now();
    const response = await POST(new Request('http://localhost/api/badges/badge-1/feedback'), routeContext());

    expect(response.status).toBe(200);
    const updateArg = mockPrisma.studentBadge.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe(BadgeStatus.READY_FOR_ASSESSMENT);
    // cooldownUntil lands ~3 days out (allow a little slack for test execution).
    const dayMs = 24 * 60 * 60 * 1000;
    const cooldownMs = new Date(updateArg.data.cooldownUntil).getTime() - before;
    expect(cooldownMs).toBeGreaterThan(3 * dayMs - 5000);
    expect(cooldownMs).toBeLessThanOrEqual(3 * dayMs + 5000);
  });

  it('acknowledges a failed in-review badge back to ready when retries remain', async () => {
    const response = await POST(new Request('http://localhost/api/badges/badge-1/feedback'), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe(BadgeStatus.READY_FOR_ASSESSMENT);
    expect(mockPrisma.studentBadge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'student-badge-1' },
        data: expect.objectContaining({
          status: BadgeStatus.READY_FOR_ASSESSMENT,
          cooldownUntil: null,
          feedbackReviewedAt: expect.any(Date),
        }),
      })
    );
  });

  it('locks the badge when the failed attempt exhausts the reassessment budget', async () => {
    // reassessmentLimit 2 => total allowed 3; the 3rd failed attempt (count 3) locks.
    mockPrisma.assessmentAttempt.count.mockResolvedValue(3);
    mockPrisma.studentBadge.update.mockResolvedValue({ status: BadgeStatus.LOCKED, cooldownUntil: null });

    const response = await POST(new Request('http://localhost/api/badges/badge-1/feedback'), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe(BadgeStatus.LOCKED);
    expect(mockPrisma.studentBadge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: BadgeStatus.LOCKED, cooldownUntil: null }),
      })
    );
  });

  it('suppresses the lock and stays retryable when alpha mode is on', async () => {
    mockIsAlphaMode.mockReturnValue(true);
    // Budget exhausted (count 3 > limit 2): without alpha this would LOCK.
    mockPrisma.assessmentAttempt.count.mockResolvedValue(3);
    mockPrisma.studentBadge.update.mockResolvedValue({
      status: BadgeStatus.READY_FOR_ASSESSMENT,
      cooldownUntil: null,
    });

    const response = await POST(new Request('http://localhost/api/badges/badge-1/feedback'), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe(BadgeStatus.READY_FOR_ASSESSMENT);
    expect(mockPrisma.studentBadge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: BadgeStatus.READY_FOR_ASSESSMENT }),
      })
    );
  });

  it('does not acknowledge a badge with no failed assessment feedback', async () => {
    mockPrisma.assessmentAttempt.findFirst.mockResolvedValue(null);
    mockPrisma.assessmentAttempt.count.mockResolvedValue(0);

    const response = await POST(new Request('http://localhost/api/badges/badge-1/feedback'), routeContext());

    expect(response.status).toBe(409);
    expect(mockPrisma.studentBadge.update).not.toHaveBeenCalled();
  });
});
