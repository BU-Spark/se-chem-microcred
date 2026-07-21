// Effective assessment-policy resolution for badges.
//
// The authored policy lives on `Badge` as the default; `StudentBadge` carries
// nullable per-student overrides. Effective policy resolves as:
//
//   effective = StudentBadge.x ?? Badge.x ?? systemDefault
//
// Keeping this in one place avoids the drift that comes from re-deriving the
// inheritance rule at every call site. See docs/badge-state-machine.md.

export type BadgePolicyFields = {
  reassessmentLimit: number | null;
  cooldownDays: number | null;
  reassessmentRequired: boolean | null;
};

export type EffectiveBadgePolicy = {
  reassessmentLimit: number;
  cooldownDays: number;
  reassessmentRequired: boolean;
};

// Applied when neither the StudentBadge override nor the Badge default is set.
//
// HOTFIX (2026-07-21): reassessmentLimit was added as a nullable column after
// badges/student-badges already existed in prod, so every pre-existing row
// resolves here with null on both sides. Defaulting that case to 0 silently
// locked those students out after their first fail. Until those rows are
// backfilled with an explicit limit, fall through to unlimited reassessments
// instead of 0. Remove once the backfill lands.
export const SYSTEM_DEFAULT_BADGE_POLICY: EffectiveBadgePolicy = {
  reassessmentLimit: Infinity,
  cooldownDays: 0,
  reassessmentRequired: false,
};

function firstDefined<T>(...values: Array<T | null | undefined>): T | undefined {
  for (const value of values) {
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return undefined;
}

// Resolve the effective policy for a single student's badge. Either argument may
// be null/partial (e.g. a badge with no authored policy, or a StudentBadge with
// no overrides); missing fields fall through to the system default.
export function resolveEffectiveBadgePolicy(
  studentOverride: Partial<BadgePolicyFields> | null | undefined,
  badgeDefault: Partial<BadgePolicyFields> | null | undefined
): EffectiveBadgePolicy {
  return {
    reassessmentLimit:
      firstDefined(studentOverride?.reassessmentLimit, badgeDefault?.reassessmentLimit) ??
      SYSTEM_DEFAULT_BADGE_POLICY.reassessmentLimit,
    cooldownDays:
      firstDefined(studentOverride?.cooldownDays, badgeDefault?.cooldownDays) ??
      SYSTEM_DEFAULT_BADGE_POLICY.cooldownDays,
    reassessmentRequired:
      firstDefined(studentOverride?.reassessmentRequired, badgeDefault?.reassessmentRequired) ??
      SYSTEM_DEFAULT_BADGE_POLICY.reassessmentRequired,
  };
}
