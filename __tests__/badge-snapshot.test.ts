import { BadgeStatus, LessonStatus } from '@prisma/client';

import { countCompletedBadges, type SnapshotInput } from '@/lib/roster/badgeSnapshot';

function input(overrides: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    badgeIds: ['b1', 'b2'],
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

describe('countCompletedBadges', () => {
  it('counts a badge as completed when it is COMPLETED or awarded', () => {
    const result = countCompletedBadges(
      input({
        studentIds: ['s1', 's2'],
        studentBadges: [
          { studentId: 's1', badgeId: 'b1', status: BadgeStatus.COMPLETED, awardedAt: null },
          { studentId: 's1', badgeId: 'b2', status: BadgeStatus.LEARNING, awardedAt: new Date() },
          { studentId: 's2', badgeId: 'b1', status: BadgeStatus.COMPLETED, awardedAt: new Date() },
        ],
      })
    );
    expect(result).toEqual({ s1: 2, s2: 1 });
  });

  it('does not count in-progress, failed, locked, or passed-but-unfinalized badges', () => {
    const result = countCompletedBadges(
      input({
        studentBadges: [
          { studentId: 's1', badgeId: 'b1', status: BadgeStatus.IN_REVIEW, awardedAt: null },
          { studentId: 's1', badgeId: 'b2', status: BadgeStatus.LOCKED, awardedAt: null },
        ],
        lessonProgress: [progress('s1', 'l1', LessonStatus.COMPLETED)],
        attempts: [
          { studentId: 's1', badgeId: 'b1', passed: true },
          { studentId: 's1', badgeId: 'b2', passed: false },
        ],
      })
    );
    expect(result).toEqual({ s1: 0 });
  });

  it('reports zero for students with no activity or records', () => {
    const result = countCompletedBadges(
      input({
        studentIds: ['s1', 's2'],
        studentBadges: [{ studentId: 's1', badgeId: 'b1', status: BadgeStatus.LEARNING, awardedAt: null }],
      })
    );
    expect(result).toEqual({ s1: 0, s2: 0 });
  });

  it('returns zero for every student when the course has no badges', () => {
    expect(countCompletedBadges(input({ badgeIds: [], studentIds: ['s1', 's2'] }))).toEqual({ s1: 0, s2: 0 });
  });
});
