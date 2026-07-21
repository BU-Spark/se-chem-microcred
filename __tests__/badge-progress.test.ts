/** @jest-environment node */

import { BadgeStatus, LessonStatus } from '@prisma/client';

import { syncLessonBadgesForStudent } from '../lib/badgeProgress';

function createTx({
  latestAssessmentPassed,
  lessonProgress = { status: LessonStatus.COMPLETED, percentComplete: 100, lastGradePassed: true },
}: {
  latestAssessmentPassed: boolean | null;
  lessonProgress?: { status: LessonStatus; percentComplete: number; lastGradePassed: boolean | null };
}) {
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
      findMany: jest.fn().mockResolvedValue([{ lessonId: 'lesson-1', ...lessonProgress }]),
    },
    // Lesson surveys were removed — the sync no longer queries survey tables.
    surveyPrompt: { findMany: jest.fn() },
    surveyResponse: { findMany: jest.fn() },
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
    // The flip is purely lesson-based now — no lesson-survey lookups.
    expect(tx.surveyPrompt.findMany).not.toHaveBeenCalled();
    expect(tx.surveyResponse.findMany).not.toHaveBeenCalled();
  });

  it('does not promote when the lesson has not been completed and passed', async () => {
    const tx = createTx({
      latestAssessmentPassed: null,
      lessonProgress: { status: LessonStatus.IN_PROGRESS, percentComplete: 50, lastGradePassed: null },
    });

    const result = await syncLessonBadgesForStudent(tx as never, { studentId: 'student-1', lessonId: 'lesson-1' });

    expect(result.readyForAssessment).toBe(false);
    expect(tx.studentBadge.update).not.toHaveBeenCalled();
  });

  it('does not promote when checkpoints are complete but the grade did not pass', async () => {
    const tx = createTx({
      latestAssessmentPassed: null,
      lessonProgress: { status: LessonStatus.COMPLETED, percentComplete: 100, lastGradePassed: false },
    });

    const result = await syncLessonBadgesForStudent(tx as never, { studentId: 'student-1', lessonId: 'lesson-1' });

    expect(result.readyForAssessment).toBe(false);
    expect(tx.studentBadge.update).not.toHaveBeenCalled();
  });
});
