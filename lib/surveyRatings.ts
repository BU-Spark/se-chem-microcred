// Aggregates 1–5 survey ratings for the instructor-facing rating panel on the
// badge page. Pure, so the API route, the tests, and any future surface share
// one definition of "the average" and one rounding rule.

export const RATING_MIN = 1;
export const RATING_MAX = 5;

export type RatingSummary = {
  count: number;
  /** Mean to one decimal, or null when nobody has responded. */
  average: number | null;
  /** Response counts keyed 1–5; every key is present, zeros included. */
  distribution: Record<number, number>;
};

export function isValidRating(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= RATING_MIN && value <= RATING_MAX;
}

function emptyDistribution(): Record<number, number> {
  const distribution: Record<number, number> = {};
  for (let value = RATING_MIN; value <= RATING_MAX; value += 1) {
    distribution[value] = 0;
  }

  return distribution;
}

export function emptyRatingSummary(): RatingSummary {
  return { count: 0, average: null, distribution: emptyDistribution() };
}

/**
 * Ratings outside 1–5 are dropped rather than clamped: a value that far off is a
 * bad write, and averaging it in would quietly skew the number instructors read.
 */
export function summarizeRatings(ratings: Array<number | null | undefined>): RatingSummary {
  const distribution = emptyDistribution();
  let total = 0;
  let count = 0;

  for (const rating of ratings) {
    if (!isValidRating(rating)) continue;

    distribution[rating] += 1;
    total += rating;
    count += 1;
  }

  return {
    count,
    average: count > 0 ? Math.round((total / count) * 10) / 10 : null,
    distribution,
  };
}

/** Rolls per-lesson summaries into one, weighting each response equally. */
export function combineRatingSummaries(summaries: RatingSummary[]): RatingSummary {
  const distribution = emptyDistribution();
  let total = 0;
  let count = 0;

  for (const summary of summaries) {
    for (let value = RATING_MIN; value <= RATING_MAX; value += 1) {
      const responses = summary.distribution[value] ?? 0;
      distribution[value] += responses;
      total += responses * value;
      count += responses;
    }
  }

  return {
    count,
    average: count > 0 ? Math.round((total / count) * 10) / 10 : null,
    distribution,
  };
}

/** The 1–5 face a summary's average rounds to, for picking an emoji. */
export function nearestRatingFace(summary: RatingSummary): number | null {
  if (summary.average == null) return null;

  return Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round(summary.average)));
}
