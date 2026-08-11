// Pure QEV-readiness rule for a badge: given the badge's requirement lessons and a
// student's progress rows, decide whether the badge has cleared QEV — and when it
// hasn't, which lessons are still blocking and why.
//
// This lives apart from lib/badgeProgress.ts because that module's copy was
// transaction-bound (it took a Prisma `tx` and issued its own query), so nothing
// outside a write transaction could reuse the decision. The rule now has three
// consumers — the progress sync, the checker-facing "what does this student still
// need" surface, and the home pending-work aggregate — so it has to be callable
// with plain data. See docs/qr-assessment-plan.md (section A2).

import { LessonStatus } from '@prisma/client';

export type LessonReadinessInput = {
  lessonId: string;
  status: LessonStatus | null;
  percentComplete: number | null;
  lastGradePassed: boolean | null;
};

export type BadgeBlockerReason =
  | 'NO_PROGRESS' // the student has never opened this lesson
  | 'NOT_COMPLETE' // started, but not finished
  | 'NOT_PASSED'; // finished, but the graded run didn't pass

export type BadgeBlocker = {
  lessonId: string;
  reason: BadgeBlockerReason;
};

export type BadgeReadiness = {
  ready: boolean;
  blockedBy: BadgeBlocker[];
};

export function uniqueLessonIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

/**
 * QEV is cleared when every required lesson is COMPLETED with a passing grade.
 * There is no lesson-survey gate — finishing the checkpoints and passing the grade
 * is the whole bar.
 *
 * A badge with no requirement lessons is never ready: it has no bar to clear, and
 * treating it as ready would surface it to checkers as assessable when nothing
 * has been demonstrated.
 */
export function evaluateBadgeReadiness(
  requirementLessonIds: string[],
  progress: LessonReadinessInput[]
): BadgeReadiness {
  const lessonIds = uniqueLessonIds(requirementLessonIds);

  if (lessonIds.length === 0) {
    return { ready: false, blockedBy: [] };
  }

  const progressByLessonId = new Map(progress.map((row) => [row.lessonId, row]));
  const blockedBy: BadgeBlocker[] = [];

  for (const lessonId of lessonIds) {
    const row = progressByLessonId.get(lessonId);

    if (!row) {
      blockedBy.push({ lessonId, reason: 'NO_PROGRESS' });
      continue;
    }

    const lessonComplete = row.status === LessonStatus.COMPLETED || (row.percentComplete ?? 0) >= 100;

    if (!lessonComplete) {
      blockedBy.push({ lessonId, reason: 'NOT_COMPLETE' });
      continue;
    }

    if (row.lastGradePassed !== true) {
      blockedBy.push({ lessonId, reason: 'NOT_PASSED' });
    }
  }

  return { ready: blockedBy.length === 0, blockedBy };
}
