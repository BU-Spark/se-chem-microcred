import type { BadgeStatus, LessonStatus } from '@prisma/client';

import { classifyStudentBadgeCohort, type StudentCohort } from '@/lib/badgeCohorts';

export type SnapshotState = 'done' | 'progress' | 'failed' | 'not_started';

export const SNAPSHOT_STATES: readonly SnapshotState[] = ['done', 'progress', 'failed', 'not_started'];

export const SNAPSHOT_STATE_LABEL: Record<SnapshotState, string> = {
  done: 'Completed',
  progress: 'In progress',
  failed: 'Failed',
  not_started: 'Not started',
};

export type SnapshotBadge = { id: string; name: string; slug: string };

/** The student's most recent in-person attempt on a badge. Points are null when no rubric was scored. */
export type SnapshotGrade = { passed: boolean; pointsEarned: number | null; pointsPossible: number | null };

export type SnapshotCell = {
  state: SnapshotState;
  attempts: number;
  latest: SnapshotGrade | null;
};

export type BadgeSnapshotResponse = {
  /** Course badges in course order. */
  badges: SnapshotBadge[];
  /** Keyed by student id; each array lines up with `badges`. */
  students: Record<string, SnapshotCell[]>;
  fetchedAt: string;
};

export function snapshotStateFromCohort(cohort: StudentCohort): SnapshotState {
  if (cohort.cohort === 'PROFICIENT') return 'done';
  if (cohort.cohort === 'NOT_STARTED') return 'not_started';
  if (cohort.stage === 'ATTEMPT_FAILED' || cohort.locked) return 'failed';
  return 'progress';
}

export type SnapshotInput = {
  badges: SnapshotBadge[];
  requirementLessonIds: Map<string, string[]>;
  studentIds: string[];
  studentBadges: Array<{ studentId: string; badgeId: string; status: BadgeStatus; awardedAt: Date | null }>;
  lessonProgress: Array<{
    studentId: string;
    lessonId: string;
    status: LessonStatus | null;
    startedAt: Date | null;
    completedAt: Date | null;
    percentComplete: number | null;
  }>;
  attempts: Array<{
    studentId: string;
    badgeId: string;
    passed: boolean;
    pointsEarned: number | null;
    pointsPossible: number | null;
    completedAt: Date | null;
    createdAt: Date;
  }>;
};

type SnapshotAttempt = SnapshotInput['attempts'][number];

function attemptTime(attempt: SnapshotAttempt) {
  return (attempt.completedAt ?? attempt.createdAt).getTime();
}

function pairKey(studentId: string, id: string) {
  return `${studentId}\u0000${id}`;
}

export function buildBadgeSnapshot(input: SnapshotInput): Record<string, SnapshotCell[]> {
  const badgeRows = new Map(input.studentBadges.map((row) => [pairKey(row.studentId, row.badgeId), row]));

  const progressByStudent = new Map<string, SnapshotInput['lessonProgress']>();
  for (const row of input.lessonProgress) {
    const list = progressByStudent.get(row.studentId);
    if (list) list.push(row);
    else progressByStudent.set(row.studentId, [row]);
  }

  const attemptsByPair = new Map<string, SnapshotAttempt[]>();
  for (const attempt of input.attempts) {
    const key = pairKey(attempt.studentId, attempt.badgeId);
    const list = attemptsByPair.get(key);
    if (list) list.push(attempt);
    else attemptsByPair.set(key, [attempt]);
  }

  const students: Record<string, SnapshotCell[]> = {};
  for (const studentId of input.studentIds) {
    const lessonProgress = progressByStudent.get(studentId) ?? [];
    students[studentId] = input.badges.map((badge) => {
      const row = badgeRows.get(pairKey(studentId, badge.id));
      const attempts = attemptsByPair.get(pairKey(studentId, badge.id)) ?? [];
      const state = snapshotStateFromCohort(
        classifyStudentBadgeCohort({
          badgeStatus: row?.status ?? null,
          awardedAt: row?.awardedAt ?? null,
          requirementLessonIds: input.requirementLessonIds.get(badge.id) ?? [],
          lessonProgress,
          attempts,
        })
      );
      const newest = attempts.reduce<SnapshotAttempt | null>(
        (latest, attempt) => (!latest || attemptTime(attempt) > attemptTime(latest) ? attempt : latest),
        null
      );
      return {
        state,
        attempts: attempts.length,
        latest: newest
          ? { passed: newest.passed, pointsEarned: newest.pointsEarned, pointsPossible: newest.pointsPossible }
          : null,
      };
    });
  }
  return students;
}

export function countSnapshotStates(cells: readonly SnapshotCell[] | undefined) {
  let done = 0;
  let failed = 0;
  for (const { state } of cells ?? []) {
    if (state === 'done') done += 1;
    else if (state === 'failed') failed += 1;
  }
  return { done, failed, total: cells?.length ?? 0 };
}

/**
 * The grade text for one badge: "8/10 pts" when the latest attempt was scored on a
 * rubric, "Passed" / "Failed" when it wasn't (e.g. an instructor override), and a
 * status in place of a grade when there is no attempt yet.
 */
export function formatSnapshotGrade(cell: SnapshotCell): string {
  const { latest } = cell;
  if (!latest) {
    if (cell.state === 'done') return 'Completed';
    if (cell.state === 'not_started') return 'Not started';
    return 'Not assessed';
  }
  if (latest.pointsEarned != null && latest.pointsPossible != null && latest.pointsPossible > 0) {
    return `${latest.pointsEarned}/${latest.pointsPossible} pts`;
  }
  return latest.passed ? 'Passed' : 'Failed';
}

export function formatAttemptCount(attempts: number): string | null {
  if (attempts === 0) return null;
  return `${attempts} attempt${attempts === 1 ? '' : 's'}`;
}
