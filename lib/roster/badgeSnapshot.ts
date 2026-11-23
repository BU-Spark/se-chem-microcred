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

export type BadgeSnapshotResponse = {
  /** Course badges in course order. */
  badges: SnapshotBadge[];
  /** Keyed by student id; each array lines up with `badges`. */
  students: Record<string, SnapshotState[]>;
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
  attempts: Array<{ studentId: string; badgeId: string; passed: boolean }>;
};

function pairKey(studentId: string, id: string) {
  return `${studentId}\u0000${id}`;
}

export function buildBadgeSnapshot(input: SnapshotInput): Record<string, SnapshotState[]> {
  const badgeRows = new Map(input.studentBadges.map((row) => [pairKey(row.studentId, row.badgeId), row]));

  const progressByStudent = new Map<string, SnapshotInput['lessonProgress']>();
  for (const row of input.lessonProgress) {
    const list = progressByStudent.get(row.studentId);
    if (list) list.push(row);
    else progressByStudent.set(row.studentId, [row]);
  }

  const attemptsByPair = new Map<string, Array<{ passed: boolean }>>();
  for (const attempt of input.attempts) {
    const key = pairKey(attempt.studentId, attempt.badgeId);
    const list = attemptsByPair.get(key);
    if (list) list.push({ passed: attempt.passed });
    else attemptsByPair.set(key, [{ passed: attempt.passed }]);
  }

  const students: Record<string, SnapshotState[]> = {};
  for (const studentId of input.studentIds) {
    const lessonProgress = progressByStudent.get(studentId) ?? [];
    students[studentId] = input.badges.map((badge) => {
      const row = badgeRows.get(pairKey(studentId, badge.id));
      return snapshotStateFromCohort(
        classifyStudentBadgeCohort({
          badgeStatus: row?.status ?? null,
          awardedAt: row?.awardedAt ?? null,
          requirementLessonIds: input.requirementLessonIds.get(badge.id) ?? [],
          lessonProgress,
          attempts: attemptsByPair.get(pairKey(studentId, badge.id)) ?? [],
        })
      );
    });
  }
  return students;
}

export function countSnapshotStates(states: readonly SnapshotState[] | undefined) {
  let done = 0;
  let failed = 0;
  for (const state of states ?? []) {
    if (state === 'done') done += 1;
    else if (state === 'failed') failed += 1;
  }
  return { done, failed, total: states?.length ?? 0 };
}
