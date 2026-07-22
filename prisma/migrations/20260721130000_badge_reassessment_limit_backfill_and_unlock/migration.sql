-- Badge reassessment-limit backfill + unlock of initial-attempt failures.
--
-- Data-only migration (no schema change). Postgres. Idempotent / re-runnable.
--
-- Context:
--   * The system default reassessment limit is 0 (lib/badgePolicy.ts:24), and a
--     student locks when failedAttempts > reassessmentLimit (lib/badgeState.ts).
--     Total allowed = 1 initial + reassessmentLimit retries. So under the old
--     zero-retry default, a single failed initial assessment => LOCKED.
--   * The badge-creation wizard writes reassessmentLimit = 0 explicitly
--     (app/badge_creation/types.ts:157), NOT null — so a NULL-only backfill would
--     miss every wizard-created legacy badge. We use GREATEST() to cover both.
--
-- This migration:
--   1. Raises the authored default on every legacy badge to at least 3.
--   2. Reopens students who were locked purely by the old zero-retry default,
--      provided they are still within the new limit.
-- See docs/badge-state-machine.md and lib/badgePolicy.ts.

BEGIN;

-- 1. Legacy badge defaults -> at least 3.
--    GREATEST(COALESCE(...)) raises NULL and the wizard's explicit 0 up to 3 while
--    preserving any badge deliberately authored MORE generously (e.g. 5).
UPDATE "Badge"
SET "reassessmentLimit" = GREATEST(COALESCE("reassessmentLimit", 0), 3);

-- 2. Unlock students who failed under the old zero-retry default.
--    A LOCKED row already cleared QEV, so it returns to READY_FOR_ASSESSMENT with
--    its cooldown cleared (mirrors the app's PATCH behavior of nulling cooldown on
--    a limit change). The per-row override is lifted to >= 3 so effective-policy
--    inheritance can't silently re-lock them. qevPassedAt is defensively backfilled
--    in case any legacy row lacks it (a READY_FOR_ASSESSMENT row is expected to
--    have it set).
--    GUARD: only unlock rows whose failed-attempt count is still within the new
--    limit (locked iff failed > limit, so unlockable iff failed <= 3). A student
--    who genuinely exhausted all 4 attempts stays LOCKED.
UPDATE "StudentBadge" sb
SET "status" = 'READY_FOR_ASSESSMENT',
    "cooldownUntil" = NULL,
    "reassessmentLimit" = GREATEST(COALESCE(sb."reassessmentLimit", 0), 3),
    "qevPassedAt" = COALESCE(sb."qevPassedAt", sb."updatedAt")
WHERE sb."status" = 'LOCKED'
  AND (
    SELECT COUNT(*) FROM "AssessmentAttempt" aa
    WHERE aa."studentId" = sb."studentId"
      AND aa."badgeId" = sb."badgeId"
      AND aa."passed" = false
  ) <= 3;

COMMIT;
