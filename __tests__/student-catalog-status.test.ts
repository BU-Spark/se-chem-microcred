/** @jest-environment node */

import { LessonStatus } from '@prisma/client';

import { deriveCatalogLessonStatus } from '../lib/lessonStatus';

function derive(overrides: Partial<Parameters<typeof deriveCatalogLessonStatus>[0]> = {}) {
  return deriveCatalogLessonStatus({
    storedStatus: LessonStatus.IN_PROGRESS,
    gradedPassed: false,
    allCheckpointsPassed: false,
    answeredCount: 0,
    checkpointCount: 3,
    ...overrides,
  });
}

describe('deriveCatalogLessonStatus', () => {
  it('keeps a lesson in progress when every checkpoint passed but the grade never ran', () => {
    // Regression for #216: reading this as COMPLETED forced review mode on
    // re-entry, which hides the Finish button and strands the student.
    expect(derive({ allCheckpointsPassed: true, answeredCount: 3 })).toBe(LessonStatus.IN_PROGRESS);
  });

  it('completes the lesson once the grade route recorded a passing attempt', () => {
    expect(derive({ gradedPassed: true, allCheckpointsPassed: true, answeredCount: 3 })).toBe(LessonStatus.COMPLETED);
  });

  it('keeps legacy rows already stored as completed in review mode', () => {
    expect(derive({ storedStatus: LessonStatus.COMPLETED })).toBe(LessonStatus.COMPLETED);
  });

  it('still completes zero-checkpoint lessons, which can never pass grading', () => {
    expect(derive({ checkpointCount: 0, allCheckpointsPassed: true })).toBe(LessonStatus.COMPLETED);
  });

  it('reports not started when nothing has been answered', () => {
    expect(derive({ storedStatus: LessonStatus.NOT_STARTED })).toBe(LessonStatus.NOT_STARTED);
  });

  it('reports in progress after any answered question', () => {
    expect(derive({ storedStatus: LessonStatus.NOT_STARTED, answeredCount: 1 })).toBe(LessonStatus.IN_PROGRESS);
  });
});
