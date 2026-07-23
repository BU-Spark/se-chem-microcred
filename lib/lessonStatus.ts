import { LessonStatus } from '@prisma/client';

/**
 * Catalog-facing lesson status. Completion is only real once the grade route has
 * run (lastGradePassed) or the stored row already says COMPLETED — passing every
 * checkpoint is not enough. Treating all-checkpoints-passed as COMPLETED put a
 * student who left before clicking Finish into review mode, which hides the
 * Finish button and makes the grade route unreachable forever (#216).
 *
 * Zero-checkpoint lessons are the exception: computeLessonGrade returns 0% when
 * there are no questions, so they can never pass grading and checkpoint coverage
 * is their only completion signal.
 */
export function deriveCatalogLessonStatus({
  storedStatus,
  gradedPassed,
  allCheckpointsPassed,
  answeredCount,
  checkpointCount,
}: {
  storedStatus: LessonStatus | null | undefined;
  gradedPassed: boolean;
  allCheckpointsPassed: boolean;
  answeredCount: number;
  checkpointCount: number;
}): LessonStatus {
  if (gradedPassed || storedStatus === LessonStatus.COMPLETED || (checkpointCount === 0 && allCheckpointsPassed)) {
    return LessonStatus.COMPLETED;
  }
  if (answeredCount > 0 || allCheckpointsPassed) {
    return LessonStatus.IN_PROGRESS;
  }
  return LessonStatus.NOT_STARTED;
}
