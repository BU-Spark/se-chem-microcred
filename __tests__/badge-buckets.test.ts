import { classifyBadgeProgress, classifyLessonProgress, hasLessonActivity } from '../lib/badgeBuckets';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const PAST = new Date('2026-01-01T00:00:00.000Z');
const FUTURE = new Date('2026-12-01T00:00:00.000Z');

describe('hasLessonActivity', () => {
  it('is false with no progress row at all', () => {
    expect(hasLessonActivity(null)).toBe(false);
    expect(hasLessonActivity(undefined)).toBe(false);
  });

  it('is false for an untouched row', () => {
    expect(hasLessonActivity({ status: 'NOT_STARTED', percentComplete: 0 })).toBe(false);
  });

  // A row can carry real activity while its status still reads NOT_STARTED, which is
  // why the check is not simply `status !== 'NOT_STARTED'`.
  it.each([
    ['a start timestamp', { status: 'NOT_STARTED', startedAt: PAST }],
    ['a completion timestamp', { status: 'NOT_STARTED', completedAt: PAST }],
    ['partial progress', { status: 'NOT_STARTED', percentComplete: 40 }],
    ['a live status', { status: 'IN_PROGRESS', percentComplete: 0 }],
    ['a completed status', { status: 'COMPLETED', percentComplete: 0 }],
  ])('is true given %s', (_label, progress) => {
    expect(hasLessonActivity(progress)).toBe(true);
  });
});

describe('classifyBadgeProgress', () => {
  it('treats a badge with no StudentBadge row as not started', () => {
    expect(classifyBadgeProgress({ status: null }, NOW)).toBe('NOT_STARTED');
    expect(classifyBadgeProgress({ status: 'NOT_STARTED' }, NOW)).toBe('NOT_STARTED');
  });

  // StudentBadge rows are created eagerly at badge creation/import, so a LEARNING row
  // on its own does not mean the student has begun (issue #271).
  it('treats an eagerly-created LEARNING row with no lesson activity as not started', () => {
    expect(classifyBadgeProgress({ status: 'LEARNING', hasActivity: false }, NOW)).toBe('NOT_STARTED');
  });

  it('treats a LEARNING row with lesson activity as in progress', () => {
    expect(classifyBadgeProgress({ status: 'LEARNING', hasActivity: true }, NOW)).toBe('IN_PROGRESS');
  });

  // Everything started but unfinished is in progress, LOCKED included: the student is
  // out of reassessment attempts, which is terminal but is not completion (issue #275).
  it.each(['READY_FOR_ASSESSMENT', 'IN_REVIEW', 'LOCKED'] as const)('treats %s as in progress', (status) => {
    expect(classifyBadgeProgress({ status }, NOW)).toBe('IN_PROGRESS');
  });

  it('treats COMPLETED as completed', () => {
    expect(classifyBadgeProgress({ status: 'COMPLETED' }, NOW)).toBe('COMPLETED');
  });

  describe('availability window', () => {
    it('excludes a badge that has not opened yet', () => {
      expect(classifyBadgeProgress({ status: null, availableOn: FUTURE }, NOW)).toBe('UNAVAILABLE');
    });

    it('includes a badge whose window has already opened', () => {
      expect(classifyBadgeProgress({ status: null, availableOn: PAST }, NOW)).toBe('NOT_STARTED');
    });

    it('excludes a badge whose window has closed', () => {
      expect(classifyBadgeProgress({ status: 'LEARNING', hasActivity: true, closesOn: PAST }, NOW)).toBe('UNAVAILABLE');
    });

    it('keeps a badge whose close date is still ahead', () => {
      expect(classifyBadgeProgress({ status: 'LEARNING', hasActivity: true, closesOn: FUTURE }, NOW)).toBe(
        'IN_PROGRESS'
      );
    });

    it('ignores a past close date when the badge never closes', () => {
      expect(classifyBadgeProgress({ status: null, closesOn: PAST, neverCloses: true }, NOW)).toBe('NOT_STARTED');
    });

    // The one deliberate ordering choice: a badge the student already earned stays
    // earned. Filtering it out with the other closed badges would delete it from their
    // "Completed" count the moment the deadline passed.
    it('keeps an earned badge completed after its window closes', () => {
      expect(classifyBadgeProgress({ status: 'COMPLETED', closesOn: PAST }, NOW)).toBe('COMPLETED');
    });

    it('keeps an earned badge completed even if it was never released', () => {
      expect(classifyBadgeProgress({ status: 'COMPLETED', availableOn: FUTURE }, NOW)).toBe('COMPLETED');
    });
  });

  it('accepts ISO strings as well as Dates, for client callers', () => {
    expect(classifyBadgeProgress({ status: null, availableOn: FUTURE.toISOString() }, NOW)).toBe('UNAVAILABLE');
    expect(classifyBadgeProgress({ status: null, closesOn: PAST.toISOString() }, NOW)).toBe('UNAVAILABLE');
  });

  it('ignores unparseable dates rather than throwing', () => {
    expect(classifyBadgeProgress({ status: null, availableOn: 'not-a-date' }, NOW)).toBe('NOT_STARTED');
  });
});

describe('classifyLessonProgress', () => {
  it('falls back to lesson status when no badge backs the lesson', () => {
    expect(classifyLessonProgress([], 'IN_PROGRESS', NOW)).toBe('IN_PROGRESS');
    expect(classifyLessonProgress([], 'COMPLETED', NOW)).toBe('COMPLETED');
  });

  it('is unavailable only when every backing badge is', () => {
    expect(classifyLessonProgress([{ status: null, availableOn: FUTURE }], 'NOT_STARTED', NOW)).toBe('UNAVAILABLE');
    expect(
      classifyLessonProgress([{ status: null, availableOn: FUTURE }, { status: 'IN_REVIEW' }], 'NOT_STARTED', NOW)
    ).toBe('IN_PROGRESS');
  });

  it('reports in progress when any actionable badge is underway', () => {
    expect(classifyLessonProgress([{ status: null }, { status: 'READY_FOR_ASSESSMENT' }], 'NOT_STARTED', NOW)).toBe(
      'IN_PROGRESS'
    );
  });

  it('reports completed only when every actionable badge is earned', () => {
    expect(classifyLessonProgress([{ status: 'COMPLETED' }, { status: 'COMPLETED' }], 'COMPLETED', NOW)).toBe(
      'COMPLETED'
    );
  });

  // Partly earned is still underway, not finished.
  it('reports in progress when only some badges are earned', () => {
    expect(classifyLessonProgress([{ status: 'COMPLETED' }, { status: null }], 'COMPLETED', NOW)).toBe('IN_PROGRESS');
  });

  it('reports not started when no actionable badge has been touched', () => {
    expect(
      classifyLessonProgress([{ status: null }, { status: 'LEARNING', hasActivity: false }], 'NOT_STARTED', NOW)
    ).toBe('NOT_STARTED');
  });
});
