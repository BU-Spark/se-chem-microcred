import { classifyStudentBadgeCohort, summarizeBadgeCohorts, type StudentCohortInput } from '@/lib/badgeCohorts';

const LESSON_A = 'lesson-a';
const LESSON_B = 'lesson-b';

function input(overrides: Partial<StudentCohortInput> = {}): StudentCohortInput {
  return {
    badgeStatus: 'LEARNING',
    awardedAt: null,
    requirementLessonIds: [LESSON_A],
    lessonProgress: [],
    attempts: [],
    ...overrides,
  };
}

function lesson(lessonId: string, overrides: Partial<StudentCohortInput['lessonProgress'][number]> = {}) {
  return {
    lessonId,
    status: null,
    startedAt: null,
    completedAt: null,
    percentComplete: 0,
    ...overrides,
  };
}

describe('classifyStudentBadgeCohort', () => {
  it('treats an eagerly created LEARNING row with no activity as not started', () => {
    expect(classifyStudentBadgeCohort(input())).toEqual({
      cohort: 'NOT_STARTED',
      stage: null,
      locked: false,
    });
  });

  it('treats a student with no StudentBadge row at all as not started', () => {
    expect(classifyStudentBadgeCohort(input({ badgeStatus: null })).cohort).toBe('NOT_STARTED');
  });

  it('counts an awarded badge as proficient', () => {
    expect(classifyStudentBadgeCohort(input({ badgeStatus: 'COMPLETED' }))).toEqual({
      cohort: 'PROFICIENT',
      stage: null,
      locked: false,
    });
  });

  it('counts an awardedAt timestamp as proficient even if the status lags', () => {
    expect(classifyStudentBadgeCohort(input({ awardedAt: '2026-05-01T00:00:00.000Z' })).cohort).toBe('PROFICIENT');
  });

  it('places a partially watched lesson under video-incomplete', () => {
    const result = classifyStudentBadgeCohort(
      input({ lessonProgress: [lesson(LESSON_A, { status: 'IN_PROGRESS', percentComplete: 40 })] })
    );

    expect(result).toEqual({ cohort: 'STILL_LEARNING', stage: 'VIDEO_INCOMPLETE', locked: false });
  });

  it('places a finished lesson with no attempts under video-complete', () => {
    const result = classifyStudentBadgeCohort(
      input({ lessonProgress: [lesson(LESSON_A, { status: 'COMPLETED', completedAt: new Date() })] })
    );

    expect(result.stage).toBe('VIDEO_COMPLETE');
  });

  it('requires every requirement lesson before counting the video as complete', () => {
    const result = classifyStudentBadgeCohort(
      input({
        requirementLessonIds: [LESSON_A, LESSON_B],
        lessonProgress: [lesson(LESSON_A, { status: 'COMPLETED', completedAt: new Date() })],
      })
    );

    expect(result.stage).toBe('VIDEO_INCOMPLETE');
  });

  it('trusts READY_FOR_ASSESSMENT even when a lesson row is missing', () => {
    const result = classifyStudentBadgeCohort(input({ badgeStatus: 'READY_FOR_ASSESSMENT' }));

    expect(result.stage).toBe('VIDEO_COMPLETE');
  });

  it('places a failed in-person attempt under attempt-failed, ahead of video progress', () => {
    const result = classifyStudentBadgeCohort(
      input({
        badgeStatus: 'READY_FOR_ASSESSMENT',
        lessonProgress: [lesson(LESSON_A, { status: 'COMPLETED', completedAt: new Date() })],
        attempts: [{ passed: false }],
      })
    );

    expect(result).toEqual({ cohort: 'STILL_LEARNING', stage: 'ATTEMPT_FAILED', locked: false });
  });

  it('flags a locked student, still counting them as attempt-failed', () => {
    const result = classifyStudentBadgeCohort(
      input({ badgeStatus: 'LOCKED', attempts: [{ passed: false }, { passed: false }] })
    );

    expect(result).toEqual({ cohort: 'STILL_LEARNING', stage: 'ATTEMPT_FAILED', locked: true });
  });

  it('flags a locked student even when the attempt rows are gone', () => {
    expect(classifyStudentBadgeCohort(input({ badgeStatus: 'LOCKED' }))).toEqual({
      cohort: 'STILL_LEARNING',
      stage: 'ATTEMPT_FAILED',
      locked: true,
    });
  });

  it('keeps a passed-but-unawarded student in still learning', () => {
    const result = classifyStudentBadgeCohort(
      input({ badgeStatus: 'IN_REVIEW', attempts: [{ passed: false }, { passed: true }] })
    );

    expect(result).toEqual({ cohort: 'STILL_LEARNING', stage: 'AWAITING_AWARD', locked: false });
  });

  it('counts a student assessed in person without any lesson progress as attempt-failed', () => {
    expect(classifyStudentBadgeCohort(input({ attempts: [{ passed: false }] })).stage).toBe('ATTEMPT_FAILED');
  });

  it('never counts a badge with no requirement lessons as video-complete', () => {
    expect(classifyStudentBadgeCohort(input({ requirementLessonIds: [] })).cohort).toBe('NOT_STARTED');
  });
});

describe('summarizeBadgeCohorts', () => {
  it('rolls the class up into three cohorts with percentages of the whole class', () => {
    const summary = summarizeBadgeCohorts([
      { cohort: 'PROFICIENT', stage: null, locked: false },
      { cohort: 'PROFICIENT', stage: null, locked: false },
      { cohort: 'STILL_LEARNING', stage: 'VIDEO_INCOMPLETE', locked: false },
      { cohort: 'STILL_LEARNING', stage: 'VIDEO_COMPLETE', locked: false },
      { cohort: 'STILL_LEARNING', stage: 'ATTEMPT_FAILED', locked: true },
      { cohort: 'STILL_LEARNING', stage: 'AWAITING_AWARD', locked: false },
      { cohort: 'NOT_STARTED', stage: null, locked: false },
      { cohort: 'NOT_STARTED', stage: null, locked: false },
    ]);

    expect(summary.totalStudents).toBe(8);
    expect(summary.proficient).toEqual({ count: 2, percent: 25 });
    expect(summary.notStarted).toEqual({ count: 2, percent: 25 });
    expect(summary.stillLearning.count).toBe(4);
    expect(summary.stillLearning.percent).toBe(50);
    expect(summary.stillLearning.lockedCount).toBe(1);

    // Sub-stages are shares of the whole class, so they add back up to 50%.
    expect(summary.stillLearning.stages.videoIncomplete).toEqual({ count: 1, percent: 13 });
    expect(summary.stillLearning.stages.videoComplete).toEqual({ count: 1, percent: 13 });
    expect(summary.stillLearning.stages.attemptFailed).toEqual({ count: 1, percent: 13 });
    expect(summary.stillLearning.stages.awaitingAward).toEqual({ count: 1, percent: 13 });
  });

  it('reports zeroes rather than dividing by zero for an empty roster', () => {
    const summary = summarizeBadgeCohorts([]);

    expect(summary.totalStudents).toBe(0);
    expect(summary.proficient).toEqual({ count: 0, percent: 0 });
    expect(summary.stillLearning.percent).toBe(0);
    expect(summary.notStarted.percent).toBe(0);
  });
});
