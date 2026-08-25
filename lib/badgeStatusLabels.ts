// The one place a BadgeStatus is turned into student-facing text.
//
// This used to be a private map on the badge feedback page while the course
// dashboard spelled the same states out inline, and the two drifted: the course
// tab collapsed IN_REVIEW and READY_FOR_ASSESSMENT into a single "Assessment in
// progress" label, so a badge that had already moved to IN_REVIEW still read as
// awaiting assessment while the feedback tab correctly said "In review".
//
// Keyed by the string form of BadgeStatus so client components can use it without
// importing the Prisma enum. 'NOT_STARTED' is a client-only pseudo-status from
// BadgeRecord (a badge with no StudentBadge row yet).

export const BADGE_STATUS_LABEL: Record<string, string> = {
  LEARNING: 'Still learning',
  READY_FOR_ASSESSMENT: 'Ready for assessment',
  IN_REVIEW: 'In review',
  COMPLETED: 'Completed',
  LOCKED: 'Locked',
};

export function describeBadgeStatus(status: string): string {
  return BADGE_STATUS_LABEL[status] ?? 'Status';
}
