// The reminder frequencies an instructor can pick, in days.
export const REMINDER_INTERVAL_OPTIONS = [1, 2, 3, 7] as const;
export const DEFAULT_REMINDER_INTERVAL_DAYS = 3;

export function normalizeReminderInterval(value: unknown): number {
  return REMINDER_INTERVAL_OPTIONS.includes(value as (typeof REMINDER_INTERVAL_OPTIONS)[number])
    ? (value as number)
    : DEFAULT_REMINDER_INTERVAL_DAYS;
}

export function describeReminderInterval(days: number) {
  return days === 1 ? 'daily' : `every ${days} days`;
}
