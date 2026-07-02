/** @jest-environment node */

import { NextRequest } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

import { POST } from '../app/api/courses/[courseId]/students/[studentId]/badges/[badgeId]/route';
import { fetchUserByEmail } from '../app/api/courses/lib/course-queries';
import prisma from '../lib/prisma';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

jest.mock('../app/api/courses/lib/course-queries', () => ({
  fetchUserByEmail: jest.fn(),
}));

const mockTx = {
  assessmentAttempt: { create: jest.fn() },
  studentBadge: { update: jest.fn() },
};

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    course: {
      findFirst: jest.fn(),
    },
    rubricGoal: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockFetchUserByEmail = fetchUserByEmail as jest.MockedFunction<typeof fetchUserByEmail>;
const mockPrisma = prisma as unknown as {
  course: { findFirst: jest.Mock };
  rubricGoal: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};

function assessmentRequest(body: unknown) {
  return new NextRequest(
    'http://localhost/api/courses/course-1/students/student-1/badges/badge-1?email=assessor@example.edu',
    {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

function courseFixture(badgeStatus: string) {
  return {
    id: 'course-1',
    createdById: 'creator-1',
    settings: { allowCrossSectionView: true },
    enrollments: [
      {
        role: 'CHECKER',
        status: 'ACTIVE',
        sections: [{ section: 'A1' }],
        student: { id: 'assessor-1', badgeProgress: [] },
      },
      {
        role: 'STUDENT',
        status: 'ACTIVE',
        sections: [{ section: 'A1' }],
        student: {
          id: 'student-1',
          badgeProgress: [{ id: 'progress-1', status: badgeStatus }],
        },
      },
    ],
    lessons: [
      {
        checkpoints: [{ attempts: [{ id: 'attempt-1' }] }],
      },
    ],
  };
}

const rubricGoalFixture = {
  id: 'goal-1',
  name: 'Perform the experiment safely',
  totalPoints: 5,
  passThreshold: 3,
  subgoals: [
    { id: 'subgoal-1', text: 'Wears PPE', points: 2, sortOrder: 0 },
    { id: 'subgoal-2', text: 'Follows procedure', points: 3, sortOrder: 1 },
  ],
};

function submitParams() {
  return {
    params: Promise.resolve({ courseId: 'course-1', studentId: 'student-1', badgeId: 'badge-1' }),
  };
}

describe('POST /api/courses/[courseId]/students/[studentId]/badges/[badgeId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'assessor@example.edu' }],
    } as Awaited<ReturnType<typeof currentUser>>);
    mockFetchUserByEmail.mockResolvedValue({ id: 'assessor-1' } as Awaited<ReturnType<typeof fetchUserByEmail>>);
    mockPrisma.rubricGoal.findUnique.mockResolvedValue(rubricGoalFixture);
    mockPrisma.$transaction.mockImplementation((callback) => callback(mockTx));
    mockTx.assessmentAttempt.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'attempt-1',
        passed: data.passed,
        score: data.score,
        pointsEarned: data.pointsEarned,
        pointsPossible: data.pointsPossible,
        feedback: data.feedback,
        completedAt: data.completedAt,
      })
    );
    mockTx.studentBadge.update.mockImplementation(({ data }) => Promise.resolve({ status: data.status }));
  });

  it('rejects stale assessment submissions after a badge has already been assessed', async () => {
    mockPrisma.course.findFirst.mockResolvedValue(courseFixture('READY_FOR_FINALIZATION'));

    const response = await POST(
      assessmentRequest({
        passed: true,
        subgoals: [
          { subgoalId: 'subgoal-1', passed: true },
          { subgoalId: 'subgoal-2', passed: true },
        ],
        override: null,
      }),
      submitParams()
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'This badge has already been assessed.' });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('computes the score from passed subgoal points and snapshots response rows', async () => {
    mockPrisma.course.findFirst.mockResolvedValue(courseFixture('READY_FOR_ASSESSMENT'));

    const response = await POST(
      assessmentRequest({
        passed: true,
        subgoals: [
          { subgoalId: 'subgoal-1', passed: false, feedback: 'Forgot goggles at first.' },
          { subgoalId: 'subgoal-2', passed: true },
        ],
        override: null,
      }),
      submitParams()
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    // 3 of 5 points, threshold 3 => suggested pass matches the submitted pass.
    expect(body.attempt).toEqual(
      expect.objectContaining({ passed: true, score: 60, pointsEarned: 3, pointsPossible: 5 })
    );
    expect(body.status).toBe('READY_FOR_FINALIZATION');

    const createCall = mockTx.assessmentAttempt.create.mock.calls[0][0];
    expect(createCall.data.responses.create).toEqual([
      expect.objectContaining({
        subgoalId: 'subgoal-1',
        subgoalText: 'Wears PPE',
        points: 2,
        passed: false,
        feedback: 'Forgot goggles at first.',
        isOverride: false,
        sortOrder: 0,
      }),
      expect.objectContaining({
        subgoalId: 'subgoal-2',
        subgoalText: 'Follows procedure',
        points: 3,
        passed: true,
        feedback: null,
        isOverride: false,
        sortOrder: 1,
      }),
    ]);
    expect(mockTx.studentBadge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'progress-1' },
        data: { status: 'READY_FOR_FINALIZATION', score: 60 },
      })
    );
  });

  it('rejects flipping the suggested outcome without override feedback', async () => {
    mockPrisma.course.findFirst.mockResolvedValue(courseFixture('READY_FOR_ASSESSMENT'));

    const response = await POST(
      assessmentRequest({
        // Full marks suggest a pass, but the assessor fails the student with
        // no override justification.
        passed: false,
        subgoals: [
          { subgoalId: 'subgoal-1', passed: true },
          { subgoalId: 'subgoal-2', passed: true },
        ],
        override: null,
      }),
      submitParams()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Overriding the score-suggested outcome requires override feedback.',
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('records an override row when the assessor fails a full-marks student with justification', async () => {
    mockPrisma.course.findFirst.mockResolvedValue(courseFixture('READY_FOR_ASSESSMENT'));

    const response = await POST(
      assessmentRequest({
        passed: false,
        subgoals: [
          { subgoalId: 'subgoal-1', passed: true },
          { subgoalId: 'subgoal-2', passed: true },
        ],
        override: { feedback: 'Spilled acid and did not report it.' },
      }),
      submitParams()
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.attempt).toEqual(
      expect.objectContaining({ passed: false, score: 100, pointsEarned: 5, pointsPossible: 5 })
    );
    expect(body.status).toBe('LEARNING');

    const createCall = mockTx.assessmentAttempt.create.mock.calls[0][0];
    expect(createCall.data.feedback).toBe('Spilled acid and did not report it.');
    expect(createCall.data.responses.create).toContainEqual(
      expect.objectContaining({
        subgoalId: null,
        subgoalText: 'Assessor override',
        points: 0,
        passed: false,
        feedback: 'Spilled acid and did not report it.',
        isOverride: true,
        sortOrder: 2,
      })
    );
  });

  it('rejects submissions that do not cover the rubric subgoals exactly', async () => {
    mockPrisma.course.findFirst.mockResolvedValue(courseFixture('READY_FOR_ASSESSMENT'));

    const response = await POST(
      assessmentRequest({
        passed: true,
        subgoals: [{ subgoalId: 'unknown-subgoal', passed: true }],
        override: null,
      }),
      submitParams()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Assessment must cover each rubric subgoal exactly once.',
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
