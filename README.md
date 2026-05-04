# ChemSkills Micro-Credential Demo

A Next.js 15 (App Router) application that prototypes the student-facing micro-credential experience. The app is backed by Clerk for authentication and Prisma/PostgreSQL for seeded demo data. It includes a full student journey (dashboard, badge wallet, analytics, lesson and badge details, profile) plus a small instructor configuration prototype.

## Overview

- **Framework:** Next.js 15 with TypeScript, App Router, and CSS Modules.
- **Auth:** Clerk (`ClerkProvider` in `app/layout.tsx`, Sign In/Sign Up routes under `app/(auth)`); all student routes redirect to `/sign-in` when the session is missing.
- **Data:** Prisma models seeded with demo course, student, badges, lessons, checkpoints, surveys, and analytics (see `prisma/schema.prisma` and `prisma/seed.js`). `useStudentData` fetches the signed-in student via `/api/demo/student`.
- **UI:** Global header + shared sidebar layout on student pages; per-page CSS modules under `app/**/page.module.css`.
- **Testing & Quality:** Jest/RTL (`npm test`) and ESLint (`npm run lint`). Turbopack dev server via `npm run dev`.

## Technical Architecture

- **Architecture diagram:**

![ChemSkills architecture diagram](docs/architecture.png)

- **App layer:** Next.js 15 App Router with a mix of Server Components and Client Components; shared layout (`app/layout.tsx`) provides Clerk context, header, and student sidebar framing.
- **Authentication:** Clerk guards routes client-side with `useAuth`/`useUser`; middleware defers to page-level redirects; profile and sign-in/up flows live under `app/(auth)` and Clerk-hosted modals.
- **Data & APIs:** Prisma + PostgreSQL schema (`prisma/schema.prisma`) with seed data (`prisma/seed.js`). Route handlers under `app/api/**` expose student data, badge export, surveys, lessons, and checkpoints, consumed via `useStudentData`.
- **Media integrations:** Lesson playback uses the YouTube Iframe API (lazy-loaded in `app/lessons/[lessonId]/video.tsx` and `app/components/VideoPlayer/YoutubePlayer.tsx`) and prefers YouTube-derived thumbnails for lessons/checkpoints when URLs are available.
- **QR flows:** Badge assessment/finalization modals autogenerate QR codes client-side via `api.qrserver.com`, encoding the student + badge payload for in-person validation.
- **State & UI data flow:** Pages fetch signed-in student context from `/api/demo/student`, normalize into badge/lesson/analytics shapes, and render with CSS Modules scoped per page; media assets served from `public/`.

## How to Setup

Use the provided Prisma/PostgreSQL connection string; you do **not** need to create your own database for this school project.

1) Install prerequisites  
   - Node.js 18.18+ (recommend `nvm install 18 && nvm use 18`)  
   - npm 9+ (ships with Node 18)

2) Clone the project and install dependencies  
   ```bash
   git clone <your-fork-or-repo-url> chem-skills
   cd chem-skills
   npm install
   ```

3) Configure environment variables  
   - Create `.env.local` in the repo root with the provided Prisma/PostgreSQL URL and your Clerk keys:  
     ```bash
     DATABASE_URL="<provided Prisma PostgreSQL URL>"
     CLERK_SECRET_KEY="sk_test_or_live_from_clerk"
     NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_or_live_from_clerk"
     ```
   - To get Clerk keys, create a free Clerk project at https://clerk.com/ and copy the Secret and Publishable keys. The DATABASE_URL should be the shared Prisma connection string supplied for the course.

4) Apply the database schema and seed demo data (runs against the provided DATABASE_URL)  
   ```bash
   npx prisma migrate dev --name init
   npm run db:seed
   ```
   This creates tables and loads the CHEM101 demo student, lessons, badges, checkpoints, and surveys in the shared database.

5) Run the dev server  
   ```bash
   npm run dev
   ```
   Visit http://localhost:3000 and sign in with a Clerk user whose email matches the seeded student. 🚨 **Use your own email** 🚨 Update the seed to your address and create a Clerk user by signing up with your own email/password (set in Clerk; there is no repo-defined password).

   Specifically, in the block between line 58 - 70 of the file /prisma/seed.js:

   const students = await Promise.all([
    prisma.user.create({
      data: {
        email: 'nx2004@bu.edu',
        name: 'John Doe',
        buid: 'U1234567',
        gender: 'Male',
        raceEthnicity: 'White',
        parentalEducation: 'Bachelors degree',
        pellGrantQualified: false,
      },
    }),
  ]);

  change the line: `email: 'nx2004@bu.edu'` to use your own email.

6) (Optional) Validate tooling  
   - Lint: `npm run lint`  
   - Tests: `npm test`  
   - Production build: `npm run build` (followed by `npm start` to serve the build)

## Application Map

All student pages share the sidebar nav (Home, Profile, My Analytics, Badge Wallet, Grades, Settings) and sign-off control.

- **Authentication (`/sign-in`, `/sign-up`)** – Clerk-hosted forms embedded in the App Router. Every protected page checks `isLoaded`/`isSignedIn` and redirects to `/sign-in` when necessary.

- **Home / Dashboard (`/`)** – Pulls lessons and badge alerts from `useStudentData`.
  - “Up next” and “Pick up where you left off” cards come from lesson catalog records, link to `/lessons/[lessonId]`, and include due dates and estimated minutes.
  - Badge finalization surveys surface as modal prompts with 1–5 face ratings; submitting posts to `/api/badges/[badgeId]/survey` and refreshes data.
  - Supports deep links (`?surveyBadge=slug`) from the Badge Wallet to open a specific survey prompt.

- **Profile (`/profile`)** – Centralizes nearly all student controls (intentionally absorbs settings/grade-related actions from the design).
  - Sensitive fields (BUID, contact email) auto-hide after 10 minutes; re-auth uses the Clerk user profile modal.
  - Language selector (currently English only) and demographic edit modal (gender, race/ethnicity, parental education, Pell status).
  - Course details with instructor and checker contacts, quick links to badge/lesson counts, and security actions (change password, sign off).
  - Avatar display that reflects saved avatar settings; dedicated editor lives at `/edit_avatar`.

- **Badge Wallet (`/badges`)** – Sectioned by badge status (Completed, Ready for assessment, Ready to be finalized, Still learning).
  - Token grid per section with a modal that exposes status-specific actions:
    - Ready for assessment → show QR code for in-person check plus link to skill review.
    - Ready for finalization → start survey (routes back to home modal via querystring).
    - Still learning → review badge feedback.
    - Completed → export to LinkedIn via `/api/badges/export/[badgeId]`.
  - QR modal encodes student + badge for in-person validation.

- **Badge Feedback (`/badges/[badgeSlug]/feedback`)** – Detailed badge review with status pill, cooldown messaging, lesson summary, checkpoint tiles, and optional extra resources. Redirects back to `/badges` if the slug is unknown for the signed-in student.

- **My Analytics (`/analytics`)** – Uses `studentData.analytics` to render progress cards (hours learned, badges completed/ready/not attempted, questions answered), circular score gauges, and summary tiles. Percent complete derives from badge counts; display name comes from student record or Clerk profile.

- **Lesson Detail (`/lessons/[lessonId]`)** – Reads lesson checkpoints and segments to build the checkpoint timeline, video thumbnails (prefers YouTube thumbnails when URLs are provided), and requirement list. Shows resume/start CTA and progress stats (answered checkpoints, attempts, passing grade).

- **Avatar Editor (`/edit_avatar`)** – Three-step flow to pick base character, face expression, and accessory with live preview and shareable summary of selections.

- **Instructor QEV Prototype (`/instructor/qev-demo`)** – “Question Embedded Video” configuration demo that lets instructors assign cue points, prompts, and question counts to a lesson video; renders a serialized cue list preview.

- **Grades (`/grades`)** and **Settings (`/settings`)** – Present in navigation per design but intentionally empty (“coming soon”). All currently implemented settings and grade-related controls live on the Profile page.

## Backend & Data Flow

- **API routes:** Located in `app/api/**`. `/api/demo/student` resolves the signed-in user via Clerk, loads the student/course/badge/lesson graph from Prisma, and returns normalized shapes consumed by `useStudentData`. Additional endpoints cover badge export, surveys, lessons, checkpoints, uploads, and webhook stubs.
- **Database:** PostgreSQL schema in `prisma/schema.prisma`. Seed script (`npm run db:seed`) populates a CHEM101 course, demo student, instructors/checkers, lessons with segments/checkpoints/questions, badges, and survey prompts.
- **Auth enforcement:** Most client pages guard with Clerk hooks; middleware currently defers to the pages for redirect logic.

## Testing & Quality

- **Unit tests:** Jest + React Testing Library (`app/page.test.tsx` exercises dashboard rendering). Run with `npm test`.
- **Linting/formatting:** `npm run lint` (ESLint) is configured with Prettier integration. `npm run lint:debug` enables ESLint debug logging.

### Testing Strategy (what to add next)

- **Badge Wallet:** Assert section toggles, modal open/close, QR/export/survey actions, and auth redirect for signed-out users.
- **Lesson detail + video:** Cover checkpoint flow (question/result states), modal transitions, “Show QR code” routing to `/badges`, thumbnail fallback when YouTube IDs are missing, and completion banner visibility.
- **Analytics/Profile:** Validate metrics rendering (including completion math), guard logic for unauthenticated access, and visibility toggles for sensitive fields.
- **Hooks/APIs:** Unit-test `useStudentData` data shaping; add integration tests for `/api/demo/student` and `/api/qr` (200 response, `image/png`, `Content-Length` present).
- **End-to-end smoke:** Playwright (or similar) flow for sign-in (mock Clerk), dashboard load, badge modal QR visibility, lesson playback through a checkpoint, and export action link presence.
- **CI:** Run `npm run lint`, `npm test`, and `npm run build` in CI to catch regressions on every PR/commit.

## Deployment

- Deployment guidance is not finalized. Only the student-facing experience is complete; instructor-facing work is still in progress.
- When deploying, target a managed Next.js host (e.g., Vercel/Render) and provide the same env vars as local: `DATABASE_URL`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
- Full production steps will be added once the complete experience is ready.

## Known Issues

- Skill tracking, and badge wallet page UI is not fully aligned with the intended Figma design.
- Avatar does not render correctly on the QEV page.
- Lesson checkpoint snapshots currently rely on YouTube thumbnails and do not capture true timestamp stills; proper snapshots would require downloading/processing the video.
- Completion metrics need reinforcement—percent calculations can be inaccurate in edge cases.

## Notes for Contributors

- Navigation highlights use `usePathname`; dynamic badge/lesson routes treat parent nav items as active.
- Media assets live under `public/` (e.g., `public/assets/...` and `public/edit_avatar/...`); CSS variables and base styles are in `app/globals.css`.
- The global header hides on lesson video routes (`app/components/GlobalHeader.tsx`) to match the design.
- Settings and Grades routes exist for parity with the design but intentionally defer to the Profile page for functional controls. Avoid duplicating logic there unless the product direction changes.

## File-by-File Functionality Guide

Use this as a deep map of what each page/component does and how its styles are applied. The list focuses on the TSX entry points and their paired CSS modules.

- **app/page.tsx** — Home/Dashboard. Loads student data via `useStudentData`, builds lesson cards (`lessonRecordToCard`), renders “Up next” and “Pick up where you left off” carousels, wires survey prompts for badge finalization, supports deep-link query `?surveyBadge=slug`, redirects to `/sign-in` when Clerk reports a missing session, and drives sign-out. Includes robust YouTube ID parsing and thumbnail resolution helpers for lessons. Uses `app/page.module.css` for the dashboard layout, grid cards, modals, sidebar alignment, and survey face picker styles.

- **app/badges/page.tsx** — Badge Wallet. Segments badges by status with `SECTION_CONFIG`, renders collapsible sections, and manages badge-specific modal actions (QR code for assessment, survey start for finalization, feedback review, LinkedIn export). Guards authentication, drives sign-out, and keeps click-away handling for modals via `modalRef`. Uses `app/badges/page.module.css` for the layered wallet section stacks, badge tokens, modal styling, and QR overlay.

- **app/badges/[badgeSlug]/feedback/page.tsx** — Badge Feedback detail. Fetches all badges for the signed-in student, validates slug and redirects back to `/badges` when unknown, and presents badge status, cooldown info, lesson summary, required checkpoints, and optional learning resources sourced from `REVIEW_CONTENT`. Navigation highlights the Badge Wallet when inside this nested route. Styling lives in `app/badges/[badgeSlug]/feedback/page.module.css` for the sidebar treatment, header row, badge status card, checkpoint grid, and optional resources list.

- **app/analytics/page.tsx** — Student analytics dashboard. Consumes `studentData.analytics` to populate progress tiles (hours, badges completed/ready/not attempted, questions answered) and circular gauges for scores. Calculates completion percentages from badge counts. Includes nav highlighting, sign-out handling, and authentication redirect. Styled by `app/analytics/page.module.css` for the stat cards, gauge SVG container, grid layout, and color-coded icons.

- **app/profile/page.tsx** — Profile hub. Centralizes sensitive info visibility (auto-hide after 10 minutes with re-auth trigger), language selection modal (currently English only), demographic edit modal (gender, race/ethnicity, parental education, Pell), avatar display from student record, course details with instructor/checker contacts, quick stats, and security shortcuts (change password via Clerk profile, sign out). Pulls student data via `useStudentData`; redirects unauthenticated users. Uses `app/profile/page.module.css` for two-column layout, cards, contact chips, modal overlays, and sensitive-field masking.

- **app/grades/page.tsx** — Placeholder page with nav + sign-out guard and “Gradebook coming soon” copy. Uses global layout classes (no dedicated CSS module).

- **app/settings/page.tsx** — Placeholder page mirroring Grades: guarded route, nav + sign-out, and “coming soon” message. Uses global layout classes.

- **app/lessons/[lessonId]/page.tsx** — Lesson detail. Looks up lesson by slug from `useStudentData`, redirects to `/sign-in` if unauthenticated, and builds the checkpoint timeline with thumbnail resolution (prefers YouTube stills), duration math from checkpoint offsets, and optional trailing segment. Shows resume/start CTA with progress context (answered checkpoints, attempts, grades). Styled by `app/lessons/[lessonId]/page.module.css` (timeline grid, hero section, checkpoint tiles, right-rail summary).

- **app/edit_avatar/page.tsx** — Avatar editor wizard. Three-step selection (base color, face expression, accessory) with live preview and summary of selections. Manages step state, option filtering, and simple navigation. Styled by `app/edit_avatar/page.module.css` for the wizard steps, preview card, and option tiles.

- **app/instructor/qev-demo/page.tsx** — Instructor “Question Embedded Video” prototype. Lets instructors define cue points (timecode, prompt, question count), add/remove/update entries, and serializes the cue list preview. Uses `app/instructor/qev-demo/page.module.css` for form layout, cue item rows, and button variants.

- **app/analytics/page.module.css, app/profile/page.module.css, app/badges/page.module.css, app/badges/[badgeSlug]/feedback/page.module.css, app/lessons/[lessonId]/page.module.css, app/edit_avatar/page.module.css, app/instructor/qev-demo/page.module.css** — Page-scoped styling for the corresponding TSX files: responsive grid/flex layouts, card surfaces, typography scales, icon treatments, modal overlays, and status badges. Each module is imported only by its page to avoid leakage and aligns with the global palette defined in `app/globals.css`.

- **app/components/GlobalHeader.tsx** — Global top bar with logo that auto-hides on lesson video routes by inspecting the pathname. Styled via global classes from `app/globals.css`.

- **app/hooks/useStudentData.ts** — Fetch hook for `/api/demo/student` with abort/timeout safety. Normalizes lesson, badge, survey, analytics shapes for all student-facing pages; exposes `data`, `isLoading`, `error`, and `refresh`.

- **app/api/demo/student/route.ts** — Server route that reads the Clerk user, loads the student/course/lesson/badge graph from Prisma, groups badges by status, enriches lessons with checkpoints/segments/progress, and returns the shape consumed by `useStudentData`.
