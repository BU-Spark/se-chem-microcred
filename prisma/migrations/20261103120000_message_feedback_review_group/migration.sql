-- "Needs Feedback Review" badge message audience (issue #322). Additive only:
-- existing rows and sends are untouched.
ALTER TYPE "MessageAudience" ADD VALUE IF NOT EXISTS 'BADGE_NEEDS_FEEDBACK_REVIEW';
