import { BadgeStatus, LessonStatus } from '@prisma/client';

import {
  buildBadgeSnapshot,
  countSnapshotStates,
  snapshotStateFromCohort,
  type SnapshotInput,
} from '@/lib/roster/badgeSnapshot';

const BADGES = [
  { id: 'b1', name: 'Pipetting', slug: 'pipetting' },
  { id: 'b2', name: 'Titration', slug: 'titration' },
];

function input(overrides: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    badges: BADGES,
    requirementLessonIds: new Map([
      ['b1', ['l1']],
      ['b2', ['l2']],
    ]),
    studentIds: ['s1'],
    studentBadges: [],
    lessonProgress: [],
    attempts: [],
    ...overrides,
  };
}

function progress(studentId: string, lessonId: string, status: LessonStatus) {
  return {
    studentId,
    lessonId,
    status,
    startedAt: new Date('2026-11-01'),
    completedAt: status === LessonStatus.COMPLETED ? new Date('2026-11-02') : null,
    percentComplete: status === LessonStatus.COMPLETED ? 100 : 40,
  };
}

describe('snapshotStateFromCohort', () => {
  it('maps each cohort and stage to a color state', () => {
    expect(snapshotStateFromCohort({ cohort: 'PROFICIENT', stage: null, locked: false })).toBe('done');
    expect(snapshotStateFromCohort({ cohort: 'NOT_STARTED', stage: null, locked: false })).toBe('not_started');
    expect(snapshotStateFromCohort({ cohort: 'STILL_LEARNING', stage: 'ATTEMPT_FAILED', locked: false })).toBe(
      'failed'
    );
    expect(snapshotStateFromCohort({ cohort: 'STILL_LEARNING', stage: 'ATTEMPT_FAILED', locked: true })).toBe('failed');
    expect(snapshotStateFromCohort({ cohort: 'STILL_LEARNING', stage: 'VIDEO_INCOMPLETE', locked: false })).toBe(
      'progress'
    );
    expect(snapshotStateFromCohort({ cohort: 'STILL_LEARNING', stage: 'VIDEO_COMPLETE', locked: false })).toBe(
      'progress'
    );
    expect(snapshotStateFromCohort({ cohort: 'STILL_LEARNING', stage: 'AWAITING_AWARD', locked: false })).toBe(
      'progress'
    );
  });
});

describe('buildBadgeSnapshot', () => {
  it('reports not started for a bare eager LEARNING row with no activity', () => {
    const result = buildBadgeSnapshot(
      input({ studentBadges: [{ studentId: 's1', badgeId: 'b1', status: BadgeStatus.LEARNING, awardedAt: null }] })
    );
    expect(result).toEqual({ s1: ['not_started', 'not_started'] });
  });

  it('classifies done, progress, failed and locked per badge, in badge order', () => {
    const result = buildBadgeSnapshot(
      input({
        studentIds: ['s1', 's2'],
        studentBadges: [
          { studentId: 's1', badgeId: 'b1', status: BadgeStatus.COMPLETED, awardedAt: new Date() },
          { studentId: 's2', badgeId: 'b2', status: BadgeStatus.LOCKED, awardedAt: null },
        ],
        lessonProgress: [progress('s1', 'l2', LessonStatus.IN_PROGRESS)],
        attempts: [{ studentId: 's2', badgeId: 'b1', passed: false }],
      })
    );
    expect(result).toEqual({
      s1: ['done', 'progress'],
      s2: ['failed', 'failed'],
    });
  });

  it('keeps a passed but unfinalized badge in progress', () => {
    const result = buildBadgeSnapshot(
      input({
        studentBadges: [{ studentId: 's1', badgeId: 'b1', status: BadgeStatus.IN_REVIEW, awardedAt: null }],
        lessonProgress: [progress('s1', 'l1', LessonStatus.COMPLETED)],
        attempts: [
          { studentId: 's1', badgeId: 'b1', passed: false },
          { studentId: 's1', badgeId: 'b1', passed: true },
        ],
      })
    );
    expect(result.s1[0]).toBe('progress');
  });

  it('does not leak lesson progress from one badge into another', () => {
    const result = buildBadgeSnapshot(input({ lessonProgress: [progress('s1', 'l1', LessonStatus.COMPLETED)] }));
    expect(result.s1).toEqual(['progress', 'not_started']);
  });

  it('returns empty arrays when the course has no badges', () => {
    expect(buildBadgeSnapshot(input({ badges: [], studentIds: ['s1', 's2'] }))).toEqual({ s1: [], s2: [] });
  });
});

describe('countSnapshotStates', () => {
  it('counts done and failed', () => {
    expect(countSnapshotStates(['done', 'failed', 'progress', 'done'])).toEqual({ done: 2, failed: 1, total: 4 });
    expect(countSnapshotStates(undefined)).toEqual({ done: 0, failed: 0, total: 0 });
  });
});
