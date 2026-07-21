// Pure helpers for the badge assessment state.
//
// These encode the transition rules from docs/badge-state-machine.md so the API
// routes stay thin and the rules live in one tested place. None of them touch the
// database — callers load the inputs (status, attempt history, effective policy)
// and apply the returned decision.

import { BadgeStatus } from '@prisma/client';

import type { EffectiveBadgePolicy } from './badgePolicy';

const DAY_MS = 24 * 60 * 60 * 1000;

// Attempt budget: everyone gets 1 free assessment, then `reassessmentLimit`
// reassessments on top, so total allowed = 1 + reassessmentLimit. A student is
// locked out once a fail occurs and the failed-attempt count has passed the
// reassessment limit (i.e. the (1 + reassessmentLimit)-th attempt fails).
export function isLockedOut(failedAttempts: number, policy: EffectiveBadgePolicy): boolean {
  return failedAttempts > policy.reassessmentLimit;
}

// Cooldown end for a fail acknowledged at `from`. Zero-day cooldown => no gate.
export function computeCooldownUntil(from: Date, policy: EffectiveBadgePolicy): Date | null {
  if (policy.cooldownDays <= 0) {
    return null;
  }
  return new Date(from.getTime() + policy.cooldownDays * DAY_MS);
}

// Assessment is blocked while the clock hasn't reached cooldownUntil.
export function isCoolingDown(cooldownUntil: Date | null | undefined, now: Date = new Date()): boolean {
  return Boolean(cooldownUntil && now < cooldownUntil);
}

export type FailAcknowledgeResult = {
  status: BadgeStatus; // READY_FOR_ASSESSMENT (retry) or LOCKED (terminal)
  cooldownUntil: Date | null;
};

// The fail-path transition, applied when the student acknowledges the feedback of
// a failed attempt. Passing attempts do not use this — they route through the
// pass-path acknowledge+rate to COMPLETED.
export function resolveFailAcknowledge(
  failedAttempts: number,
  policy: EffectiveBadgePolicy,
  now: Date = new Date()
): FailAcknowledgeResult {
  if (isLockedOut(failedAttempts, policy)) {
    return { status: BadgeStatus.LOCKED, cooldownUntil: null };
  }
  return {
    status: BadgeStatus.READY_FOR_ASSESSMENT,
    cooldownUntil: computeCooldownUntil(now, policy),
  };
}
