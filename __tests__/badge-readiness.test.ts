import { LessonStatus } from '@prisma/client';

import { evaluateBadgeReadiness, uniqueLessonIds } from '../lib/badgeReadiness';

function progress(
  lessonId: string,
  overrides: Partial<{
    status: LessonStatus | null;
    percentComplete: number | null;
    lastGradePassed: boolean | null;
  }> = {}
) {
  return {
    lessonId,
    status: LessonStatus.COMPLETED,
    percentComplete: 100,
    lastGradePassed: true,
    ...overrides,
  };
}

describe('uniqueLessonIds', () => {
  it('drops nulls and duplicates while preserving order', () => {
    expect(uniqueLessonIds(['a', null, 'b', 'a', undefined, 'c'])).toEqual(['a', 'b', 'c']);
  });
});

describe('evaluateBadgeReadiness', () => {
  it('is ready when every requirement lesson is complete and passed', () => {
    expect(evaluateBadgeReadiness(['l1', 'l2'], [progress('l1'), progress('l2')])).toEqual({
      ready: true,
      blockedBy: [],
    });
  });

  it('is never ready when the badge has no requirement lessons', () => {
    // A badge with no bar to clear must not read as assessable — otherwise it would
    // surface to checkers as ready when nothing has been demonstrated.
    expect(evaluateBadgeReadiness([], [])).toEqual({ ready: false, blockedBy: [] });
  });

  it('reports NO_PROGRESS for a lesson the student never opened', () => {
    expect(evaluateBadgeReadiness(['l1', 'l2'], [progress('l1')])).toEqual({
      ready: false,
      blockedBy: [{ lessonId: 'l2', reason: 'NO_PROGRESS' }],
    });
  });

  it('reports NOT_COMPLETE for a started but unfinished lesson', () => {
    const result = evaluateBadgeReadiness(
      ['l1'],
      [progress('l1', { status: LessonStatus.IN_PROGRESS, percentComplete: 40, lastGradePassed: null })]
    );
    expect(result).toEqual({ ready: false, blockedBy: [{ lessonId: 'l1', reason: 'NOT_COMPLETE' }] });
  });

  it('reports NOT_PASSED when checkpoints are done but the grade did not pass', () => {
    const result = evaluateBadgeReadiness(['l1'], [progress('l1', { lastGradePassed: false })]);
    expect(result).toEqual({ ready: false, blockedBy: [{ lessonId: 'l1', reason: 'NOT_PASSED' }] });
  });

  it('treats an ungraded completed lesson as NOT_PASSED rather than ready', () => {
    const result = evaluateBadgeReadiness(['l1'], [progress('l1', { lastGradePassed: null })]);
    expect(result).toEqual({ ready: false, blockedBy: [{ lessonId: 'l1', reason: 'NOT_PASSED' }] });
  });

  it('accepts 100 percent complete as done even when the status lags', () => {
    const result = evaluateBadgeReadiness(['l1'], [progress('l1', { status: LessonStatus.IN_PROGRESS })]);
    expect(result.ready).toBe(true);
  });

  it('collects every blocker rather than stopping at the first', () => {
    const result = evaluateBadgeReadiness(
      ['l1', 'l2', 'l3'],
      [
        progress('l1', { status: LessonStatus.IN_PROGRESS, percentComplete: 10 }),
        progress('l2', { lastGradePassed: false }),
      ]
    );
    expect(result.ready).toBe(false);
    expect(result.blockedBy).toEqual([
      { lessonId: 'l1', reason: 'NOT_COMPLETE' },
      { lessonId: 'l2', reason: 'NOT_PASSED' },
      { lessonId: 'l3', reason: 'NO_PROGRESS' },
    ]);
  });

  it('ignores duplicate requirement ids', () => {
    expect(evaluateBadgeReadiness(['l1', 'l1'], [progress('l1')])).toEqual({ ready: true, blockedBy: [] });
  });
});
