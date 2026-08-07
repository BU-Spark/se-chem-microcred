import {
  combineRatingSummaries,
  emptyRatingSummary,
  isValidRating,
  nearestRatingFace,
  summarizeRatings,
} from '@/lib/surveyRatings';

describe('isValidRating', () => {
  it.each([1, 2, 3, 4, 5])('accepts %s', (value) => {
    expect(isValidRating(value)).toBe(true);
  });

  it.each([0, 6, -1, 2.5, null, undefined, '4', NaN])('rejects %s', (value) => {
    expect(isValidRating(value)).toBe(false);
  });
});

describe('summarizeRatings', () => {
  it('reports the mean to one decimal alongside the full distribution', () => {
    const summary = summarizeRatings([5, 4, 4, 3, 1]);

    expect(summary.count).toBe(5);
    expect(summary.average).toBe(3.4);
    expect(summary.distribution).toEqual({ 1: 1, 2: 0, 3: 1, 4: 2, 5: 1 });
  });

  it('returns a null average rather than 0 when nobody has responded', () => {
    expect(summarizeRatings([])).toEqual(emptyRatingSummary());
    expect(summarizeRatings([]).average).toBeNull();
  });

  it('drops out-of-range values instead of clamping them into the mean', () => {
    const summary = summarizeRatings([5, 9, 0, -3, 1]);

    expect(summary.count).toBe(2);
    expect(summary.average).toBe(3);
    expect(summary.distribution).toEqual({ 1: 1, 2: 0, 3: 0, 4: 0, 5: 1 });
  });

  it('keeps every bucket present so a histogram can render zeros', () => {
    expect(Object.keys(summarizeRatings([3]).distribution)).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('combineRatingSummaries', () => {
  it('weights each response equally rather than averaging the averages', () => {
    // One lesson with nine 5s and one with a single 1: response-weighted this is
    // 4.6, whereas averaging the two lesson averages would read 3.0.
    const busy = summarizeRatings(Array(9).fill(5));
    const quiet = summarizeRatings([1]);

    const combined = combineRatingSummaries([busy, quiet]);

    expect(combined.count).toBe(10);
    expect(combined.average).toBe(4.6);
    expect(combined.distribution).toEqual({ 1: 1, 2: 0, 3: 0, 4: 0, 5: 9 });
  });

  it('ignores lessons nobody rated', () => {
    const combined = combineRatingSummaries([summarizeRatings([4, 4]), emptyRatingSummary()]);

    expect(combined.count).toBe(2);
    expect(combined.average).toBe(4);
  });

  it('is empty when every lesson is empty', () => {
    expect(combineRatingSummaries([emptyRatingSummary(), emptyRatingSummary()])).toEqual(emptyRatingSummary());
  });
});

describe('nearestRatingFace', () => {
  it('rounds the average to the face that represents it', () => {
    expect(nearestRatingFace(summarizeRatings([4, 5]))).toBe(5);
    expect(nearestRatingFace(summarizeRatings([3, 4]))).toBe(4);
    expect(nearestRatingFace(summarizeRatings([1, 2]))).toBe(2);
  });

  it('has no face when there are no ratings', () => {
    expect(nearestRatingFace(emptyRatingSummary())).toBeNull();
  });
});
