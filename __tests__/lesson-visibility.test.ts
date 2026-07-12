/** @jest-environment node */

import { isLessonReleased, lessonReleaseDate } from '../lib/lessonVisibility';

const NOW = new Date('2026-07-12T12:00:00.000Z');
const PAST = new Date('2026-01-01T00:00:00.000Z');
const FUTURE = new Date('2026-12-31T00:00:00.000Z');
const LATER = new Date('2027-06-01T00:00:00.000Z');

describe('lessonReleaseDate', () => {
  it('is null (always visible) when the lesson has no badges', () => {
    expect(lessonReleaseDate([])).toBeNull();
  });

  it('is null when any badge has no release date', () => {
    expect(lessonReleaseDate([null])).toBeNull();
    expect(lessonReleaseDate([FUTURE, null])).toBeNull();
  });

  it('returns the earliest badge release date', () => {
    expect(lessonReleaseDate([LATER, FUTURE])).toEqual(FUTURE);
    expect(lessonReleaseDate([FUTURE])).toEqual(FUTURE);
  });
});

describe('isLessonReleased', () => {
  it('is released when there is no release date', () => {
    expect(isLessonReleased(null, NOW)).toBe(true);
  });

  it('is released when the date is in the past', () => {
    expect(isLessonReleased(PAST, NOW)).toBe(true);
  });

  it('is not released when the date is in the future', () => {
    expect(isLessonReleased(FUTURE, NOW)).toBe(false);
  });

  it('treats the exact boundary as released', () => {
    expect(isLessonReleased(NOW, NOW)).toBe(true);
  });
});
