// Our mapper for badge status to user facing labels.
export const BADGE_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: 'Not started',
  LEARNING: 'Still learning',
  READY_FOR_ASSESSMENT: 'Ready for assessment',
  IN_REVIEW: 'In review',
  COMPLETED: 'Completed',
  LOCKED: 'Locked',
};

export function describeBadgeStatus(status: string): string {
  return BADGE_STATUS_LABEL[status] ?? 'Status';
}
