-- Badge state machine — Stage 2 (backfill + code cutover).
-- Deploy the new state-machine application code together with this migration.
-- Runs in its own transaction, after Stage 1 committed the new enum values.
-- Explicit status IN-lists are used instead of enum ">=" comparisons because at
-- this point the physical enum order is still the pre-drop order.
-- See docs/badge-state-machine.md.

-- 1. Remap the removed pass-pending-survey state onto IN_REVIEW.
UPDATE "StudentBadge"
SET "status" = 'IN_REVIEW'
WHERE "status" = 'READY_FOR_FINALIZATION';

-- 2. Backfill qevPassedAt (best-effort proxy: the true timestamp was never
--    recorded, so use updatedAt) for any row that has cleared QEV — i.e. it is
--    at/after assessment readiness, or it already has an assessment attempt.
UPDATE "StudentBadge" sb
SET "qevPassedAt" = sb."updatedAt"
WHERE sb."qevPassedAt" IS NULL
  AND (
    sb."status" IN ('READY_FOR_ASSESSMENT', 'IN_REVIEW', 'COMPLETED', 'LOCKED')
    OR EXISTS (
      SELECT 1 FROM "AssessmentAttempt" aa
      WHERE aa."studentId" = sb."studentId" AND aa."badgeId" = sb."badgeId"
    )
  );

-- 3. Lift mislabeled rows: a LEARNING row that already has a failed attempt did
--    pass QEV (it was assessed), so it belongs at READY_FOR_ASSESSMENT. Recompute
--    cooldownUntil from the last failed attempt + the effective cooldown
--    (StudentBadge override ?? Badge default ?? 0 days). A null result means the
--    attempt had no completedAt and the student is immediately re-assessable.
UPDATE "StudentBadge" sb
SET "status" = 'READY_FOR_ASSESSMENT',
    "cooldownUntil" = (
      SELECT MAX(aa."completedAt")
             + (COALESCE(sb."cooldownDays", b."cooldownDays", 0) || ' days')::interval
      FROM "AssessmentAttempt" aa
      WHERE aa."studentId" = sb."studentId"
        AND aa."badgeId" = sb."badgeId"
        AND aa."passed" = false
    )
FROM "Badge" b
WHERE sb."badgeId" = b."id"
  AND sb."status" = 'LEARNING'
  AND EXISTS (
    SELECT 1 FROM "AssessmentAttempt" aa
    WHERE aa."studentId" = sb."studentId"
      AND aa."badgeId" = sb."badgeId"
      AND aa."passed" = false
  );

-- 4. OPTIONAL — seed Badge policy defaults from existing StudentBadge overrides so
--    the authored-default inheritance doesn't regress any in-flight student. Left
--    commented because per-student overrides are not necessarily the intended badge
--    default (an operator decision, per the doc's "open defaults"). Uncomment to
--    adopt the most common non-null override per badge as its default.
--
-- UPDATE "Badge" b
-- SET "reassessmentLimit" = COALESCE(b."reassessmentLimit", s."reassessmentLimit"),
--     "cooldownDays"      = COALESCE(b."cooldownDays", s."cooldownDays"),
--     "reassessmentRequired" = COALESCE(b."reassessmentRequired", s."reassessmentRequired")
-- FROM (
--   SELECT DISTINCT ON ("badgeId") "badgeId",
--          "reassessmentLimit", "cooldownDays", "reassessmentRequired"
--   FROM "StudentBadge"
--   WHERE "reassessmentLimit" IS NOT NULL
--      OR "cooldownDays" IS NOT NULL
--      OR "reassessmentRequired" IS NOT NULL
--   ORDER BY "badgeId", "updatedAt" DESC
-- ) s
-- WHERE b."id" = s."badgeId";
