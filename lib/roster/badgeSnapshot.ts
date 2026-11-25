import { BadgeStatus, type Prisma } from '@prisma/client';

export type BadgeSnapshotResponse = {
  /** Number of badges in the course: the denominator of every student's progress. */
  badgeCount: number;
  /** Badges completed, keyed by student id. A student with none is left out (read as 0). */
  completed: Record<string, number>;
  fetchedAt: string;
};

/** Prisma filter for a completed StudentBadge row. */
export const COMPLETED_BADGE_WHERE = {
  OR: [{ status: BadgeStatus.COMPLETED }, { awardedAt: { not: null } }],
} satisfies Prisma.StudentBadgeWhereInput;

/** The same rule as COMPLETED_BADGE_WHERE, for one row in memory. */
export function isCompletedBadge(row: { status: BadgeStatus | null; awardedAt: Date | string | null }) {
  return row.status === BadgeStatus.COMPLETED || Boolean(row.awardedAt);
}
