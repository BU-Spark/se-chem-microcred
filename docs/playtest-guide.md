# Playtest Guide — walking the Student / Assessor / Instructor flows

This guide sets up three real, signed-in users (one per role) against a
self-contained **PLAYTEST** course and walks each role through its flow end to
end. The seed is **additive** — it never wipes the shared database; it only
creates/refreshes the PLAYTEST course, `pt-`-prefixed badges, and the three
test users below.

## How roles work here (read this first)

There is no "role" field on a user. Authentication is **Clerk**; a user's role
is the `Enrollment.role` they hold **in a given course** (`CourseRole =
STUDENT | INSTRUCTOR | CHECKER`, where **CHECKER = assessor**). The home page
(`app/page.tsx`) decides which sections to show purely from the enrollments the
signed-in user has. So "being" a role = signing into Clerk with an email that
matches a seeded user who holds that enrollment.

## 0. One-time setup

```bash
npm run db:seed-playtest      # additive: creates the 3 users + PLAYTEST course
npm run dev                   # http://localhost:3000
```

The seed prints the three logins. They use Clerk's `+clerk_test` subaddress, so
on a Clerk **development** instance you can sign each one up with no real inbox.

| Role | Email (Clerk login = DB email) | Name |
|------|--------------------------------|------|
| **Instructor (you)** | `jacksoncg730+clerk_test@gmail.com` | Jackson (Instructor) |
| **Student** | `student+clerk_test@bu.edu` | Jane Student |
| **Assessor** | `checker+clerk_test@bu.edu` | Alex Checker |

### Create the three Clerk accounts (once each)

1. Go to `http://localhost:3000/sign-up`.
2. Enter one of the emails above and any password.
3. When asked for the email verification code, enter **`424242`** (Clerk's
   fixed dev-instance test code — no email is actually sent).
4. Repeat for the other two emails.

On the first authenticated request, `ensureCurrentUser()`
(`app/api/courses/lib/ensure-user.ts`) matches the Clerk email to the
already-seeded DB user, so the enrollment/role is picked up automatically — no
extra wiring.

> Want to be the instructor under your existing Clerk account instead? Edit
> `PEOPLE.instructor.email` at the top of `prisma/seed-playtest.js` to your real
> `jacksoncg730@gmail.com`, re-run the seed, and sign in normally.

### Running all three side by side

Each browser profile holds one Clerk session. To have all three logged in at
once, use **one Chrome profile (or incognito window) per role**, or just sign
out/in between roles in a single window.

## What the seed gives you (so every role has something to do)

The student (`student+clerk_test@bu.edu`) starts with live progress across the
7 PLAYTEST badges:

| Badge | Status | Who acts on it |
|-------|--------|----------------|
| `pt-lab-notebook-badge` | **READY_FOR_ASSESSMENT** | the **assessor** grades it |
| `pt-volumetric-stock-badge` | **READY_FOR_FINALIZATION** (92) | the **student** completes the survey |
| `pt-general-waste-badge` | **COMPLETED** (96) | already earned |
| 4 others (bunsen, general-safety, top-loading, graduated-cylinder) | **LEARNING** | the **student** works toward submitting |

---

## 1. Instructor flow — `jacksoncg730+clerk_test@gmail.com`

Home (`/`) shows a **"My Courses"** section with **Playtest: Lab Safety
Foundations**.

1. **Course detail** — open the course card → `/courses/[courseId]`. Review the
   lesson list, badges assigned to the course, the enrolled roster, course
   contacts, and settings.
2. **Roster & per-student badge settings** — `/roster?courseId=...` → click
   **Jane Student** → `/roster/[studentId]`. On a badge card click **Edit badge
   settings** (the `StudentBadgeConfigModal`) and toggle reassessment / cooldown
   override / mandatory → saves via
   `PATCH /api/courses/[courseId]/students/[studentId]/badges/[badgeId]`.
3. **Badge catalog & wizard** — `/my_badges`, then create/edit a badge in the
   `/badge_creation` wizard (Info → Video → Checkpoints → Rubric → Review).
4. **Class progress for a badge** — `/courses/[courseId]/[badgeId]` shows the
   class status donut and per-student rows.
5. **Exercise recent work** — unassign a badge from the course
   (`DELETE /api/courses/[courseId]/badges/[badgeId]`) and duplicate the course
   (`POST /api/courses/[courseId]/duplicate`).

## 2. Student flow — `student+clerk_test@bu.edu`

Home (`/`) shows **"My Enrolled Courses"**.

1. **Course dashboard** — open the course → `/course_dashboard?courseId=...`.
   Lessons are grouped Available / In Progress / Completed.
2. **Take a lesson** — pick an in-progress lesson → `/lessons/[lessonId]` →
   **Start** → `/lessons/[lessonId]/video`. Watch, answer checkpoint questions
   (`POST /api/checkpoints/[checkpointId]/attempt`), and when a badge's lesson is
   done, submit it for assessment (`POST /api/badges/[badgeId]/assess`) — this
   moves a `LEARNING` badge to `READY_FOR_ASSESSMENT` (handing work to the
   assessor in flow 3).
3. **Badge Wallet** — `/badges`: Completed / Ready to Assess / Ready to Finalize
   / Still Learning. For `pt-volumetric-stock-badge`
   (READY_FOR_FINALIZATION), complete the **finalization survey**
   (`POST /api/badges/[badgeId]/survey`) → it becomes `COMPLETED`. A survey
   alert for this also appears on the home page.
4. **Profile & avatar** — `/profile` (edit display name / demographics) and
   `/edit_avatar`; personal progress at `/analytics`.

## 3. Assessor flow — `checker+clerk_test@bu.edu`

Home (`/`) shows an **"Assessor Courses"** section.

1. **Open the course as assessor** — the card links to
   `/courses/[courseId]?view=assessor`.
2. **Find a submission to grade** — open the badge with a student in
   READY_FOR_ASSESSMENT: `/courses/[courseId]/[badgeId]` →
   **pt-lab-notebook-badge** → Jane Student's row.
3. **Grade it** — submit pass/fail, score, feedback, and per-criterion notes via
   `PATCH /api/courses/[courseId]/students/[studentId]/badges/[badgeId]`. A pass
   advances the badge to `READY_FOR_FINALIZATION` (back to the student to
   finalize).
4. **Roster access** — confirm the assessor can also view `/roster` and the
   student detail page. Assessor → student messaging is gated by
   `course.settings.allowAssessorMessages` (seeded **true**).

---

## End-to-end loop (proves all three roles are wired together)

1. **Student** submits a `LEARNING` badge for assessment (e.g.
   `pt-general-safety-badge`) → it becomes `READY_FOR_ASSESSMENT`.
2. **Assessor** sees it in the badge's student list and grades it as passing →
   it becomes `READY_FOR_FINALIZATION`.
3. **Student** sees it under "Ready to Finalize", completes the survey → it
   becomes `COMPLETED`.
4. **Instructor** sees the updated counts on `/courses/[courseId]/[badgeId]`.

## Resetting / re-running

`npm run db:seed-playtest` is idempotent and safe to re-run any time: the three
users, the course, and the enrollments are preserved (stable ids, so your Clerk
logins keep working), while the lessons, badges, and student progress are torn
down and rebuilt to the known starting state above. It never touches non-PLAYTEST
data. To inspect rows directly: `npx prisma studio`.
