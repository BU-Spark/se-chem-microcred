// Instructor-facing rollup for a single badge: which of three cohorts each
// student falls into, and — inside "still learning" — how far along they are.
//
// The badge lifecycle (lib/badgeProgress.ts, BadgeStatus) has five states plus
// lesson-level and assessment-level history, none of which map one-to-one onto
// the three buckets instructors asked for. This module derives the mapping from
// plain data so it can run in the API route, in tests, and anywhere else without
// a Prisma client.
//
// See also lib/badgeReadiness.ts, which answers the narrower "has this student
// cleared QEV" question that gates assessment.

import { BadgeStatus, LessonStatus } from '@prisma/client';

export type BadgeCohort = 'PROFICIENT' | 'STILL_LEARNING' | 'NOT_STARTED';

/**
 * Sub-stages of STILL_LEARNING, ordered by how far the student has gotten.
 * Mutually exclusive: a student who finished the video and then failed an
 * assessment counts only under ATTEMPT_FAILED.
 */
export type StillLearningStage =
  | 'VIDEO_INCOMPLETE' // opened the lesson, hasn't finished it
  | 'VIDEO_COMPLETE' // finished the lesson, no in-person attempt yet
  | 'ATTEMPT_FAILED' // assessed in person at least once, hasn't passed
  | 'AWAITING_AWARD'; // passed an attempt, badge not awarded yet

export type StudentCohortInput = {
  /** StudentBadge.status, or null when the student has no row for this badge. */
  badgeStatus: BadgeStatus | null;
  awardedAt: Date | string | null;
  /** Lessons the badge requires; an empty list means the badge has no video bar. */
  requirementLessonIds: string[];
  lessonProgress: Array<{
    lessonId: string;
    status: LessonStatus | null;
    startedAt: Date | string | null;
    completedAt: Date | string | null;
    percentComplete: number | null;
  }>;
  /** Graded in-person attempts for this badge, in any order. */
  attempts: Array<{ passed: boolean }>;
};

export type StudentCohort = {
  cohort: BadgeCohort;
  stage: StillLearningStage | null;
  /** Failed past the reassessment limit — terminal until an instructor intervenes. */
  locked: boolean;
};

export type CohortBucket = {
  count: number;
  percent: number;
};

export type BadgeCohortSummary = {
  totalStudents: number;
  proficient: CohortBucket;
  stillLearning: CohortBucket & {
    /** Subset of attemptFailed that can no longer reassess. */
    lockedCount: number;
    stages: {
      videoIncomplete: CohortBucket;
      videoComplete: CohortBucket;
      attemptFailed: CohortBucket;
      awaitingAward: CohortBucket;
    };
  };
  notStarted: CohortBucket;
};

function hasLessonActivity(row: StudentCohortInput['lessonProgress'][number]) {
  return Boolean(
    row.startedAt ||
      row.completedAt ||
      row.status === LessonStatus.IN_PROGRESS ||
      row.status === LessonStatus.COMPLETED ||
      (row.percentComplete ?? 0) > 0
  );
}

function isLessonComplete(row: StudentCohortInput['lessonProgress'][number]) {
  return Boolean(row.completedAt) || row.status === LessonStatus.COMPLETED;
}

/**
 * Percentages are always of the whole class, so the three cohorts add to ~100%
 * and every still-learning sub-stage can be read against the same denominator.
 * Rounding is per-bucket, so a set can total 99 or 101.
 */
export function cohortPercent(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

/**
 * Places one student in exactly one cohort/stage. Checks run most-advanced
 * first, so the furthest signal a student has produced is the one that counts.
 */
export function classifyStudentBadgeCohort(input: StudentCohortInput): StudentCohort {
  const locked = input.badgeStatus === BadgeStatus.LOCKED;

  if (input.badgeStatus === BadgeStatus.COMPLETED || input.awardedAt) {
    return { cohort: 'PROFICIENT', stage: null, locked: false };
  }

  const attempts = input.attempts ?? [];

  if (attempts.some((attempt) => attempt.passed)) {
    // Passed in person but the badge hasn't been awarded — the student still has
    // feedback to acknowledge or a rating to submit, so this isn't proficiency yet.
    return { cohort: 'STILL_LEARNING', stage: 'AWAITING_AWARD', locked };
  }

  // LOCKED implies a run of failed attempts even if the rows were pruned.
  if (attempts.length > 0 || locked) {
    return { cohort: 'STILL_LEARNING', stage: 'ATTEMPT_FAILED', locked };
  }

  const requirementLessonIds = [...new Set(input.requirementLessonIds.filter(Boolean))];
  const progressByLessonId = new Map(input.lessonProgress.map((row) => [row.lessonId, row]));
  const rows = requirementLessonIds.map((lessonId) => progressByLessonId.get(lessonId)).filter((row) => row != null);

  const allLessonsComplete =
    requirementLessonIds.length > 0 && rows.length === requirementLessonIds.length && rows.every(isLessonComplete);

  // READY_FOR_ASSESSMENT is only reachable by clearing every requirement lesson,
  // so trust it even if a progress row is missing or out of date.
  if (allLessonsComplete || input.badgeStatus === BadgeStatus.READY_FOR_ASSESSMENT) {
    return { cohort: 'STILL_LEARNING', stage: 'VIDEO_COMPLETE', locked };
  }

  if (input.badgeStatus === BadgeStatus.IN_REVIEW || rows.some(hasLessonActivity)) {
    return { cohort: 'STILL_LEARNING', stage: 'VIDEO_INCOMPLETE', locked };
  }

  // StudentBadge rows are created eagerly at badge creation/import, so a bare
  // LEARNING row with no lesson activity still means "hasn't started".
  return { cohort: 'NOT_STARTED', stage: null, locked: false };
}

export function summarizeBadgeCohorts(cohorts: StudentCohort[]): BadgeCohortSummary {
  const totalStudents = cohorts.length;
  const countOfStage = (stage: StillLearningStage) =>
    cohorts.filter((entry) => entry.cohort === 'STILL_LEARNING' && entry.stage === stage).length;

  const proficientCount = cohorts.filter((entry) => entry.cohort === 'PROFICIENT').length;
  const stillLearningCount = cohorts.filter((entry) => entry.cohort === 'STILL_LEARNING').length;
  const notStartedCount = cohorts.filter((entry) => entry.cohort === 'NOT_STARTED').length;
  const lockedCount = cohorts.filter((entry) => entry.cohort === 'STILL_LEARNING' && entry.locked).length;

  const bucket = (count: number): CohortBucket => ({ count, percent: cohortPercent(count, totalStudents) });

  return {
    totalStudents,
    proficient: bucket(proficientCount),
    notStarted: bucket(notStartedCount),
    stillLearning: {
      ...bucket(stillLearningCount),
      lockedCount,
      stages: {
        videoIncomplete: bucket(countOfStage('VIDEO_INCOMPLETE')),
        videoComplete: bucket(countOfStage('VIDEO_COMPLETE')),
        attemptFailed: bucket(countOfStage('ATTEMPT_FAILED')),
        awaitingAward: bucket(countOfStage('AWAITING_AWARD')),
      },
    },
  };
}
