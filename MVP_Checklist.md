# checkd — MVP Gap Analysis Checklist

Audit of branch `ui-fidelity` (based on `student-progress`) against the agreed MVP feature list. Status is based on reading pages (`app/**/page.tsx`), API routes (`app/api/**`), the Prisma schema (`prisma/schema.prisma`), and supporting libs. "DONE" means UI is wired to a real, DB-backed backend; "PARTIAL" means UI exists but the backend is stubbed/missing or logic is incomplete; "MISSING" means no real implementation.

**Overall estimate: ~13 of 21 MVP items DONE, ~6 PARTIAL, ~2 MISSING.** The learning/assessment data spine is genuinely strong — courses, badges, lessons, checkpoints, QR generation, badge-wallet status machine, badge create/edit, and the assessor assessment-submit flow are all real and DB-backed. The biggest gaps are all on the "account/identity" side and the QR-driven entry into assessment: **avatar/name/email editing does not persist** (no API, modal just closes), the **Settings page is an empty placeholder**, **course duplication is not implemented** (button just links to a blank create form), and there is **no QR scanner** so the assessment screen is reached by manual navigation, not by scanning. The Clerk webhook is also a stub, so account creation relies on roster pre-seeding.

Notes on cross-cutting structure:
- **Role gating is weak on the client.** `app/page.tsx` (Home) renders "My Courses", "Assessor Courses", and "My Enrolled Courses" for *every* signed-in user; visibility is driven only by whether the API returns rows for that email, not by an explicit role check. The sidebar (`app/_components/Sidebar.tsx`) shows all nav items (Home/Courses/Badges/Profile/Analytics/Badge Wallet/Grades/Settings) to all roles. Server-side, `fetchAccessible*` query helpers in `app/api/courses/lib/course-queries.ts` do enforce access per enrollment, which is the real protection.
- **Auth is Clerk** (`middleware.ts` protects everything except `/`, `/sign-in`, `/sign-up`). `/` is public but the Home component client-redirects unauthenticated users to `/sign-in`.

---

## Global

- [x] **Log in & account creation** — **Status: DONE (login) / PARTIAL (account creation).**
  **Evidence:** Clerk `<SignIn />` / `<SignUp />` at `app/(auth)/sign-in/[[...sign-in]]/page.tsx` and `app/(auth)/sign-up/[[...sign-up]]/page.tsx`; `middleware.ts` enforces auth. Login works.
  **Gap:** `app/api/webhooks/clerk/route.ts` is a **stub** that returns `"Clerk webhook handling is not yet implemented."` — so a newly self-signed-up Clerk user is **not** synced into the Prisma `User`/`Student` table. App `User` records are instead created as a side effect of instructors adding roster members (`app/api/courses/route.ts` POST). A brand-new user who signs up but isn't on any roster will hit "User not found" on most data routes. (BU Kerberos login is explicitly out of MVP scope.)

- [x] **Navigation: Home** with sub-views Enrolled Courses + My Courses — **Status: DONE.**
  **Evidence:** `app/page.tsx` renders "My Courses" (created), "Assessor Courses", and "My Enrolled Courses" sections, each backed by real routes (`/api/courses/created`, `/api/courses/assessor`, `/api/courses/enrolled`). Sidebar `Home` link present.
  **Gap:** All three sections render for all roles (no client role-gate); see cross-cutting note.

- [x] **Navigation: Badges (badges you create — all roles can access)** — **Status: DONE.**
  **Evidence:** Sidebar "Badges" → `/my_badges` (`app/my_badges/page.tsx`), lists all source badges via `GET /api/badges` (real DB query). Available to all roles.

- [x] **Navigation: Badge Wallet (badges earned)** — **Status: DONE.**
  **Evidence:** Sidebar "Badge Wallet" → `/badges` (`app/badges/page.tsx`); data from `useStudentData` → `/api/demo/student` (real DB query grouping `StudentBadge` by status).

- [~] **Navigation: Profile & Settings COMBINED** — **Status: PARTIAL.**
  **Evidence:** They are **separate** pages with separate sidebar links: `app/profile/page.tsx` and `app/settings/page.tsx`. The MVP calls for a single combined Profile/Settings.
  **Gap:** Not combined. Furthermore `app/settings/page.tsx` is an empty placeholder ("Settings content coming soon."). Either merge Settings into Profile or build out Settings.

- [x] **My Analytics (NON-MVP — note only)** — exists: Sidebar "My Analytics" → `/analytics` (`app/analytics/page.tsx`). Out of MVP scope; not counted in gaps.

---

## Enrolled Courses

- [x] **Enter into a course** — **Status: DONE.**
  **Evidence:** Enrolled course cards in `app/page.tsx` link to `/course_dashboard?courseId=...` (`app/course_dashboard/page.tsx`); course detail at `app/courses/[courseId]/page.tsx` backed by `GET /api/courses/[courseId]` (`fetchAccessibleCourseDetail`).

- [~] **Badges displayed; clicking shows overview → start lesson w/ QEVs → on pass, show QR** — **Status: PARTIAL/DONE-in-pieces.**
  **Evidence:** Badge overview + lesson exist: `app/courses/[courseId]/[badgeId]/page.tsx` (badge detail) and `app/lessons/[lessonId]/page.tsx` / `.../video/page.tsx`. QEV/checkpoint attempts are **real**: `POST /api/checkpoints/[checkpointId]/attempt` grades answers (MC + numeric short-answer) via `lib/checkpointQuestions.ts` and writes `CheckpointAttempt`/`CheckpointResponse`; lesson grading is real at `POST /api/lessons/[lessonId]/grade` (`lib/lessonGrading.ts`). On pass, the QR is available in the Badge Wallet (status `READY_FOR_ASSESSMENT`).
  **Gap:** Verify the in-flow "show QR right after passing" UX — the QR is surfaced from the **Badge Wallet** rather than inline at lesson-completion. The lesson→READY_FOR_ASSESSMENT transition that flips the badge into the QR-eligible bucket should be confirmed end-to-end. Two **placeholder** routes also exist and are NOT used for real data: `GET/POST /api/attempts/[skillId]` and `GET /api/progress/[skillId]` both return `"not yet implemented"` — ignore these; the real path is the `/api/checkpoints` + `/api/lessons` routes.

---

## Badge Wallet (sectioned by status)

The wallet (`app/badges/page.tsx`) sections badges into Completed / Ready to be Assessed / Ready to be Finalized / Still learning, sourced from `studentData.badges.{completed,readyForAssessment,readyForFinalization,learning}` (`/api/demo/student`, real DB). Status enum (`BadgeStatus`) is `LEARNING | READY_FOR_ASSESSMENT | READY_FOR_FINALIZATION | COMPLETED`.

- [x] **Completed Badges — unclickable** — **Status: DONE.**
  **Evidence:** `app/badges/page.tsx` renders completed group; completed cards are non-interactive (no QR/survey action). Export available via `GET /api/badges/export/[id]` (real).

- [x] **Ready to be assessed → click shows QR code popup** — **Status: DONE.**
  **Evidence:** `app/badges/page.tsx` opens a QR modal sourcing `/api/qr?data=student:<id>|badge:<id>`. `app/api/qr/route.ts` is **real and hardened** (Clerk auth, ownership check that the student owns the badge, rate limiting, PNG via `qrcode`).

- [x] **Ready to be finalized → click to do survey** — **Status: DONE.**
  **Evidence:** Survey modal (`app/page.tsx` survey overlay + wallet finalize path) posts to `POST /api/badges/[badgeId]/survey`, which writes/updates `SurveyResponse` and transitions `READY_FOR_FINALIZATION → COMPLETED` (real).

- [~] **Still learning (failed check) → cooldown / extra-resources page** — **Status: PARTIAL.**
  **Evidence:** "Still learning" group renders; `app/badges/[badgeSlug]/feedback/page.tsx` exists as a feedback/resources destination.
  **Gap:** No dedicated **cooldown** mechanism (no cooldown timer/lockout). `CourseSettings.allowCooldownOverride` exists in schema but is not enforced anywhere. Confirm the "Still learning" card actually routes to the feedback page and that this satisfies the "cooldown / extra resources" requirement, or build the cooldown.

---

## Profile / Settings (combined)

- [~] **Change character (avatar), name, email, etc.** — **Status: PARTIAL (UI only; no persistence).**
  **Evidence:** `app/profile/page.tsx` shows avatar + name + email and opens `app/edit_avatar/EditAvatarModal.tsx`. Demographics **do** persist: `POST /api/profile/demographics` (gender/race/parentalEducation/Pell) is real and writes to `User`.
  **Gap (significant):**
  - **Avatar does not persist.** `EditAvatarModal` (`EditAvatarPage`) only calls `onClose()` on "Save" — there is **no fetch and no avatar API route** (no `app/api/profile/avatar`, no `avatarSetting.create/upsert/update` anywhere). The `AvatarSetting` model + read logic exist (e.g. `app/api/demo/student`, `course-queries.ts`), but nothing ever writes it.
  - **Name change does not persist.** `app/api/profile/display-name/route.ts` only implements **GET**; there is no POST/PATCH to update the name.
  - **Email change** is not implemented (would normally be a Clerk operation; no handler present).
  So of "avatar, name, email", only demographics are writable today.

---

## My Courses (instructor)

- [x] **Enter into a course** — **Status: DONE.**
  **Evidence:** "My Courses" cards in `app/page.tsx` link to `/courses/[courseId]`; detail page real (`GET /api/courses/[courseId]`).

- [x] **Course information page (title, # sections, student & assessor roster, description, students w/ profiles & progress per badge)** — **Status: DONE.**
  **Evidence:** `app/courses/[courseId]/page.tsx` shows title, "Number of Sections", students-enrolled count, description, and links to the roster (`/roster?courseId=...` and `/roster?courseId=...&role=CHECKER` for the assessor roster). Per-student per-badge progress is real: `app/roster/[studentId]/page.tsx` → `GET /api/courses/[courseId]/students/[studentId]` (profile) and `.../badges/[badgeId]` (per-badge detail incl. checkpoint responses), all DB-backed via `course-queries.ts`.

- [ ] **Ability to duplicate a course** — **Status: MISSING.**
  **Evidence:** The "Duplicate Course" control in `app/page.tsx` is just a `<Link href="/courses/new">` — it opens an **empty** create form, not a copy of an existing course. `app/courses/new/page.tsx` supports create (`POST /api/courses`) and edit (`?courseId=` prefill) but has **no duplicate/clone path**. No "duplicate" endpoint or clone logic exists anywhere in `app/api`.
  **Gap:** Build true duplication — either a `POST /api/courses/[courseId]/duplicate` server route that deep-copies course + settings + contacts + lessons/badges (and resets enrollments/progress), or a prefill-from-source create flow.

---

## My Badges (instructor)

- [x] **Create and edit badges (description, QEV, configurations, rubric)** — **Status: DONE.**
  **Evidence:** `app/badge_creation/page.tsx` is a multi-step wizard (`badgeInfo → lessonVideo → checkpoints → configurations → rubric → review`). Submit: `POST /api/badges` (create) / `PATCH /api/badges` (edit, prefilled when `?badgeId=` present). `app/api/badges/route.ts` is **real and substantial**: creates a source `Badge`, optional course-scoped copy, `Lesson` + `LessonSegment`, `LessonCheckpoint` + `CheckpointQuestion` (QEVs, MC + numeric short-answer), rubric/grading criteria stored in `BadgeRequirement.summary` JSON, a `SurveyPrompt`, and auto-assigns `StudentBadge` rows to enrolled students. Edit via `openEditBadge` in `app/my_badges/page.tsx` → `PATCH`.
  **Gap (minor):** Rubric/grading criteria are stored as JSON inside `BadgeRequirement.summary` rather than as first-class rows — functional but harder to query/validate. "Configurations" step exists in the wizard; confirm each config persists.

- [~] **Ability to duplicate a badge** — **Status: PARTIAL.**
  **Evidence:** There is **no explicit "Duplicate badge" button** in `app/my_badges/page.tsx` (actions are "Edit" and "View course"). However, a real **import/clone mechanism exists**: `POST /api/courses/[courseId]/badges/import` deep-copies a source badge (lesson, segment, checkpoints, questions, survey, student assignments) into a course, and the badge-create flow itself produces source + course copies. The course detail page (`app/courses/[courseId]/page.tsx`) uses this import to add an existing badge to a course.
  **Gap:** No one-click "duplicate this badge as a new editable badge" affordance on the My Badges screen. The plumbing (clone via import / `sourceBadgeId` relation) exists; the explicit duplicate UX/endpoint for the badge catalog is missing.

---

## Assessment Screen (assessor / checker)

- [~] **Assessment screen shows up after scanning the QR code** — **Status: PARTIAL.**
  **Evidence:** The assessment screen is fully built and real: `app/assessments/[courseId]/students/[studentId]/badges/[badgeId]/page.tsx` loads student profile + badge detail and submits via `POST /api/courses/[courseId]/students/[studentId]/badges/[badgeId]`, which writes an `AssessmentAttempt` (+ `AssessmentCriterionResponse`) and transitions the `StudentBadge` status (real, DB-backed, with precheck-complete guard).
  **Gap:** There is **no QR scanner anywhere** (no camera/`getUserMedia`/`BarcodeDetector`/`jsQR` usage in `app` or components). The student-side QR is generated and encodes `student:<id>|badge:<id>` but **nothing consumes it**. The assessor reaches the assessment screen by manual navigation: roster → student → badge (`app/roster/[studentId]/page.tsx:658` links to `/assessments/[courseId]/students/[studentId]/badges/[badgeId]`). Also note the QR payload lacks `courseId`, which the assessment route requires — so even a future scanner couldn't deep-link from the QR alone without resolving the course. **Build a scanner + a route that maps a scanned `student|badge` (plus resolved course) to the assessment screen.**

- [x] **Assessors can see student progress for students they're assigned to (or all)** — **Status: DONE.**
  **Evidence:** Assessor courses surface on Home (`/api/courses/assessor`); roster filtered for assessors; per-student/per-badge progress via `course-queries.ts` `fetchAccessible*` helpers which enforce that the viewer is the creator or an enrolled instructor/checker, and respect section assignment / `allowCrossSectionView`. Server-side access control is genuine.

---

## Top priorities to reach MVP (ordered by impact)

1. **QR-driven assessment entry (build a QR scanner).** The whole "scan → assess" loop is broken: QR is generated but never scanned, and the assessment route needs a `courseId` the QR doesn't carry. Add a scanner page for assessors and either embed `course` in the QR payload or resolve it server-side from `student|badge`. *(Assessment Screen)*
2. **Profile/Settings persistence — avatar + name (+ email).** Avatar "Save" is a no-op (no API), name has GET-only, email isn't editable. Add `POST/PATCH /api/profile/avatar` (write `AvatarSetting`) and a name-update mutation; wire the modal's Save. *(Profile/Settings)*
3. **Combine Profile & Settings, and fill the empty Settings page.** Settings is a "coming soon" stub; MVP wants one combined surface. Merge or build out. *(Global / Profile-Settings)*
4. **Course duplication.** Currently just links to a blank create form. Implement real deep-copy (course + settings + contacts + lessons/badges, reset enrollments/progress). *(My Courses)*
5. **Clerk → DB user sync.** Implement the stubbed `app/api/webhooks/clerk/route.ts` so self-signed-up users get a `User` row (today only roster-added users exist in the DB). *(Global / account creation)*
6. **Explicit "Duplicate badge" affordance on My Badges.** Clone plumbing exists (import / `sourceBadgeId`); add the one-click duplicate button/endpoint for the badge catalog. *(My Badges)*
7. **"Still learning" cooldown / extra-resources flow.** Confirm/route failed-check badges to the feedback page and decide whether a real cooldown lockout is required (`allowCooldownOverride` is defined but unused). *(Badge Wallet)*
8. **Client-side role gating (polish).** Home and the sidebar expose instructor/assessor sections to all roles; server access control holds, but the UI should hide irrelevant sections per role. *(Global)*
