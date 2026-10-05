import {
  badgeMessageGroupMatches,
  deriveBadgeAnalytics,
  isBadgeMessageGroup,
  type BadgeAnalyticsInput,
  type BadgeMessageGroup,
} from './badgeAnalyticsStatus';

const VIDEO_STARTED = {
  status: 'IN_PROGRESS',
  startedAt: '2026-10-01T00:00:00.000Z',
  completedAt: null,
  percentComplete: 40,
};
const VIDEO_DONE = {
  status: 'COMPLETED',
  startedAt: '2026-10-01T00:00:00.000Z',
  completedAt: '2026-10-02T00:00:00.000Z',
  percentComplete: 100,
};

function input(overrides: Partial<BadgeAnalyticsInput> = {}): BadgeAnalyticsInput {
  return {
    progress: { status: 'LEARNING' },
    lessonProgress: [],
    assessmentAttempts: [],
    surveyResponseCount: 0,
    ...overrides,
  };
}

// Which of the three message groups a student lands in (null = none of them).
function groupOf(value: BadgeAnalyticsInput): BadgeMessageGroup | null {
  const analytics = deriveBadgeAnalytics(value);
  const groups = (['NOT_STARTED', 'VIDEO_IN_PROGRESS', 'READY_TO_ASSESS'] as const).filter((group) =>
    badgeMessageGroupMatches(group, analytics)
  );
  expect(groups.length).toBeLessThanOrEqual(1);
  return groups[0] ?? null;
}

describe('deriveBadgeAnalytics + badgeMessageGroupMatches', () => {
  it('treats an eagerly created LEARNING row with no activity as not started', () => {
    expect(groupOf(input())).toBe('NOT_STARTED');
  });

  it('treats a student with no badge row as not started', () => {
    expect(groupOf(input({ progress: null }))).toBe('NOT_STARTED');
  });

  it('puts a student partway through the video in VIDEO_IN_PROGRESS', () => {
    expect(groupOf(input({ lessonProgress: [VIDEO_STARTED] }))).toBe('VIDEO_IN_PROGRESS');
  });

  it('puts a student who finished the video, unassessed, in READY_TO_ASSESS', () => {
    expect(groupOf(input({ lessonProgress: [VIDEO_DONE] }))).toBe('READY_TO_ASSESS');
  });

  it('trusts READY_FOR_ASSESSMENT even without a progress row', () => {
    expect(groupOf(input({ progress: { status: 'READY_FOR_ASSESSMENT' }, lessonProgress: [VIDEO_STARTED] }))).toBe(
      'READY_TO_ASSESS'
    );
  });

  it('leaves out a student who failed an in-person attempt', () => {
    expect(groupOf(input({ lessonProgress: [VIDEO_DONE], assessmentAttempts: [{ passed: false }] }))).toBeNull();
  });

  it('leaves out locked, in-review, and completed students', () => {
    expect(groupOf(input({ progress: { status: 'LOCKED' }, lessonProgress: [VIDEO_DONE] }))).toBeNull();
    expect(
      groupOf(
        input({
          progress: { status: 'IN_REVIEW' },
          lessonProgress: [VIDEO_DONE],
          assessmentAttempts: [{ passed: true }],
        })
      )
    ).toBeNull();
    expect(groupOf(input({ progress: { status: 'COMPLETED' }, lessonProgress: [VIDEO_DONE] }))).toBeNull();
  });

  it('reconciles a stale IN_REVIEW row with recorded feedback to COMPLETED', () => {
    const analytics = deriveBadgeAnalytics(
      input({ progress: { status: 'IN_REVIEW' }, assessmentAttempts: [{ passed: true }], surveyResponseCount: 1 })
    );
    expect(analytics.status).toBe('COMPLETED');
    expect(analytics.analyticsStatus).toBe('PROFICIENT');
  });
});

describe('isBadgeMessageGroup', () => {
  it('accepts only the three known groups', () => {
    expect(isBadgeMessageGroup('NOT_STARTED')).toBe(true);
    expect(isBadgeMessageGroup('READY_TO_ASSESS')).toBe(true);
    expect(isBadgeMessageGroup('EVERYONE')).toBe(false);
    expect(isBadgeMessageGroup(null)).toBe(false);
  });
});
