-- Instructor "student actions" on a single student's badge.
--
-- qevWaived*: the instructor let a student sit the in-person assessment without
-- finishing the video lesson. This is user-visible state, not just an audit stamp —
-- lesson progress is deliberately left untouched, so the waiver is the only thing
-- that explains why an unfinished lesson unlocked an assessment.
--
-- gradeOverridden*: attribution for a grade recorded outside a normal assessment.
-- The override itself lives in AssessmentAttempt (checkerId + feedback + an
-- isOverride response row); these columns just make the badge row self-describing.
--
-- All four are nullable with no backfill: every existing row is correctly "never
-- waived, never overridden".
ALTER TABLE "StudentBadge"
  ADD COLUMN "qevWaivedAt" TIMESTAMP(3),
  ADD COLUMN "qevWaivedById" TEXT,
  ADD COLUMN "gradeOverriddenAt" TIMESTAMP(3),
  ADD COLUMN "gradeOverriddenById" TEXT;

CREATE INDEX "StudentBadge_qevWaivedById_idx" ON "StudentBadge"("qevWaivedById");
CREATE INDEX "StudentBadge_gradeOverriddenById_idx" ON "StudentBadge"("gradeOverriddenById");

-- SET NULL rather than CASCADE: an instructor leaving the institution must not
-- delete the students' badge rows. The waiver survives, unattributed.
ALTER TABLE "StudentBadge"
  ADD CONSTRAINT "StudentBadge_qevWaivedById_fkey"
  FOREIGN KEY ("qevWaivedById") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StudentBadge"
  ADD CONSTRAINT "StudentBadge_gradeOverriddenById_fkey"
  FOREIGN KEY ("gradeOverriddenById") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
