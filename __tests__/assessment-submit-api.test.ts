/** @jest-environment node */

import { NextRequest } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

import { GET, POST } from '../app/api/courses/[courseId]/students/[studentId]/badges/[badgeId]/route';
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
    assessmentAttempt: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockFetchUserByEmail = fetchUserByEmail as jest.MockedFunction<typeof fetchUserByEmail>;
const mockPrisma = prisma as unknown as {
  course: { findFirst: jest.Mock };
  rubricGoal: { findUnique: jest.Mock };
  assessmentAttempt: { findMany: jest.Mock };
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

// A student who cleared the lesson's passingPercent below 100% — their badge is
// READY_FOR_ASSESSMENT but not every checkpoint has a fully-correct (isPassing) attempt.
function subHundredCourseFixture(badgeStatus: string) {
  const fixture = courseFixture(badgeStatus);
  fixture.lessons = [{ checkpoints: [{ attempts: [] as Array<{ id: string }> }] }];
  return fixture;
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

  it('allows assessing a READY_FOR_ASSESSMENT student who passed the lesson below 100%', async () => {
    // Regression: the assessor route used to require every checkpoint to have a
    // passing (all-correct) attempt, blocking any pass under 100%. Readiness is
    // now owned by the badge status, so a sub-100% pass is assessable.
    mockPrisma.course.findFirst.mockResolvedValue(subHundredCourseFixture('READY_FOR_ASSESSMENT'));

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

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.status).toBe('READY_FOR_FINALIZATION');
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it('rejects assessment while the badge is still LEARNING (precheck incomplete)', async () => {
    mockPrisma.course.findFirst.mockResolvedValue(subHundredCourseFixture('LEARNING'));

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
    await expect(response.json()).resolves.toEqual({ error: 'Student has not completed the badge precheck.' });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
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

// Regression for #96: the assessor's Answer History must show what the student
// actually answered — option text for multiple choice (including the newer
// object-shaped options JSON) and the persisted numeric value for short answers.
describe('GET /api/courses/[courseId]/students/[studentId]/badges/[badgeId]', () => {
  function answerHistoryCourseFixture() {
    return {
      createdById: 'assessor-1',
      settings: { allowCrossSectionView: true },
      lessons: [
        {
          id: 'lesson-1',
          title: 'Bunsen Burner Lesson',
          sortOrder: 0,
          badgeRequirements: [{ id: 'requirement-1' }],
          checkpoints: [
            {
              id: 'checkpoint-1',
              title: 'Burner Basics',
              label: 'Checkpoint',
              sortOrder: 0,
              questions: [
                {
                  id: 'question-mcq',
                  prompt: 'What flame color is safest?',
                  options: { type: 'multipleChoice', options: ['Blue', 'Yellow', 'Orange'], correctIndices: [0] },
                  correctIndex: null,
                },
                {
                  id: 'question-multi',
                  prompt: 'Which are safety steps?',
                  options: {
                    type: 'multipleChoice',
                    options: ['Goggles', 'Open flame', 'Tie hair back'],
                    correctIndices: [0, 2],
                  },
                  correctIndex: null,
                },
                {
                  id: 'question-numeric',
                  prompt: 'How many mL?',
                  options: { type: 'shortAnswer', expectedAnswer: 25, tolerancePercent: 10 },
                  correctIndex: null,
                },
                {
                  id: 'question-numeric-legacy',
                  prompt: 'How many grams?',
                  options: { type: 'shortAnswer', expectedAnswer: 5, tolerancePercent: 0 },
                  correctIndex: null,
                },
              ],
              attempts: [
                {
                  id: 'attempt-1',
                  createdAt: new Date('2026-01-02T00:00:00.000Z'),
                  completedAt: new Date('2026-01-02T00:05:00.000Z'),
                  isPassing: false,
                  responses: [
                    {
                      id: 'response-mcq',
                      questionId: 'question-mcq',
                      selectedIndex: 1,
                      selectedIndices: [1],
                      numericAnswer: null,
                      isCorrect: false,
                    },
                    {
                      id: 'response-multi',
                      questionId: 'question-multi',
                      selectedIndex: 0,
                      selectedIndices: [0, 2],
                      numericAnswer: null,
                      isCorrect: true,
                    },
                    {
                      id: 'response-numeric',
                      questionId: 'question-numeric',
                      selectedIndex: null,
                      selectedIndices: null,
                      numericAnswer: 24.5,
                      isCorrect: true,
                    },
                    // Row written before numericAnswer existed — nothing recoverable.
                    {
                      id: 'response-numeric-legacy',
                      questionId: 'question-numeric-legacy',
                      selectedIndex: null,
                      selectedIndices: null,
                      numericAnswer: null,
                      isCorrect: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      enrollments: [
        {
          role: 'STUDENT',
          status: 'ACTIVE',
          sections: [{ section: 'A1' }],
          student: {
            id: 'student-1',
            badgeProgress: [
              {
                id: 'progress-1',
                status: 'READY_FOR_ASSESSMENT',
                awardedAt: null,
                score: null,
                reassessmentLimit: null,
                cooldownDays: null,
                reassessmentRequired: null,
                badge: {
                  id: 'badge-1',
                  slug: 'bunsen-burner',
                  name: 'Bunsen Burner Badge',
                  description: 'Burner safety',
                  category: 'EQUIPMENT',
                },
              },
            ],
          },
        },
      ],
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'assessor@example.edu' }],
    } as Awaited<ReturnType<typeof currentUser>>);
    mockFetchUserByEmail.mockResolvedValue({ id: 'assessor-1' } as Awaited<ReturnType<typeof fetchUserByEmail>>);
    mockPrisma.course.findFirst.mockResolvedValue(answerHistoryCourseFixture());
    mockPrisma.rubricGoal.findUnique.mockResolvedValue(rubricGoalFixture);
    mockPrisma.assessmentAttempt.findMany.mockResolvedValue([]);
  });

  it('renders answered text from option labels and persisted numeric answers', async () => {
    const request = new NextRequest(
      'http://localhost/api/courses/course-1/students/student-1/badges/badge-1?email=assessor%40example.edu'
    );

    const response = (await GET(request, submitParams())) as Response;

    expect(response.status).toBe(200);
    const body = await response.json();

    const questions = body.checkpoints[0].questions;
    const answeredTextByQuestionId = new Map<string, string>(
      questions.map((question: { id: string; attempts: Array<{ answeredText: string }> }) => [
        question.id,
        question.attempts[0]?.answeredText,
      ])
    );

    expect(answeredTextByQuestionId.get('question-mcq')).toBe('Yellow');
    expect(answeredTextByQuestionId.get('question-multi')).toBe('Goggles, Tie hair back');
    expect(answeredTextByQuestionId.get('question-numeric')).toBe('24.5');
    expect(answeredTextByQuestionId.get('question-numeric-legacy')).toBe('No answer recorded');
  });
});
