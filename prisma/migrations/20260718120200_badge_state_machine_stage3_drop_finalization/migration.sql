-- Badge state machine — Stage 3 (drop the dead enum value).
-- GATE THIS BEHIND VERIFICATION: apply only after Stage 2 is confirmed and no
-- rows or running code reference 'READY_FOR_FINALIZATION'. This is the one
-- genuinely breaking step — the USING cast below fails if any row still holds the
-- old value, which is exactly why Stage 2 remaps first.
--
-- Postgres has no ALTER TYPE ... DROP VALUE, so this recreates the type. The new
-- type is written in the final canonical order so the DB matches schema.prisma.
-- See docs/badge-state-machine.md.

-- AlterEnum
BEGIN;
CREATE TYPE "BadgeStatus_new" AS ENUM ('LEARNING', 'READY_FOR_ASSESSMENT', 'IN_REVIEW', 'COMPLETED', 'LOCKED');
ALTER TABLE "StudentBadge" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "StudentBadge" ALTER COLUMN "status" TYPE "BadgeStatus_new" USING ("status"::text::"BadgeStatus_new");
ALTER TYPE "BadgeStatus" RENAME TO "BadgeStatus_old";
ALTER TYPE "BadgeStatus_new" RENAME TO "BadgeStatus";
DROP TYPE "BadgeStatus_old";
ALTER TABLE "StudentBadge" ALTER COLUMN "status" SET DEFAULT 'LEARNING';
COMMIT;
