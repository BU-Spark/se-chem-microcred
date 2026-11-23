import { BadgeStatus, LessonStatus } from '@prisma/client';

import {
  buildBadgeSnapshot,
  countSnapshotStates,
  formatAttemptCount,
  formatSnapshotGrade,
  snapshotStateFromCohort,
  type SnapshotCell,
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

const states = (cells: SnapshotCell[]) => cells.map((cell) => cell.state);

function attempt(
  badgeId: string,
  passed: boolean,
  at: string,
  points: [number, number] | null = null,
  studentId = 's1'
): SnapshotInput['attempts'][number] {
  return {
    studentId,
    badgeId,
    passed,
    pointsEarned: points?.[0] ?? null,
    pointsPossible: points?.[1] ?? null,
    completedAt: new Date(at),
    createdAt: new Date(at),
  };
}

describe('buildBadgeSnapshot', () => {
  it('reports not started for a bare eager LEARNING row with no activity', () => {
    const result = buildBadgeSnapshot(
      input({ studentBadges: [{ studentId: 's1', badgeId: 'b1', status: BadgeStatus.LEARNING, awardedAt: null }] })
    );
    expect(result.s1).toEqual([
      { state: 'not_started', attempts: 0, latest: null },
      { state: 'not_started', attempts: 0, latest: null },
    ]);
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
        attempts: [attempt('b1', false, '2026-11-01', null, 's2')],
      })
    );
    expect(states(result.s1)).toEqual(['done', 'progress']);
    expect(states(result.s2)).toEqual(['failed', 'failed']);
  });

  it('reports the latest attempt by completion time and counts every attempt', () => {
    const result = buildBadgeSnapshot(
      input({
        studentBadges: [{ studentId: 's1', badgeId: 'b1', status: BadgeStatus.IN_REVIEW, awardedAt: null }],
        lessonProgress: [progress('s1', 'l1', LessonStatus.COMPLETED)],
        // Out of order on purpose: the newest attempt wins, not the last row.
        attempts: [attempt('b1', true, '2026-11-10', [9, 10]), attempt('b1', false, '2026-11-02', [4, 10])],
      })
    );
    expect(result.s1[0]).toEqual({
      state: 'progress',
      attempts: 2,
      latest: { passed: true, pointsEarned: 9, pointsPossible: 10 },
    });
    expect(result.s1[1]).toEqual({ state: 'not_started', attempts: 0, latest: null });
  });

  it('does not leak lesson progress from one badge into another', () => {
    const result = buildBadgeSnapshot(input({ lessonProgress: [progress('s1', 'l1', LessonStatus.COMPLETED)] }));
    expect(states(result.s1)).toEqual(['progress', 'not_started']);
  });

  it('returns empty arrays when the course has no badges', () => {
    expect(buildBadgeSnapshot(input({ badges: [], studentIds: ['s1', 's2'] }))).toEqual({ s1: [], s2: [] });
  });
});

describe('countSnapshotStates', () => {
  it('counts done and failed', () => {
    const cells = (['done', 'failed', 'progress', 'done'] as const).map((state) => ({
      state,
      attempts: 0,
      latest: null,
    }));
    expect(countSnapshotStates(cells)).toEqual({ done: 2, failed: 1, total: 4 });
    expect(countSnapshotStates(undefined)).toEqual({ done: 0, failed: 0, total: 0 });
  });
});

describe('formatSnapshotGrade', () => {
  const cell = (state: SnapshotCell['state'], latest: SnapshotCell['latest']): SnapshotCell => ({
    state,
    attempts: latest ? 1 : 0,
    latest,
  });

  it('shows rubric points for a scored attempt', () => {
    expect(formatSnapshotGrade(cell('failed', { passed: false, pointsEarned: 4, pointsPossible: 10 }))).toBe(
      '4/10 pts'
    );
  });

  it('shows pass or fail when the attempt has no points, like an instructor override', () => {
    expect(formatSnapshotGrade(cell('done', { passed: true, pointsEarned: null, pointsPossible: null }))).toBe(
      'Passed'
    );
    expect(formatSnapshotGrade(cell('failed', { passed: false, pointsEarned: 0, pointsPossible: 0 }))).toBe('Failed');
  });

  it('shows a status in place of a grade when there is no attempt', () => {
    expect(formatSnapshotGrade(cell('not_started', null))).toBe('Not started');
    expect(formatSnapshotGrade(cell('progress', null))).toBe('Not assessed');
    expect(formatSnapshotGrade(cell('done', null))).toBe('Completed');
  });

  it('pluralizes attempt counts and hides zero', () => {
    expect(formatAttemptCount(0)).toBeNull();
    expect(formatAttemptCount(1)).toBe('1 attempt');
    expect(formatAttemptCount(3)).toBe('3 attempts');
  });
});
