export type StoredBadgeStatus = 'LEARNING' | 'READY_FOR_ASSESSMENT' | 'IN_REVIEW' | 'COMPLETED' | 'LOCKED';
export type AnalyticsStatus = 'PROFICIENT' | 'STILL_LEARNING' | 'NOT_STARTED';
export type StillLearningReason = 'VIDEO_IN_PROGRESS' | 'VIDEO_COMPLETED_ONLY' | 'IN_PERSON_FAILED';

// The student groups an instructor (or a permitted checker) can message for a badge.
export const BADGE_MESSAGE_GROUPS = ['NOT_STARTED', 'VIDEO_IN_PROGRESS', 'READY_TO_ASSESS'] as const;
export type BadgeMessageGroup = (typeof BADGE_MESSAGE_GROUPS)[number];

export function isBadgeMessageGroup(value: unknown): value is BadgeMessageGroup {
  return typeof value === 'string' && (BADGE_MESSAGE_GROUPS as readonly string[]).includes(value);
}

export type BadgeAnalyticsInput = {
  /** StudentBadge row for this badge, or null when the student has none. */
  progress: { status: StoredBadgeStatus } | null;
  /** Progress on the badge's requirement lessons only. */
  lessonProgress: Array<{
    status: string | null;
    startedAt: Date | string | null;
    completedAt: Date | string | null;
    percentComplete: number;
  }>;
  /** Graded attempts for this badge, oldest first. */
  assessmentAttempts: Array<{ passed: boolean }>;
  surveyResponseCount: number;
};

export type BadgeAnalytics = {
  status: StoredBadgeStatus | 'NOT_STARTED';
  analyticsStatus: AnalyticsStatus;
  stillLearningReason: StillLearningReason | null;
  lessonStarted: boolean;
  lessonCompleted: boolean;
  latestAssessmentPassed: boolean | null;
};

export function deriveBadgeAnalytics(input: BadgeAnalyticsInput): BadgeAnalytics {
  const { progress } = input;
  // StudentBadge rows are eagerly created with LEARNING status when a badge
  // is created/imported, so a LEARNING row alone doesn't mean the student
  // has started. Mirror the roster member route: they've started only once
  // a requirement lesson shows activity.
  const lessonStarted = input.lessonProgress.some(
    (lessonProgress) =>
      Boolean(lessonProgress.startedAt || lessonProgress.completedAt) ||
      lessonProgress.status === 'IN_PROGRESS' ||
      lessonProgress.status === 'COMPLETED' ||
      lessonProgress.percentComplete > 0
  );
  const lessonCompleted = input.lessonProgress.some(
    (lessonProgress) => lessonProgress.status === 'COMPLETED' || Boolean(lessonProgress.completedAt)
  );
  const storedStatus: BadgeAnalytics['status'] =
    !progress || (progress.status === 'LEARNING' && !lessonStarted) ? 'NOT_STARTED' : progress.status;
  const latestAssessmentPassed = input.assessmentAttempts.at(-1)?.passed ?? null;
  // The finalization endpoint records feedback and flips the badge to COMPLETED
  // atomically. Reconcile legacy/stale IN_REVIEW rows here so instructor
  // analytics agrees with the student projection and recorded feedback.
  const status =
    storedStatus === 'IN_REVIEW' && latestAssessmentPassed === true && input.surveyResponseCount > 0
      ? 'COMPLETED'
      : storedStatus;
  const analyticsStatus: AnalyticsStatus =
    status === 'COMPLETED' ? 'PROFICIENT' : status === 'NOT_STARTED' ? 'NOT_STARTED' : 'STILL_LEARNING';
  const stillLearningReason: StillLearningReason | null =
    analyticsStatus !== 'STILL_LEARNING'
      ? null
      : latestAssessmentPassed === false || status === 'LOCKED'
        ? 'IN_PERSON_FAILED'
        : status === 'IN_REVIEW'
          ? null
          : lessonCompleted || status === 'READY_FOR_ASSESSMENT'
            ? 'VIDEO_COMPLETED_ONLY'
            : 'VIDEO_IN_PROGRESS';

  return { status, analyticsStatus, stillLearningReason, lessonStarted, lessonCompleted, latestAssessmentPassed };
}

// Each group lines up with a count on the badge detail page: the Not Started
// card and the two still-learning rows ("Started the video, haven't finished"
// and "Finished the video lesson, not yet assessed").
export function badgeMessageGroupMatches(group: BadgeMessageGroup, analytics: BadgeAnalytics) {
  switch (group) {
    case 'NOT_STARTED':
      return analytics.status === 'NOT_STARTED';
    case 'VIDEO_IN_PROGRESS':
      return analytics.stillLearningReason === 'VIDEO_IN_PROGRESS';
    case 'READY_TO_ASSESS':
      return analytics.stillLearningReason === 'VIDEO_COMPLETED_ONLY';
  }
}
