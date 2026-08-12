/** @jest-environment node */

import { NextRequest } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

import { PATCH } from '../app/api/courses/[courseId]/students/[studentId]/badges/[badgeId]/route';
import { fetchUserByEmail } from '../app/api/courses/lib/course-queries';
import prisma from '../lib/prisma';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

jest.mock('../app/api/courses/lib/course-queries', () => ({
  fetchUserByEmail: jest.fn(),
}));

// The reset and override paths run inside $transaction; the waiver and the
// read-side lookups go straight to the client. Both surfaces are mocked so the
// suite never needs a DATABASE_URL.
const mockTx = {
  assessmentAttempt: { create: jest.fn(), deleteMany: jest.fn() },
  surveyResponse: { deleteMany: jest.fn() },
  checkpointResponse: { deleteMany: jest.fn() },
  checkpointAttempt: { deleteMany: jest.fn() },
  lessonAttempt: { deleteMany: jest.fn() },
  segmentProgress: { deleteMany: jest.fn() },
  lessonProgress: { deleteMany: jest.fn() },
  studentBadge: { update: jest.fn() },
};

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: {
    course: { findFirst: jest.fn() },
    badgeRequirement: { findMany: jest.fn() },
    studentBadge: { update: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockFetchUserByEmail = fetchUserByEmail as jest.MockedFunction<typeof fetchUserByEmail>;
const mockPrisma = prisma as unknown as {
  course: { findFirst: jest.Mock };
  badgeRequirement: { findMany: jest.Mock };
  studentBadge: { update: jest.Mock };
  $transaction: jest.Mock;
};

function actionRequest(body: unknown) {
  return new NextRequest(
    'http://localhost/api/courses/course-1/students/student-1/badges/badge-1?email=prof@example.edu',
    {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

function actionParams() {
  return { params: Promise.resolve({ courseId: 'course-1', studentId: 'student-1', badgeId: 'badge-1' }) };
}

// Viewer (prof-1) is an active INSTRUCTOR; the target student holds one badge row.
function courseFixture({
  viewerRole = 'INSTRUCTOR',
  status = 'READY_FOR_ASSESSMENT',
  qevWaivedAt = null,
}: { viewerRole?: string; status?: string; qevWaivedAt?: Date | null } = {}) {
  return {
    id: 'course-1',
    createdById: 'creator-1',
    settings: { allowCrossSectionView: true, allowCooldownOverride: false },
    enrollments: [
      {
        role: viewerRole,
        status: 'ACTIVE',
        sections: [{ section: 'A1' }],
        student: { id: 'prof-1', badgeProgress: [] },
      },
      {
        role: 'STUDENT',
        status: 'ACTIVE',
        sections: [{ section: 'A1' }],
        student: {
          id: 'student-1',
          badgeProgress: [{ id: 'progress-1', status, qevWaivedAt, badge: { name: 'Titration' } }],
        },
      },
    ],
  };
}

describe('instructor student actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'prof@example.edu' }],
    } as Awaited<ReturnType<typeof currentUser>>);
    mockFetchUserByEmail.mockResolvedValue({ id: 'prof-1' } as Awaited<ReturnType<typeof fetchUserByEmail>>);
    mockPrisma.course.findFirst.mockResolvedValue(courseFixture());
    mockPrisma.$transaction.mockImplementation((callback: (tx: typeof mockTx) => unknown) => callback(mockTx));
    mockTx.assessmentAttempt.deleteMany.mockResolvedValue({ count: 2 });
    mockTx.surveyResponse.deleteMany.mockResolvedValue({ count: 1 });
    mockTx.studentBadge.update.mockImplementation(({ data }) => Promise.resolve(data));
    mockPrisma.studentBadge.update.mockImplementation(({ data }) => Promise.resolve(data));
    mockPrisma.badgeRequirement.findMany.mockResolvedValue([
      { lesson: { id: 'lesson-1', title: 'Titrating an acid' } },
    ]);
  });

  describe('permissions', () => {
    it.each([
      ['RESET_PROGRESS', { action: 'RESET_PROGRESS', confirmBadgeName: 'Titration' }],
      ['WAIVE_QEV', { action: 'WAIVE_QEV' }],
      ['OVERRIDE_GRADE', { action: 'OVERRIDE_GRADE', passed: true, reason: 'Assessed on paper' }],
    ])('refuses %s from a checker', async (_name, body) => {
      mockPrisma.course.findFirst.mockResolvedValue(courseFixture({ viewerRole: 'CHECKER' }));

      const response = await PATCH(actionRequest(body), actionParams());

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: 'Only instructors can perform student actions on a badge.',
      });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.studentBadge.update).not.toHaveBeenCalled();
    });

    it('rejects an unrecognised action rather than falling through to a config edit', async () => {
      const response = await PATCH(actionRequest({ action: 'DELETE_STUDENT' }), actionParams());

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Unknown student action.' });
    });

    it('still applies an ordinary config edit, which carries no action', async () => {
      const response = await PATCH(actionRequest({ reassessmentLimit: 3 }), actionParams());

      expect(response.status).toBe(200);
      expect(mockPrisma.studentBadge.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reassessmentLimit: 3 }) })
      );
    });
  });

  describe('reset progress', () => {
    const resetBody = { action: 'RESET_PROGRESS', confirmBadgeName: 'Titration', acknowledgeSharedBadges: true };

    it('requires the typed badge name to match', async () => {
      const response = await PATCH(
        actionRequest({ action: 'RESET_PROGRESS', confirmBadgeName: 'Distillation' }),
        actionParams()
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'The badge name you typed does not match.' });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('accepts the typed name in any case', async () => {
      mockPrisma.badgeRequirement.findMany.mockResolvedValue([]);

      const response = await PATCH(
        actionRequest({ action: 'RESET_PROGRESS', confirmBadgeName: 'titration' }),
        actionParams()
      );

      expect(response.status).toBe(200);
    });

    it('refuses to proceed unacknowledged when another badge shares the lessons', async () => {
      mockPrisma.badgeRequirement.findMany
        .mockResolvedValueOnce([{ lesson: { id: 'lesson-1', title: 'Titrating an acid' } }])
        .mockResolvedValueOnce([{ badge: { id: 'badge-2', name: 'Distillation' } }]);

      const response = await PATCH(
        actionRequest({ action: 'RESET_PROGRESS', confirmBadgeName: 'Titration' }),
        actionParams()
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: 'These lessons are also required by other badges, whose progress would be reset too.',
        sharedBadges: [{ id: 'badge-2', name: 'Distillation' }],
      });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('deletes attempts before lesson rows, and children before parents', async () => {
      const order: string[] = [];
      const record = (label: string) => () => {
        order.push(label);
        return Promise.resolve({ count: 1 });
      };
      mockTx.assessmentAttempt.deleteMany.mockImplementation(record('assessmentAttempt'));
      mockTx.checkpointResponse.deleteMany.mockImplementation(record('checkpointResponse'));
      mockTx.checkpointAttempt.deleteMany.mockImplementation(record('checkpointAttempt'));
      mockTx.lessonAttempt.deleteMany.mockImplementation(record('lessonAttempt'));
      mockTx.segmentProgress.deleteMany.mockImplementation(record('segmentProgress'));
      mockTx.lessonProgress.deleteMany.mockImplementation(record('lessonProgress'));

      const response = await PATCH(actionRequest(resetBody), actionParams());

      expect(response.status).toBe(200);
      expect(order).toEqual([
        'assessmentAttempt',
        'checkpointResponse',
        'checkpointAttempt',
        'lessonAttempt',
        'segmentProgress',
        'lessonProgress',
      ]);
    });

    it('resets the badge row in place instead of deleting it, and keeps policy overrides', async () => {
      await PATCH(actionRequest(resetBody), actionParams());

      const update = mockTx.studentBadge.update.mock.calls[0][0];
      expect(update.where).toEqual({ id: 'progress-1' });
      expect(update.data).toEqual({
        status: 'LEARNING',
        score: null,
        awardedAt: null,
        qevPassedAt: null,
        qevWaivedAt: null,
        qevWaivedById: null,
        cooldownUntil: null,
        feedbackReviewedAt: null,
        gradeOverriddenAt: null,
        gradeOverriddenById: null,
      });
      // Instructor policy is not student progress — a reset must not silently
      // revoke extra attempts the instructor granted.
      expect(update.data).not.toHaveProperty('reassessmentLimit');
      expect(update.data).not.toHaveProperty('cooldownDays');
      expect(update.data).not.toHaveProperty('reassessmentRequired');
    });

    it('scopes the lesson deletes to the badge requirement lessons', async () => {
      await PATCH(actionRequest(resetBody), actionParams());

      expect(mockTx.lessonProgress.deleteMany).toHaveBeenCalledWith({
        where: { studentId: 'student-1', lessonId: { in: ['lesson-1'] } },
      });
      expect(mockTx.checkpointResponse.deleteMany).toHaveBeenCalledWith({
        where: { studentId: 'student-1', checkpoint: { lessonId: { in: ['lesson-1'] } } },
      });
    });

    it('skips the lesson deletes entirely for a badge with no requirement lessons', async () => {
      mockPrisma.badgeRequirement.findMany.mockResolvedValue([]);

      await PATCH(actionRequest(resetBody), actionParams());

      expect(mockTx.lessonProgress.deleteMany).not.toHaveBeenCalled();
      expect(mockTx.assessmentAttempt.deleteMany).toHaveBeenCalled();
    });

    // A rating that outlives the work it describes keeps skewing the badge
    // average until the student happens to redo the badge.
    it("clears the student's badge and lesson ratings", async () => {
      await PATCH(actionRequest(resetBody), actionParams());

      expect(mockTx.surveyResponse.deleteMany).toHaveBeenCalledWith({
        where: {
          studentId: 'student-1',
          prompt: {
            OR: [
              { badgeId: 'badge-1', context: 'BADGE' },
              { lessonId: { in: ['lesson-1'] }, context: 'LESSON' },
            ],
          },
        },
      });
    });

    it('clears only the badge rating when the badge has no requirement lessons', async () => {
      mockPrisma.badgeRequirement.findMany.mockResolvedValue([]);

      await PATCH(actionRequest(resetBody), actionParams());

      expect(mockTx.surveyResponse.deleteMany).toHaveBeenCalledWith({
        where: {
          studentId: 'student-1',
          prompt: { OR: [{ badgeId: 'badge-1', context: 'BADGE' }] },
        },
      });
    });

    it('scopes the rating delete to this student, never the whole cohort', async () => {
      await PATCH(actionRequest(resetBody), actionParams());

      const where = mockTx.surveyResponse.deleteMany.mock.calls[0][0].where;
      expect(where.studentId).toBe('student-1');
    });
  });

  describe('waive QEV', () => {
    it('unlocks assessment and stamps the waiver without touching lesson progress', async () => {
      mockPrisma.course.findFirst.mockResolvedValue(courseFixture({ status: 'LEARNING' }));
      mockPrisma.studentBadge.update.mockResolvedValue({
        status: 'READY_FOR_ASSESSMENT',
        qevWaivedAt: new Date('2026-08-11T12:00:00.000Z'),
      });

      const response = await PATCH(actionRequest({ action: 'WAIVE_QEV' }), actionParams());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        badge: { status: 'READY_FOR_ASSESSMENT', qevWaivedAt: '2026-08-11T12:00:00.000Z' },
      });

      const update = mockPrisma.studentBadge.update.mock.calls[0][0];
      expect(update.data.status).toBe('READY_FOR_ASSESSMENT');
      expect(update.data.qevWaivedById).toBe('prof-1');
      expect(update.data.qevWaivedAt).toBeInstanceOf(Date);
    });

    it('refuses when the requirement is already waived', async () => {
      mockPrisma.course.findFirst.mockResolvedValue(
        courseFixture({ status: 'LEARNING', qevWaivedAt: new Date('2026-08-01T00:00:00.000Z') })
      );

      const response = await PATCH(actionRequest({ action: 'WAIVE_QEV' }), actionParams());

      expect(response.status).toBe(409);
      expect(mockPrisma.studentBadge.update).not.toHaveBeenCalled();
    });

    it('refuses when the student already cleared QEV on their own', async () => {
      const response = await PATCH(actionRequest({ action: 'WAIVE_QEV' }), actionParams());

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: 'This student has already cleared the QEV requirement for this badge.',
      });
      expect(mockPrisma.studentBadge.update).not.toHaveBeenCalled();
    });
  });

  describe('override grade', () => {
    beforeEach(() => {
      mockTx.assessmentAttempt.create.mockResolvedValue({
        id: 'attempt-9',
        passed: true,
        score: 100,
        completedAt: new Date('2026-08-11T12:00:00.000Z'),
      });
    });

    it('requires a written reason', async () => {
      const response = await PATCH(
        actionRequest({ action: 'OVERRIDE_GRADE', passed: true, reason: '   ' }),
        actionParams()
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Overriding a grade requires a written reason.' });
    });

    it('refuses before the student has cleared QEV, pointing at the waiver', async () => {
      mockPrisma.course.findFirst.mockResolvedValue(courseFixture({ status: 'LEARNING' }));

      const response = await PATCH(
        actionRequest({ action: 'OVERRIDE_GRADE', passed: true, reason: 'Assessed on paper' }),
        actionParams()
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: 'This student has not cleared the QEV requirement yet. Complete or waive it before recording a grade.',
      });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('records a pass as a new attempt and completes the badge', async () => {
      const response = await PATCH(
        actionRequest({ action: 'OVERRIDE_GRADE', passed: true, reason: 'Assessed on paper 8/4' }),
        actionParams()
      );

      expect(response.status).toBe(201);

      const attempt = mockTx.assessmentAttempt.create.mock.calls[0][0];
      expect(attempt.data).toEqual(
        expect.objectContaining({
          courseId: 'course-1',
          badgeId: 'badge-1',
          studentId: 'student-1',
          checkerId: 'prof-1',
          passed: true,
          score: 100,
          pointsEarned: null,
          pointsPossible: null,
          feedback: 'Assessed on paper 8/4',
        })
      );
      expect(attempt.data.responses.create).toEqual(
        expect.objectContaining({
          taskId: null,
          taskText: 'Instructor override',
          subgoalText: 'Instructor override',
          isOverride: true,
          passed: true,
          feedback: 'Assessed on paper 8/4',
        })
      );

      const update = mockTx.studentBadge.update.mock.calls[0][0];
      expect(update.data.status).toBe('COMPLETED');
      expect(update.data.score).toBe(100);
      expect(update.data.awardedAt).toBeInstanceOf(Date);
      expect(update.data.cooldownUntil).toBeNull();
      expect(update.data.gradeOverriddenById).toBe('prof-1');
    });

    it('sends a still-learning override back to assessable with the cooldown cleared', async () => {
      mockTx.assessmentAttempt.create.mockResolvedValue({
        id: 'attempt-10',
        passed: false,
        score: 0,
        completedAt: new Date('2026-08-11T12:00:00.000Z'),
      });

      const response = await PATCH(
        actionRequest({ action: 'OVERRIDE_GRADE', passed: false, reason: 'Recorded in error' }),
        actionParams()
      );

      expect(response.status).toBe(201);

      const update = mockTx.studentBadge.update.mock.calls[0][0];
      expect(update.data.status).toBe('READY_FOR_ASSESSMENT');
      expect(update.data.score).toBe(0);
      // An instructor correcting a record must not spend the student's
      // reassessment budget or leave them cooling down.
      expect(update.data.awardedAt).toBeNull();
      expect(update.data.cooldownUntil).toBeNull();
    });

    // Correcting a recorded result doesn't erase that the student sat the
    // assessment and formed a view of it — only a full reset does that.
    it("leaves the student's rating alone", async () => {
      await PATCH(
        actionRequest({ action: 'OVERRIDE_GRADE', passed: true, reason: 'Assessed on paper' }),
        actionParams()
      );

      expect(mockTx.surveyResponse.deleteMany).not.toHaveBeenCalled();
    });

    it('works with no prior attempt, so an off-system assessment can be recorded', async () => {
      const response = await PATCH(
        actionRequest({ action: 'OVERRIDE_GRADE', passed: true, reason: 'Assessed during open lab' }),
        actionParams()
      );

      expect(response.status).toBe(201);
      expect(mockTx.assessmentAttempt.create).toHaveBeenCalledTimes(1);
    });
  });
});
