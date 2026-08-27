-- Onboarding gate — Stage 2 (backfill).
-- Deploy together with the application code that reads "onboardedAt"; without
-- this backfill every pre-existing user would be forced back through onboarding.
--
-- There is no historical record of who onboarded, so we infer it from the one
-- side effect only the onboarding flow produced: an AvatarSetting row. The
-- onboarding form always submits an avatarBase (it defaults to SAPPHIRE and the
-- final step cannot be reached without passing through the picker), and
-- POST /api/onboarding always upserts AvatarSetting from it. ensureCurrentUser()
-- -- the lazy-provisioning path -- never creates one.
--
-- The only other writer is PATCH /api/profile/avatar, so a user who never
-- onboarded but did edit their avatar is a false positive here. That is the safe
-- direction to be wrong in: they keep the status quo (not prompted) rather than
-- being pushed into a demographics form long after signing up.
--
-- createdAt is used as the timestamp because the true completion time was never
-- recorded; only the NULL/NOT NULL distinction is load-bearing.
UPDATE "Student" s
SET "onboardedAt" = s."createdAt"
WHERE s."onboardedAt" IS NULL
  AND EXISTS (
    SELECT 1 FROM "AvatarSetting" a WHERE a."studentId" = s."id"
  );
