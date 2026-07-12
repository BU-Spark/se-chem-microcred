// Determines whether a badge should be visible to a student based on the
// instructor-set release (`availableOn`) and close (`closesOn`) dates.
//
// A badge is visible when:
//   - it has been released: `availableOn` is unset or in the past, AND
//   - it has not closed: `neverCloses` is true, or `closesOn` is unset or in the future.
//
// This gates the "not yet started" badges a student can pick up. Badges the
// student has already started or earned are shown regardless of these dates
// (handled by the caller), so a closed badge never disappears from the wallet.

export type BadgeVisibilityFields = {
  availableOn?: Date | null;
  closesOn?: Date | null;
  neverCloses?: boolean | null;
};

// True once the badge's release date has passed (or none is set). A badge that
// has NOT been released must never be shown to a student, even if an eager
// StudentBadge row exists for it — that row is auto-created, not real activity.
export function isBadgeReleased(badge: BadgeVisibilityFields, now: Date = new Date()): boolean {
  return !badge.availableOn || badge.availableOn <= now;
}

// True when the badge is both released and not yet closed. Used to decide
// whether to offer a badge as newly available / not-yet-started.
export function isBadgeVisible(badge: BadgeVisibilityFields, now: Date = new Date()): boolean {
  const notClosed = badge.neverCloses === true || !badge.closesOn || badge.closesOn >= now;
  return isBadgeReleased(badge, now) && notClosed;
}
