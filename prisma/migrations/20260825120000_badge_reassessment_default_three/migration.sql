-- Reassessment limit: default of 3 for badges still carrying an explicit 0.
--
-- Data-only migration (no schema change). Postgres. Idempotent / re-runnable.
--
-- Context:
--   * The system default is now 3 (lib/badgePolicy.ts), so a badge with a NULL
--     reassessmentLimit already inherits 3 — those rows need no backfill and are
--     deliberately left NULL so they keep tracking the system default.
--   * The badge-creation wizard used to seed the form with 0 and write it
--     explicitly (app/badge_creation/types.ts), so wizard-created badges carry a
--     literal 0 that does NOT inherit. The earlier
--     20260721130000_badge_reassessment_limit_backfill_and_unlock migration
--     cleared the ones existing at that time; this covers badges created since,
--     while the wizard was still defaulting to 0.
--   * Per-student StudentBadge overrides are intentionally NOT touched: those are
--     set by hand by a checker and are a deliberate per-student decision.
--
-- Only a literal 0 is raised. Any badge authored with a higher limit is preserved.

BEGIN;

UPDATE "Badge"
SET "reassessmentLimit" = 3
WHERE "reassessmentLimit" = 0;

COMMIT;
