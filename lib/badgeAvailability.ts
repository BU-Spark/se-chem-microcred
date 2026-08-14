type BadgeWindow = {
  closesOn?: Date | null;
  neverCloses?: boolean | null;
};

export function isBadgeClosed(badge: BadgeWindow, now: Date = new Date()) {
  return badge.neverCloses !== true && Boolean(badge.closesOn && badge.closesOn <= now);
}

export function lessonDeadline(legacyDueDate: Date | null | undefined, badges: BadgeWindow[]) {
  const badgeDeadlines = badges
    .filter((badge) => badge.neverCloses !== true && badge.closesOn)
    .map((badge) => (badge.closesOn as Date).getTime());

  if (badgeDeadlines.length > 0) return new Date(Math.min(...badgeDeadlines));
  return legacyDueDate ?? null;
}

// A shared lesson remains usable while at least one associated badge is open.
// Legacy lessons without badge window data fall back to Lesson.dueDate.
export function isLessonClosed(legacyDueDate: Date | null | undefined, badges: BadgeWindow[], now: Date = new Date()) {
  if (badges.length > 0) {
    const hasExplicitWindow = badges.some((badge) => badge.neverCloses != null || badge.closesOn != null);
    if (hasExplicitWindow) return badges.every((badge) => isBadgeClosed(badge, now));
  }
  return Boolean(legacyDueDate && legacyDueDate <= now);
}
