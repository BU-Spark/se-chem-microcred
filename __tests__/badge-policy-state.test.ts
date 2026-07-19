import { BadgeStatus } from '@prisma/client';

import { SYSTEM_DEFAULT_BADGE_POLICY, resolveEffectiveBadgePolicy } from '../lib/badgePolicy';
import { computeCooldownUntil, isCoolingDown, isLockedOut, resolveFailAcknowledge } from '../lib/badgeState';

describe('resolveEffectiveBadgePolicy', () => {
  it('falls back to the system default when nothing is set', () => {
    expect(resolveEffectiveBadgePolicy(null, null)).toEqual(SYSTEM_DEFAULT_BADGE_POLICY);
  });

  it('uses the badge default when the student has no override', () => {
    const badge = { reassessmentLimit: 2, cooldownDays: 3, reassessmentRequired: true };
    expect(resolveEffectiveBadgePolicy(null, badge)).toEqual(badge);
  });

  it('lets the student override win over the badge default', () => {
    const effective = resolveEffectiveBadgePolicy(
      { reassessmentLimit: 5, cooldownDays: null, reassessmentRequired: false },
      { reassessmentLimit: 2, cooldownDays: 3, reassessmentRequired: true }
    );
    // reassessmentLimit + reassessmentRequired come from the override; cooldownDays
    // is null on the override so it inherits the badge default.
    expect(effective).toEqual({ reassessmentLimit: 5, cooldownDays: 3, reassessmentRequired: false });
  });

  it('treats 0 as a real override, not a fallthrough', () => {
    const effective = resolveEffectiveBadgePolicy({ reassessmentLimit: 0 }, { reassessmentLimit: 4 });
    expect(effective.reassessmentLimit).toBe(0);
  });
});

describe('isLockedOut', () => {
  it('locks once failed attempts exceed the reassessment limit', () => {
    const policy = { reassessmentLimit: 0, cooldownDays: 0, reassessmentRequired: false };
    // Total allowed = 1 + 0 = 1. The first fail locks.
    expect(isLockedOut(0, policy)).toBe(false);
    expect(isLockedOut(1, policy)).toBe(true);
  });

  it('allows reassessmentLimit reassessments on top of the free attempt', () => {
    const policy = { reassessmentLimit: 2, cooldownDays: 0, reassessmentRequired: false };
    // Total allowed = 3. Locks only when the 3rd attempt (failedAttempts=3) fails.
    expect(isLockedOut(1, policy)).toBe(false);
    expect(isLockedOut(2, policy)).toBe(false);
    expect(isLockedOut(3, policy)).toBe(true);
  });
});

describe('computeCooldownUntil / isCoolingDown', () => {
  it('returns null for a zero-day cooldown', () => {
    const policy = { reassessmentLimit: 1, cooldownDays: 0, reassessmentRequired: false };
    expect(computeCooldownUntil(new Date('2026-07-18T00:00:00Z'), policy)).toBeNull();
  });

  it('adds cooldownDays to the acknowledge time', () => {
    const policy = { reassessmentLimit: 1, cooldownDays: 2, reassessmentRequired: false };
    const from = new Date('2026-07-18T00:00:00Z');
    expect(computeCooldownUntil(from, policy)).toEqual(new Date('2026-07-20T00:00:00Z'));
  });

  it('is cooling down only before the cooldown end', () => {
    const until = new Date('2026-07-20T00:00:00Z');
    expect(isCoolingDown(until, new Date('2026-07-19T00:00:00Z'))).toBe(true);
    expect(isCoolingDown(until, new Date('2026-07-21T00:00:00Z'))).toBe(false);
    expect(isCoolingDown(null, new Date('2026-07-19T00:00:00Z'))).toBe(false);
  });
});

describe('resolveFailAcknowledge', () => {
  it('routes a retry-eligible fail back to READY_FOR_ASSESSMENT with a cooldown', () => {
    const policy = { reassessmentLimit: 2, cooldownDays: 2, reassessmentRequired: false };
    const now = new Date('2026-07-18T00:00:00Z');
    const result = resolveFailAcknowledge(1, policy, now);
    expect(result.status).toBe(BadgeStatus.READY_FOR_ASSESSMENT);
    expect(result.cooldownUntil).toEqual(new Date('2026-07-20T00:00:00Z'));
  });

  it('locks a fail that exhausts the attempt budget', () => {
    const policy = { reassessmentLimit: 0, cooldownDays: 5, reassessmentRequired: false };
    const result = resolveFailAcknowledge(1, policy, new Date('2026-07-18T00:00:00Z'));
    expect(result.status).toBe(BadgeStatus.LOCKED);
    expect(result.cooldownUntil).toBeNull();
  });
});
