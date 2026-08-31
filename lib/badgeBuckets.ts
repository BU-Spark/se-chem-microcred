import { isBadgeClosed } from './badgeAvailability';

export type BadgeStatusName = 'LEARNING' | 'READY_FOR_ASSESSMENT' | 'IN_REVIEW' | 'COMPLETED' | 'LOCKED';

export type BadgeProgressStatus = BadgeStatusName | 'NOT_STARTED' | null | undefined;

export type ProgressBucket = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'UNAVAILABLE';

export interface BadgeProgressInput {
  status: BadgeProgressStatus;
  availableOn?: Date | string | null;
  closesOn?: Date | string | null;
  neverCloses?: boolean | null;

  hasActivity?: boolean;
}

export interface LessonActivity {
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  status?: string | null;
  percentComplete?: number | null;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function hasLessonActivity(progress: LessonActivity | null | undefined): boolean {
  if (!progress) return false;
  return (
    Boolean(progress.startedAt || progress.completedAt) ||
    progress.status === 'IN_PROGRESS' ||
    progress.status === 'COMPLETED' ||
    (progress.percentComplete ?? 0) > 0
  );
}

export function classifyBadgeProgress(input: BadgeProgressInput, now: Date = new Date()): ProgressBucket {
  if (input.status === 'COMPLETED') return 'COMPLETED';

  const availableOn = toDate(input.availableOn);
  if (availableOn && availableOn > now) return 'UNAVAILABLE';

  if (isBadgeClosed({ closesOn: toDate(input.closesOn), neverCloses: input.neverCloses }, now)) {
    return 'UNAVAILABLE';
  }

  if (!input.status || input.status === 'NOT_STARTED') return 'NOT_STARTED';

  if (input.status === 'LEARNING' && !input.hasActivity) return 'NOT_STARTED';

  return 'IN_PROGRESS';
}

export function classifyLessonProgress(
  badges: BadgeProgressInput[],
  fallback: ProgressBucket,
  now: Date = new Date()
): ProgressBucket {
  if (badges.length === 0) return fallback;

  const buckets = badges.map((badge) => classifyBadgeProgress(badge, now));
  const actionable = buckets.filter((bucket) => bucket !== 'UNAVAILABLE');

  if (actionable.length === 0) return 'UNAVAILABLE';

  if (actionable.some((bucket) => bucket === 'IN_PROGRESS')) return 'IN_PROGRESS';
  if (actionable.every((bucket) => bucket === 'COMPLETED')) return 'COMPLETED';
  if (actionable.some((bucket) => bucket === 'COMPLETED')) return 'IN_PROGRESS';

  return 'NOT_STARTED';
}
