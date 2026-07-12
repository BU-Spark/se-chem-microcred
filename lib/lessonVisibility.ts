// Release-date gating for lessons shown to students. A lesson's release date is
// derived from the badge(s) it belongs to (via BadgeRequirement): the lesson
// opens once the earliest of its badges opens. A badge with no availableOn is
// always open, so it makes the lesson always visible.

// Returns the date at which the lesson becomes visible, or null if it is always
// visible (no badges, or any badge with no release date).
export function lessonReleaseDate(badgeAvailableOns: Array<Date | null | undefined>): Date | null {
  if (badgeAvailableOns.length === 0) return null;
  if (badgeAvailableOns.some((date) => date == null)) return null;
  const earliest = Math.min(...badgeAvailableOns.map((date) => (date as Date).getTime()));
  return new Date(earliest);
}

// True once the lesson's release date has passed (or it has none).
export function isLessonReleased(releaseDate: Date | null, now: Date = new Date()): boolean {
  return !releaseDate || releaseDate <= now;
}
