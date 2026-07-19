/** @jest-environment node */

import { BadgeStatus, LessonStatus } from '@prisma/client';

import { syncLessonBadgesForStudent } from '../lib/badgeProgress';

function createTx({ latestAssessmentPassed }: { latestAssessmentPassed: boolean | null }) {
  return {
    badgeRequirement: {
      findMany: jest.fn().mockResolvedValue([
        {
          badge: {
            id: 'badge-1',
            requirements: [{ lessonId: 'lesson-1' }],
          },
        },
      ]),
    },
    studentBadge: {
      upsert: jest.fn().mockResolvedValue({ id: 'student-badge-1', status: BadgeStatus.LEARNING }),
      update: jest.fn().mockResolvedValue({ id: 'student-badge-1', status: BadgeStatus.READY_FOR_ASSESSMENT }),
    },
    assessmentAttempt: {
      findFirst: jest.fn().mockResolvedValue(
        latestAssessmentPassed == null
          ? null
          : {
              passed: latestAssessmentPassed,
            }
      ),
    },
    lessonProgress: {
      findMany: jest.fn().mockResolvedValue([
        {
          lessonId: 'lesson-1',
          status: LessonStatus.COMPLETED,
          percentComplete: 100,
          lastGradePassed: true,
        },
      ]),
    },
    surveyPrompt: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    surveyResponse: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

describe('syncLessonBadgesForStudent', () => {
  it('does not auto-promote a failed assessment back to ready before feedback review', async () => {
    const tx = createTx({ latestAssessmentPassed: false });

    const result = await syncLessonBadgesForStudent(tx as never, { studentId: 'student-1', lessonId: 'lesson-1' });

    expect(result.readyForAssessment).toBe(false);
    expect(tx.studentBadge.update).not.toHaveBeenCalled();
  });

  it('promotes completed lesson work when the latest assessment was not a failure', async () => {
    const tx = createTx({ latestAssessmentPassed: null });

    const result = await syncLessonBadgesForStudent(tx as never, { studentId: 'student-1', lessonId: 'lesson-1' });

    expect(result.readyForAssessment).toBe(true);
    // Clearing QEV stamps qevPassedAt alongside the status flip.
    expect(tx.studentBadge.update).toHaveBeenCalledWith({
      where: { id: 'student-badge-1' },
      data: { status: BadgeStatus.READY_FOR_ASSESSMENT, qevPassedAt: expect.any(Date) },
    });
  });
});
