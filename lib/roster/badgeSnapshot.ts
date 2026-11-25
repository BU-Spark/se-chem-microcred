// Roster progress: how many of the course's badges each student has completed.
//
// "Completed" uses classifyStudentBadgeCohort, the same rule the student profile
// and the course badge page use, so the roster count can never disagree with them.
// Pure: no Prisma client, safe in tests.

import type { BadgeStatus, LessonStatus } from '@prisma/client';

import { classifyStudentBadgeCohort } from '@/lib/badgeCohorts';

export type BadgeSnapshotResponse = {
  /** Number of badges in the course: the denominator of every student's progress. */
  badgeCount: number;
  /** Badges completed, keyed by student id. */
  completed: Record<string, number>;
  fetchedAt: string;
};

export type SnapshotInput = {
  badgeIds: string[];
  /** Requirement lesson ids per badge id. */
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

function groupBy<T>(rows: readonly T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = groups.get(k);
    if (list) list.push(row);
    else groups.set(k, [row]);
  }
  return groups;
}

/** Groups every row once, then counts each student's completed badges. */
export function countCompletedBadges(input: SnapshotInput): Record<string, number> {
  const badgeRows = new Map(input.studentBadges.map((row) => [pairKey(row.studentId, row.badgeId), row]));
  const progressByStudent = groupBy(input.lessonProgress, (row) => row.studentId);
  const attemptsByPair = groupBy(input.attempts, (row) => pairKey(row.studentId, row.badgeId));

  const completed: Record<string, number> = {};
  for (const studentId of input.studentIds) {
    const lessonProgress = progressByStudent.get(studentId) ?? [];
    let done = 0;
    for (const badgeId of input.badgeIds) {
      const row = badgeRows.get(pairKey(studentId, badgeId));
      const { cohort } = classifyStudentBadgeCohort({
        badgeStatus: row?.status ?? null,
        awardedAt: row?.awardedAt ?? null,
        requirementLessonIds: input.requirementLessonIds.get(badgeId) ?? [],
        lessonProgress,
        attempts: attemptsByPair.get(pairKey(studentId, badgeId)) ?? [],
      });
      if (cohort === 'PROFICIENT') done += 1;
    }
    completed[studentId] = done;
  }
  return completed;
}
