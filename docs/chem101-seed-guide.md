# CHEM101 Seed Guide - Student / Assessor / Instructor flows

This guide sets up three real signed-in users against one self-contained
CHEM101 course. The seed is additive for users and scoped for course content:
it refreshes CHEM101 lessons, badges, checkpoints, surveys, and progress, and
it removes the old PLAYTEST course if it exists.

## How Roles Work

There is no global role field on a user. Authentication is Clerk; a user's role
comes from the `Enrollment.role` they hold in a course:

- `STUDENT`
- `INSTRUCTOR`
- `CHECKER`, which is the assessor role

The seed creates CHEM101 and enrolls all three accounts up front. The student
and assessor do not need to join the course after signing in.

## Setup

```bash
npm run db:seed
npm run dev
```

Set `SEEDED_DEMO_EMAIL` in `.env.local` to use your own Clerk account as the
instructor. If it is not set, the instructor falls back to
`jacksoncg730+clerk_test@gmail.com`. The student and assessor use Clerk test
emails.

| Role | Email | Course access |
|------|-------|---------------|
| Instructor | `SEEDED_DEMO_EMAIL`, or `jacksoncg730+clerk_test@gmail.com` if unset | owns CHEM101 |
| Student | `student+clerk_test@bu.edu` | enrolled as student |
| Assessor | `checker+clerk_test@bu.edu` | enrolled as active assessor |

For the student and assessor test emails, create Clerk accounts once through
`/sign-up` and use Clerk's development verification code `424242`.

On the first authenticated request, `ensureCurrentUser()` matches the Clerk
email to the already-seeded DB user, so the existing enrollment/role is picked
up automatically.

## What The Seed Includes

The seed includes the full lesson, badge, checkpoint, survey, progress, and
analytics dataset from the original demo seed under CHEM101.

The student starts with progress across 7 CHEM101 badges:

| Badge | Status | Who acts on it |
|-------|--------|----------------|
| `lab-notebook-badge` | `READY_FOR_ASSESSMENT` | assessor grades it |
| `volumetric-stock-badge` | `READY_FOR_FINALIZATION` with score 92 | student completes survey |
| `general-waste-badge` | `COMPLETED` with score 96 | already earned |
| 4 others | `LEARNING` | student works toward submitting |

## Instructor Flow

Sign in as `SEEDED_DEMO_EMAIL`, or `jacksoncg730+clerk_test@gmail.com` if the env var is unset.

Home shows a "My Courses" section with Chem 101: Safety Foundations.

1. Open the course card to `/courses/[courseId]`.
2. Review lessons, assigned badges, roster, course contacts, and settings.
3. Open `/roster?courseId=...`, select Jane Student, and use Edit badge settings
   on a badge card to test reassessment/cooldown configuration.
4. Use `/my_badges` and `/badge_creation` to exercise badge creation/editing.
5. Use `/courses/[courseId]/[badgeId]` to view class progress for a badge.

## Student Flow

Sign in as `student+clerk_test@bu.edu`.

Home shows a "My Enrolled Courses" section. CHEM101 is already there.

1. Open the course to `/course_dashboard?courseId=...`.
2. Start a lesson, answer checkpoint questions, and submit a completed badge for
   assessment.
3. Open `/badges` and use the QR/code modal for a badge that is ready for
   assessment.
4. Complete the finalization survey for `volumetric-stock-badge`.
5. Review profile, avatar, and analytics pages.

## Assessor Flow

Sign in as `checker+clerk_test@bu.edu`.

Home shows an "Assessor Courses" section. CHEM101 is already there and the
assessor enrollment is already active.

1. Open the course as assessor. The card links to
   `/courses/[courseId]?view=assessor`.
2. Click Assess Student, enter the assessment code displayed under the student's
   QR code, and continue to the assessment page.
3. Or open the ready badge directly from `/courses/[courseId]/[badgeId]` and
   select Jane Student's row for `lab-notebook-badge`.
4. Submit pass/fail, score, feedback, and per-criterion notes via the assessment
   form. A pass advances the badge to `READY_FOR_FINALIZATION`.
5. Confirm the assessor can also view `/roster` and the student detail page.

## End-To-End Loop

1. Student submits a `LEARNING` badge for assessment.
2. Assessor grades it as passing.
3. Student sees it under Ready to Finalize and completes the survey.
4. Instructor sees the updated counts on the course badge detail page.

## Resetting

`npm run db:seed` is idempotent and safe to rerun. The three users, CHEM101
course, and enrollments are preserved with stable ids, while lessons, badges,
surveys, and student progress are rebuilt to the known starting state.

To inspect rows directly:

```bash
npx prisma studio
```
