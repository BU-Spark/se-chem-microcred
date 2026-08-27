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
      count: jest.fn(),
    },
  },
}));

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
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
  // Per-student override, deliberately tighter than the system default of 3 so the
  // lock-out case below is reachable with a small attempt count.
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
  checker: {
    name: 'Checker Demo',
    email: 'checker@example.edu',
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
    mockPrisma.assessmentAttempt.count.mockResolvedValue(1);
    mockPrisma.studentBadge.update.mockResolvedValue({
      status: BadgeStatus.READY_FOR_ASSESSMENT,
      cooldownUntil: null,
    });
  });

  it('returns the latest checker rubric feedback for the signed-in student', async () => {
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

  // A checker override downgrades a passing result to "still learning" and records a
  // failing attempt. That is a real assessment outcome, not a clerical correction, so
  // it spends an attempt like any other fail. Do NOT add an isOverride exclusion to
  // the count below: the checker override and the instructor's roster-level grade
  // override both write isOverride rows, so exempting them here would silently hand
  // the student unlimited retries.
  it('spends a reassessment attempt when the fail came from a checker override', async () => {
    mockPrisma.assessmentAttempt.findFirst.mockResolvedValue({
      ...failedAttempt,
      responses: [
        {
          id: 'response-override',
          subgoalText: 'Checker override',
          points: 0,
          passed: false,
          feedback: 'Spilled acid and did not report it.',
          isOverride: true,
          sortOrder: 1,
        },
      ],
    });
    // reassessmentLimit 2 => total allowed 3; this override is the 3rd fail.
    mockPrisma.assessmentAttempt.count.mockResolvedValue(3);
    mockPrisma.studentBadge.update.mockResolvedValue({ status: BadgeStatus.LOCKED, cooldownUntil: null });

    const response = await POST(new Request('http://localhost/api/badges/badge-1/feedback'), routeContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe(BadgeStatus.LOCKED);

    // The budget counts every failed attempt; overrides are not filtered out.
    expect(mockPrisma.assessmentAttempt.count).toHaveBeenCalledWith({
      where: { studentId: 'student-1', badgeId: 'badge-1', passed: false },
    });
  });

  it('does not acknowledge a badge with no failed assessment feedback', async () => {
    mockPrisma.assessmentAttempt.findFirst.mockResolvedValue(null);
    mockPrisma.assessmentAttempt.count.mockResolvedValue(0);

    const response = await POST(new Request('http://localhost/api/badges/badge-1/feedback'), routeContext());

    expect(response.status).toBe(409);
    expect(mockPrisma.studentBadge.update).not.toHaveBeenCalled();
  });
});
