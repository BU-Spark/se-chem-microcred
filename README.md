# checkd

**checkd** is a chemistry-lab micro-credential platform built with Next.js 15 (App Router). Instructors create and manage courses, students learn through checkpoint-gated lesson videos and submit badges, and assessors grade badges in person against rubrics. It is backed by Clerk for authentication and Prisma/PostgreSQL for data.

> **Naming:** "checkd" is the product name used in the UI. The repository and some code/metadata still carry the earlier working name **ChemSkills** (and the `chem-skills` repo directory) — the two refer to the same app. Renaming the code is tracked as cleanup.

> **Status:** actively evolving. The student and instructor/assessor journeys are largely wired end to end against real data; a few surfaces are stubbed or feature-flagged (see [Known Issues](#known-issues)). What began as a single-seeded, student-only demo is now a multi-role platform. The CHEM101 seed still exists as a reproducible demo world, but the app no longer depends on hand-seeded data — courses, badges, lessons, and enrollments are created through the UI.

## Overview

- **Framework:** Next.js 15 with TypeScript, App Router, and CSS Modules. Turbopack dev server.
- **Auth:** Clerk. `ClerkProvider` wraps the app in `app/layout.tsx`; `middleware.ts` enforces auth with `auth.protect()` for all non-public routes (public routes: `/`, `/splash`, `/sign-in`, `/sign-up`, `/qr/assessment`, `/api/health`).
- **Roles:** There is **no global role field**. A user's role is derived from their `Enrollment.role` in a given course — `STUDENT`, `INSTRUCTOR`, or `CHECKER` (assessor). The same person can hold different roles in different courses.
- **Data:** Prisma + PostgreSQL (`prisma/schema.prisma`). Data is created through the app (course creation, badge creation, joins, enrollments, submissions, assessments). `useStudentData` / `useMyCourses` fetch the signed-in user's graph via API routes, cached with SWR.
- **Data fetching:** SWR for client caching; route handlers under `app/api/**` back every flow.
- **UI:** Marketing splash for signed-out visitors, an onboarding flow for new users, and a shared sidebar + global header layout for the authenticated app. Animations via framer-motion; icons via Iconify.
- **Testing & Quality:** Jest/RTL (`npm test`, suites under `__tests__/` plus co-located page tests) and ESLint + Prettier (`npm run lint`).

## Technical Architecture

- **Architecture diagram:**

  ![ChemSkills architecture diagram](docs/architecture.png)

- **App layer:** Next.js 15 App Router, mostly Client Components that render from the Clerk session and SWR-cached API data. The root layout is `force-dynamic` (every route is auth-gated and reads search params), so nothing is statically prerendered.
- **Authentication:** Clerk. `middleware.ts` actively protects all non-public routes; individual pages additionally redirect to `/splash` when the session is missing. Sign-in/sign-up live under `app/(auth)`.
- **Onboarding:** New Clerk sign-ups don't exist in the database yet (the Clerk webhook is stubbed). On completing onboarding (`/onboarding` → `POST /api/onboarding`), the user is upserted with name, demographics, chosen avatar base, and an analytics row. On subsequent requests, `ensureCurrentUser()` matches the Clerk email to the DB user.
- **Data & APIs:** A broad route-handler surface under `app/api/**` covers courses (create/join/duplicate/enrollments/students/badges/import/reminders), badges, assessments and assessment access codes, checkpoints/attempts, lessons (start/grade/survey), progress, profile, messages, uploads, QR generation, and health.
- **Video & QEV:** Lesson playback supports YouTube (via the YouTube Iframe API) and Mux playback IDs (schema field `muxPlaybackId`). The lesson player renders in-video checkpoints — a "Question Embedded Video" (QEV) experience — pausing to quiz the student and record responses. Direct Mux uploads are stubbed (see Known Issues).
- **QR & assessment codes:** Badge assessment QR codes are generated **server-side** by `/api/qr` using the `qrcode` package (no external QR service). QR payloads plus short-lived `AssessmentAccessCode`s let an assessor validate a student's badge in person at `/qr/assessment`.
- **Rubric assessment:** Badges can carry a `RubricGoal` with weighted `RubricSubgoal`s. Assessors submit pass/fail, score, points, feedback, and per-subgoal responses (`AssessmentAttempt` + `AssessmentSubgoalResponse`); a pass advances the badge to `READY_FOR_FINALIZATION`.

## Data Model (high level)

Key Prisma models (`prisma/schema.prisma`):

- **User** (`@@map("Student")`) — person; demographics, avatar, analytics; relations to enrollments, progress, created courses/badges, assessments, messages.
- **Course / CourseSettings / CourseContact** — a course with join `code` and `assessorCode`, section metadata, an Iconify-based course image, contacts (instructor/checker), and feature settings (cooldown override, assessor messages, cross-section view).
- **Enrollment / EnrollmentSection** — links a user to a course with a `role` (STUDENT/INSTRUCTOR/CHECKER) and `status` (PENDING/ACTIVE), optionally scoped to sections.
- **Lesson / LessonSegment / LessonCheckpoint / CheckpointQuestion / LessonSkill** — lesson content, video segments, in-video checkpoints and their multiple-choice questions.
- **Progress:** LessonProgress, SegmentProgress, CheckpointAttempt, CheckpointResponse.
- **Badge / BadgeRequirement / StudentBadge / RubricGoal / RubricSubgoal** — badge definitions (with library import lineage via `sourceBadgeId`), per-student status (LEARNING → READY_FOR_ASSESSMENT → READY_FOR_FINALIZATION → COMPLETED), and rubrics.
- **AssessmentAttempt / AssessmentSubgoalResponse / AssessmentAccessCode** — in-person grading records and short-lived access codes.
- **SurveyPrompt / SurveyResponse** — lesson- and badge-context feedback surveys.
- **Message** — in-app messaging (feature-flagged WIP).

## Getting Started

### Prerequisites

- **Node.js 20** (`.node-version` pins 20; `package.json` engines require `>=20 <23`). `nvm use` will pick this up.
- **npm 10+**.
- A **PostgreSQL** database and a **Clerk** project (free tier is fine).

### 1. Install

```bash
git clone <your-fork-or-repo-url> chem-skills
cd chem-skills
npm install   # runs `prisma generate` via postinstall
```

### 2. Configure environment variables

The project reads both `.env` (loaded by the Prisma CLI) and `.env.local` (Next.js dev convention). Create them in the repo root:

```bash
# Database (Prisma/PostgreSQL connection string)
DATABASE_URL="postgresql://..."

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."

# Public origin — used to build assessment QR codes / short-code links.
# Set in production; omit locally (falls back to the request origin).
NEXT_PUBLIC_APP_URL="https://your-production-host"

# Instructor account for the CHEM101 seed (optional; see below)
SEEDED_DEMO_EMAIL="your-instructor-clerk-email@example.com"

# Feature flag: show the WIP Messages tab (dev only). Omit/false in prod.
NEXT_PUBLIC_CURRENT_ENVIRONMENT_DEV="true"

# Feature flag for MVP -- to be removed after initial testing phase with clients. Flip to false to allow all users to create
ALPHA_MODE="true"
# List of allowed emails to create content during the MVP (locally make this just your email, in staging/prod use an actual list) -- This is needed in otherwise Alpha_Mode var will lock everyone out
ALPHA_ADMIN_EMAILS="<comma separated list of emails that are valid>"
```

Get Clerk keys by creating a project at https://clerk.com/ and copying the Publishable and Secret keys.

> **Note on `DATABASE_URL`:** the Prisma CLI auto-loads `.env`, while Next.js dev loads `.env.local`. The seed scripts explicitly load `.env.local`. Keep `DATABASE_URL` consistent between the two files (or you can point them at different databases intentionally — e.g. a dev vs. shared DB). Mismatched values between the two files are a common source of "why is my data different" confusion.

### 3. Apply the schema

```bash
npx prisma migrate dev
```

This applies the migrations in `prisma/migrations/` to your `DATABASE_URL`.

### 4. (Optional) Seed the CHEM101 demo world

You don't need seed data to use the app — you can sign up, onboard, and create a course from scratch. But the CHEM101 seed gives you a reproducible three-role world for walking every flow:

```bash
npm run db:seed        # runs prisma/seed.js -> prisma/seed-playtest.js (CHEM101)
```

The seed is **additive for users** and **scoped for course content**: it upserts three test users (stable ids, so Clerk links keep working), (re)builds the self-contained CHEM101 course with lessons/badges/checkpoints/surveys/progress, and removes the legacy PLAYTEST course if present. It's idempotent — safe to re-run to reset to the known starting state.

| Role       | Email                                                              | Course access                         |
| ---------- | ------------------------------------------------------------------ | ------------------------------------- |
| Instructor | `SEEDED_DEMO_EMAIL`, or `instructor+clerk_test@gmail.com` if unset | owns CHEM101                          |
| Student    | `student+clerk_test@bu.edu`                                        | enrolled as student                   |
| Assessor   | `checker+clerk_test@bu.edu`                                        | enrolled as active assessor (CHECKER) |

There's also an additive single-user seed for quickly adding yourself without touching anything else:

```bash
npm run db:seed-user   # upserts the user configured in prisma/seed-user.js
```

For a full walkthrough of the three roles and the end-to-end loop, see [`docs/chem101-seed-guide.md`](docs/chem101-seed-guide.md).

### 5. Run the dev server

```bash
npm run dev
```

Visit http://localhost:3000. Signed-out visitors land on `/splash`; signing in routes to the dashboard. On a Clerk **development** instance, create each test account once through `/sign-up` and use Clerk's fixed verification code `424242`.

### 6. (Optional) Validate tooling

```bash
npm run lint          # ESLint + Prettier (auto-fix)
npm test              # Jest + React Testing Library
npm run build         # production build
npm start             # serve the production build
npx prisma studio     # inspect the database
```

## Application Map

Signed-out visitors see the marketing **splash** (`/splash`). Authenticated users get a shared sidebar (Home, Badges, Badge Wallet, Messages*, My Analytics, Profile — *Messages only when `NEXT_PUBLIC_CURRENT_ENVIRONMENT_DEV=true`) and a global header that hides on lesson-video routes.

### Onboarding & shared

- **Splash (`/splash`)** — Marketing landing for signed-out visitors; redirects authenticated users to `/`.
- **Onboarding (`/onboarding`)** — First-run flow that captures name, demographics, and an avatar base, and creates the DB user via `POST /api/onboarding`.
- **Auth (`/sign-in`, `/sign-up`)** — Clerk-hosted forms under `app/(auth)`.

### Home & courses

- **Home / Dashboard (`/`)** — Role-aware. Shows "My Courses" (instructor-created), "Assessor Courses", and "My Enrolled Courses" together — the client deliberately validated a combined view rather than role-gating sections. Supports creating a course, joining by code, duplicating a course, entering an assessment access code, and badge finalization surveys (with `?surveyBadge=slug` deep links).
- **Course list & creation (`/courses`, `/courses/new`)** — Browse and create courses (title, sections, description, Iconify course image).
- **Course detail (`/courses/[courseId]`)** — Lessons, assigned badges, roster, contacts, and settings; assessor view via `?view=assessor`.
- **Course badge detail (`/courses/[courseId]/[badgeId]`)** — Class-wide progress for a badge; entry point for assessing a student's badge.
- **Course dashboard (`/course_dashboard?courseId=...`)** — Student-facing per-course view.
- **Roster (`/roster`, `/roster/[studentId]`)** — Student roster and per-student detail with per-badge settings (reassessment limit, cooldown).

### Learning

- **Lesson detail (`/lessons/[lessonId]`)** — Checkpoint timeline, thumbnails (YouTube stills when available), requirements, and resume/start CTA with progress stats.
- **Lesson video (`/lessons/[lessonId]/video`)** — Video player with in-video QEV checkpoints; records attempts and grades the lesson (`/api/lessons/[lessonId]/grade`, `/start`).
- **Skills (`/skills/[skillId]`)** — Skill-level view.
- **Avatar editor (`/edit_avatar`)** — Three-step avatar builder (base, face, accessory).

### Badges & assessment

- **My Badges (`/my_badges`)** — Badge overview / management surface.
- **Badge Wallet (`/badges`)** — Badges sectioned by status (Completed, Ready for assessment, Ready to be finalized, Still learning) with status-specific modal actions: show QR for in-person assessment, start finalization survey, review feedback, or export a completed badge to LinkedIn.
- **Badge feedback (`/badges/[badgeSlug]/feedback`)** — Detailed badge review with status, cooldown messaging, lesson summary, checkpoints, and resources.
- **Badge creation (`/badge_creation`, `/badges_creation`)** — Instructor badge authoring, including rubric goals/subgoals and badge-library imports.
- **Assessments (`/assessments/[courseId]/students/[studentId]/badges/[badgeId]`)** — Assessor grading flow: pass/fail, score, points, feedback, and per-subgoal notes.
- **QR assessment (`/qr/assessment`, `/qr/assessment-code`)** — In-person validation entry points (the first is public so an assessor's device can open it without a session).

### Other

- **My Analytics (`/analytics`)** — Progress tiles (hours, badge counts, questions answered) and score gauges.
- **Profile (`/profile`)** — Consolidated student controls: sensitive-field auto-hide with Clerk re-auth, demographics editor, language selector, course contacts, quick stats, and security actions.
- **Messages (`/messages`)** — In-app messaging (WIP; nav entry only shown when the dev env flag is set).
- **Report (`/report`)** — Reporting surface.
- **Instructor QEV prototype (`/instructor/qev-demo`)** — Standalone cue-point authoring demo (predates the integrated in-lesson QEV player).
- **Grades (`/grades`) & Settings (`/settings`)** — Placeholder "coming soon" pages retained for parity; functional controls live on Profile. Not currently in the sidebar nav.

## Backend & APIs

Route handlers live under `app/api/**`. Highlights:

- **Courses:** `courses` (list/create), `courses/mine`, `courses/created`, `courses/enrolled`, `courses/assessor`, `courses/join`, and per-course `courses/[courseId]` (detail, `duplicate`, `enrollments`, `students`, `badges`, `badges/import`, `badges/[badgeId]/reminders`).
- **Badges & assessment:** `badges`, `badges/[badgeId]` (+ `assess`, `feedback`, `survey`), `badges/export/[id]`, `assessment-codes`, `attempts/[skillId]`.
- **Lessons & progress:** `lessons/[lessonId]` (+ `start`, `grade`, `survey`), `checkpoints/[checkpointId]/attempt`, `checkpoint-snapshot`, `progress/[skillId]`.
- **User:** `onboarding`, `profile/demographics`, `profile/display-name`, `profile/reverify`, `demo/student` (aggregate student graph), `messages`.
- **Media & infra:** `qr` (server-generated PNG, rate-limited), `uploads/file`, `uploads/video` (Mux — stubbed), `youtube-title`, `webhooks/clerk` (stubbed), `webhooks/mux` (stubbed), `health`.
- **Shared libs (`lib/`):** `prisma.ts` (client singleton), `badgeProgress.ts`, `lessonGrading.ts`, `checkpointQuestions.ts`, `courseImage.ts`, `video.ts`, `requestOrigin.ts`; plus `app/api/courses/lib/ensure-user.ts` (`ensureCurrentUser()`).

## Testing & Quality

- **Unit/integration:** Jest + React Testing Library. Suites under `__tests__/` cover API routes (course create/join/duplicate, badge creation/import/feedback, assessment submit/codes, lesson grade, QR) and units (`badge-progress`, `video`), plus co-located component tests (`app/page.test.tsx`, `app/lessons/[lessonId]/video.test.tsx`). Run with `npm test` (or `test:watch`, `test:coverage`).
- **Linting/formatting:** `npm run lint` (ESLint with Prettier integration; `lint:debug` for verbose output). Husky + lint-staged run ESLint/Prettier on staged files pre-commit.
- **Suggested next coverage:** assessor grading end-to-end, QEV checkpoint pass/fail transitions, roster badge-settings edits, onboarding → first course, and auth-redirect guards. Consider running lint + test + build in CI on every PR.

## Deployment

Configured for **Railway** (`railway.toml`, NIXPACKS builder):

- **Build:** `npm run railway:build` → `prisma generate && next build`.
- **Start:** `npm run railway:start` → `prisma migrate deploy && next start` (migrations run on deploy).
- **Health check:** `/api/health` (used by Railway; also a public route).

Provide the same env vars as local (`DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_APP_URL`), and set `NEXT_PUBLIC_APP_URL` to the public origin so assessment QR codes and short-code links resolve to the deployed host rather than an internal address. Leave `NEXT_PUBLIC_CURRENT_ENVIRONMENT_DEV` unset in production to keep the WIP Messages tab hidden. Any managed Next.js host (Railway/Vercel/Render) works with equivalent config.

## Known Issues

- **Stubbed integrations:** `uploads/video` (Mux upload), `webhooks/mux`, and `webhooks/clerk` return `202 "not yet implemented"`. New users are created via the onboarding endpoint rather than a Clerk webhook.
- **Messages** is a work-in-progress; the nav entry is gated behind `NEXT_PUBLIC_CURRENT_ENVIRONMENT_DEV`.
- **Checkpoint snapshots** rely on YouTube thumbnails rather than true timestamp stills (accurate stills would require processing the source video).
- **Completion metrics** can be inaccurate in edge cases; percentage math needs reinforcement.
- Some UI surfaces are not fully aligned with the intended Figma design (badge/skill-tracking screens), and the standalone `/instructor/qev-demo` prototype overlaps with the integrated in-lesson QEV player.
- **Naming not unified in code:** the UI is branded "checkd", but the repo, directory (`chem-skills`), page metadata ("ChemSkills Demo"), and health-check service name still use the ChemSkills name.

## Notes for Contributors

- **Roles come from enrollments**, not a user field — always resolve capability from `Enrollment.role` for the relevant course.
- Navigation highlighting uses `usePathname`; nested badge/lesson routes treat their parent nav item as active.
- The sidebar and its nav list live in `app/_components/Sidebar.tsx` (`SIDEBAR_NAV`). The global header (`app/components/GlobalHeader.tsx`) hides on lesson-video routes.
- CSS variables and base styles are in `app/globals.css`; page-scoped styles use co-located `page.module.css` modules. Media assets live under `public/`.
- Keep the CHEM101 seed idempotent and scoped — it must not wipe unrelated data in a shared database.
- Grades/Settings pages are intentional placeholders; put functional student controls on Profile unless product direction changes.
