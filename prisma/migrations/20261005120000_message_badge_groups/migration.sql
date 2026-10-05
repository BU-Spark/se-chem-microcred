-- Badge group message audiences (issue #303). Additive only: existing rows and
-- sends are untouched.
ALTER TYPE "MessageAudience" ADD VALUE IF NOT EXISTS 'BADGE_NOT_STARTED';
ALTER TYPE "MessageAudience" ADD VALUE IF NOT EXISTS 'BADGE_VIDEO_IN_PROGRESS';
ALTER TYPE "MessageAudience" ADD VALUE IF NOT EXISTS 'BADGE_READY_TO_ASSESS';
