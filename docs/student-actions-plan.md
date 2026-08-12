# Student Actions (instructor-scoped)

**Status:** implemented on `feature/instructor-actions-jg`; migration not yet applied to any live database
**Date:** 2026-08-11

Three instructor-only actions on a single student's single badge, surfaced from the
badge detail view in the roster. Decisions below were settled with the PM; the
rationale for each is recorded so nobody re-litigates them mid-build.

---

## Where it lives

The entry point already exists. On [`/roster/[studentId]?courseId=…&badgeId=…`](../app/roster/[studentId]/page.tsx),
once a badge is selected, the page renders `BadgeDetailCard` followed by an action
row containing **Edit configurations** ([page.tsx:559](../app/roster/[studentId]/page.tsx)).

Add one sibling button — **Student actions** — opening a modal with the three
actions, each with a tooltip. No new route, no new page, no change to badge
selection or navigation.

Reuse, in order of preference:

| Need | Existing thing to reuse |
|---|---|
| Modal shell, focus trap, overlay, save/cancel | `StudentBadgeConfigModal` + its CSS module |
| Server endpoint | `PATCH` on `/api/courses/[courseId]/students/[studentId]/badges/[badgeId]` |
| Auth preamble | `authorizeBadgeRequest` + `resolveBadgeAccess` in that route |
| Refresh after mutate | `refreshBadgeDetail()` from `useInstructorStudentBadgeDetail` |
| Override-attempt shape | the checker-override `isOverride` response row ([route.ts:986](../app/api/courses/[courseId]/students/[studentId]/badges/[badgeId]/route.ts)) |

The modal is a new component (`StudentActionsModal.tsx`) rather than more branches
inside the config modal — the two have nothing in common beyond the shell, and the
config modal's single save button doesn't fit three independent destructive actions.
It imports the same CSS module.

---

## Permissions

INSTRUCTOR and course creator only. CHECKERs are excluded even though they can
already grade through this route.

`resolveBadgeAccess` gained a fourth `BadgeAccessAction` — `'manage'` — that rejects
`CHECKER` the way the existing actions reject `STUDENT`. It answers **403**, not the
usual 404: a checker can legitimately see this badge, so hiding it would only
confuse, and the refusal leaks nothing they don't already know.

The button is hidden client-side off the viewer's own role. The profile route
already computed `effectiveViewerRole` but didn't return it — the page only knew the
*subject's* role (`memberRole`), so it had no way to tell an instructor from a
checker. It now returns `viewerRole` too. The server enforces the rule
independently; the hidden button is convenience, not the gate.

---

## Action 1 — Reset badge progress

**Tooltip:** "Permanently deletes this student's video-lesson progress, precheck
answers, and assessment history for this badge. They start over from scratch. This
cannot be undone."

Full destructive wipe, inside one `prisma.$transaction`:

1. Delete `AssessmentTaskResponse` → `AssessmentAttempt` for `(studentId, badgeId)`.
2. Delete `CheckpointResponse`, `CheckpointAttempt`, `SegmentProgress`,
   `LessonAttempt`, `LessonProgress` for `(studentId, lessonId ∈ badge requirement
   lessons)`.
3. Reset the `StudentBadge` row in place — `status: LEARNING`, and null out `score`,
   `awardedAt`, `qevPassedAt`, `qevWaivedAt`, `qevWaivedById`, `cooldownUntil`,
   `feedbackReviewedAt`, `gradeOverriddenAt`, `gradeOverriddenById`.

**The row is reset, never deleted.** Deleting `StudentBadge` is the badge-unassign
failure mode already on file — it FK-cascades into the student's whole history and
threw a P2003 in prod. Reset must not reintroduce it.

**The student's ratings go too** — their `SurveyResponse` rows for this badge's
BADGE prompt and for its requirement lessons' LESSON prompts. Both survey routes
key on `(promptId, studentId)` and update rather than insert, so a surviving rating
would not *double-count*; the problem is subtler. It would keep an opinion of an
assessment this reset says never happened in the badge's average, until the student
happens to redo the badge and overwrite it. Clearing them keeps the aggregate
describing only work that still exists.

**Per-student policy overrides survive** — `reassessmentLimit`, `cooldownDays`,
`reassessmentRequired` are instructor policy, not student progress. An instructor who
granted extra attempts shouldn't have to re-grant them after a reset.

Deleting the attempts is what makes the reset actually stick: `syncLessonBadgesForStudent`
refuses to re-promote a badge whose latest attempt failed
([badgeProgress.ts:33](../lib/badgeProgress.ts)). With attempts gone and lesson
progress gone, the badge sits honestly at `LEARNING` and re-earns its way up.

### Shared-lesson guard

`BadgeRequirement` is many-to-many — `syncLessonBadgesForStudent` looks up *all*
badges for a `lessonId`, so nothing in the schema stops one lesson backing two
badges. PM confirms lessons are scoped one-per-badge today and will stay that way.

Rather than trust that silently, the reset runs one extra query for other badges
sharing these lessons. Normally it returns nothing and the instructor sees no
difference. If it ever returns something, the server answers 409 with the affected
badges listed, and the modal names them behind a second explicit checkbox
(`acknowledgeSharedBadges`) before the reset can proceed. Cheap insurance against
silently destroying a second badge's progress.

### Confirmation

Two-stage, because this is irreversible and deletes graded records:

1. Clicking **Reset progress** swaps the modal body to a confirmation panel listing
   exactly what dies — N assessment attempts, N lessons by title, and any other
   badges the shared-lesson guard turned up.
2. The confirm button stays disabled until the instructor types the badge name.

---

## Action 2 — Complete the QEV requirement (waiver)

**Tooltip:** "Lets this student sit the in-person assessment without finishing the
video lesson. Their lesson progress is unchanged and the badge is marked as waived.
This cannot be undone except by resetting the badge."

Sets `status: READY_FOR_ASSESSMENT`, stamps `qevPassedAt` (if unset), and stamps the
new `qevWaivedAt` / `qevWaivedById`.

Lesson progress is deliberately **not** touched. Writing fake
`LessonProgress` rows to make the progress ring read 100% would corrupt exactly the
QEV analytics the ring exists to report. Instead the waiver is visible: wherever
precheck status renders, a waived badge reads **"QEV waived by instructor"** rather
than pretending the lesson was completed.

Surfaces updated:
- `BadgeDetailCard` — the "Video lesson:" overview line, and the progress ring caption.
- The badge detail `GET` payload — `qevWaivedAt` / waiver author name.
- The student's badge popover (`app/badges/page.tsx`).
- The student's course dashboard lesson card. This one is not optional: the
  dashboard's three lesson sections read straight from `LessonProgress`, which the
  waiver deliberately doesn't touch, while the "Ready to finalize" panel is
  badge-driven. Without the note a student sees the same badge reported as ready to
  finalize *and* the lesson sitting in "Pick up where you left off" — both true,
  and together incoherent.

The lesson deliberately stays where it is rather than moving to Completed. Telling a
student a lesson is finished when they never finished it is the same lie as writing
the `LessonProgress` row, just in the UI instead of the database.

**One-way.** Undoing a waiver means a full reset. Guarded by a single confirm step
naming the student and badge, since the undo path is expensive.

No-op guard: reject if already waived, or if `status` is already past
`READY_FOR_ASSESSMENT`.

---

## Action 3 — Overwrite the in-person check grade

**Tooltip:** "Records a proficient or still-learning result for this student outside
a normal assessment. Requires a written reason and appears in their assessment
history as an instructor override."

**Precondition:** QEV must be cleared — `status ≠ LEARNING`. Works with or without a
prior attempt, so an instructor can record a result for an assessment that happened
off-system, but not before the student has earned the right to be assessed. Reject
`LEARNING` with a 409 pointing at Action 2.

**Recorded as a new `AssessmentAttempt`**, never an in-place edit of an existing one —
history stays append-only and every grade keeps its author and timestamp.

- `checkerId` = the acting instructor
- `passed` = instructor's choice
- `score` = `100` on pass, `0` on fail. The `isOverride` row plus the mandatory
  reason make it legible as a decision rather than a measured rubric score.
- `pointsEarned` / `pointsPossible` = `null` — no rubric was scored
- `feedback` = the required reason
- one `AssessmentTaskResponse` with `isOverride: true` carrying the reason

`BadgeDetailCard` already renders `isOverride` rows ("Overridden to still learning")
and needs only a copy tweak to cover the pass direction.

Resulting badge state:

| Override | Status | Also |
|---|---|---|
| Proficient | `COMPLETED` | stamp `awardedAt`, clear `cooldownUntil` |
| Still learning | `READY_FOR_ASSESSMENT` | clear `cooldownUntil` so they can retake now |

The pass path deliberately skips the normal `IN_REVIEW` → student-acknowledges →
`COMPLETED` route: the instructor's decision is final and the badge should be earned
when they close the modal.

The fail path clears cooldown and ignores the attempt budget rather than routing
through `resolveFailAcknowledge` — an instructor recording a fail by hand is not the
same event as a student burning a reassessment, and shouldn't be able to accidentally
lock a student out. *(Assumption, not PM-confirmed — flag if wrong.)*

Stamps `gradeOverriddenAt` / `gradeOverriddenById`.

---

## Schema change

One migration, four nullable columns on `StudentBadge` — no new model:

```prisma
qevWaivedAt         DateTime?
qevWaivedById       String?
gradeOverriddenAt   DateTime?
gradeOverriddenById String?
```

Both `*ById` columns are `User` relations with `onDelete: SetNull`, matching
`Badge.createdById`.

`qevWaivedAt` is load-bearing — the waived marker is user-visible and can't be
derived. The `gradeOverridden*` pair is attribution only; the override attempt itself
already carries `checkerId` and the reason.

Reset is deliberately **not** audited. A full `StudentBadgeAction` log model was
considered and rejected as bloat for MVP — worth revisiting if instructors start
resetting in anger, since a destructive reset is currently unattributable after the fact.

---

## Server contract

All three extend the existing `PATCH`, which already dispatches on payload shape
(`reassessmentLimit` / `overrideCooldown`). One more discriminator:

```jsonc
{ "action": "RESET_PROGRESS", "confirmBadgeName": "Titration", "acknowledgeSharedBadges": false }
{ "action": "WAIVE_QEV" }
{ "action": "OVERRIDE_GRADE", "passed": true, "reason": "Assessed on paper 8/4" }
```

Each returns the refreshed badge summary so the client re-renders off the response;
the page then calls `refreshBadgeDetail()` for the full payload.

Validation:
- `action` present → require `manage` access; reject CHECKER with 403
- `RESET_PROGRESS` → `confirmBadgeName` must match the badge name, case-insensitively
  (the confirmation exists to slow the instructor down, not to test their shift key)
- `OVERRIDE_GRADE` → `reason` required and non-empty; reject `status === LEARNING` (409)
- `WAIVE_QEV` → reject if already waived or already past `LEARNING` (409)

---

## What shipped

| # | Piece | Where |
|---|---|---|
| 1 | Four nullable columns + migration | `prisma/schema.prisma`, `20260811120000_student_badge_instructor_actions` |
| 2 | Rules and write order for all three actions | `lib/students/badgeActions.ts` |
| 3 | `'manage'` access + `PATCH` dispatch + `qevWaivedAt` in `GET` | the badge detail route |
| 4 | `viewerRole` on the profile payload | `app/api/courses/[courseId]/students/[studentId]/route.ts` |
| 5 | Modal, tooltips, two-stage reset confirmation | `StudentActionsModal.tsx` + its CSS module |
| 6 | Button in the action row, hidden for non-instructors | `app/roster/[studentId]/page.tsx` |
| 7 | Waived marker, instructor and student side | `BadgeDetailCard.tsx`, `app/badges/page.tsx` |
| 8 | 20 route tests, 14 modal tests, 2 page tests | `__tests__/student-badge-actions-api.test.ts`, `StudentActionsModal.test.tsx`, `page.test.tsx` |

One implementation note worth keeping: the tooltip does **not** open on focus. The
modal's focus trap moves initial focus to the first focusable element, which is the
first tooltip trigger, so a focus-open tooltip popped every time the modal opened.
The description is instead always in the DOM as a visually hidden node the trigger
points at with `aria-describedby`, so assistive tech announces it either way, and the
visible bubble opens on hover and click.

---

## Open

- **The migration has not been applied to staging or production.** Until it is, the
  four columns don't exist and any student action will fail at the database.
- **A waiver can't be granted before the student starts.** Not a server limit — the
  row exists from enrollment and the endpoint would accept it. The instructor profile
  renders not-started badges with `tone="pending"` and no `onSelectBadge`, so they
  aren't clickable and the actions button is unreachable. Deliberately left as is;
  revisit if instructors want to waive ahead of time, which is plausible.
- **SurveyResponse has no unique key on `(promptId, studentId)`.** Pre-existing and
  documented in both survey routes, which do find-then-write: two *overlapping*
  submits each insert a row, so one student's rating counts twice. Sequential clicks
  are already safe — the badge route early-returns once the badge is COMPLETED.

  All three callers now guard the submit button while a request is in flight, so
  there is no practical way to trigger it from the UI. Closing it properly still
  needs `@@unique([promptId, studentId])` plus a switch to `upsert`, and that
  migration must dedupe existing rows (keep newest per pair) or it won't apply.
- **Reset is unattributable.** No audit row means a disputed wipe can't be traced.
  Accepted for MVP; revisit if it bites.
- **Fail-path override ignores the attempt budget** — assumption above, confirm with PM.
- **Waiver is one-way** and the only undo is a full destructive reset. A mis-click on
  the wrong student costs their entire lesson history. Confirm dialog is the only
  protection; a soft un-waive would be cheap to add later if it proves needed.
