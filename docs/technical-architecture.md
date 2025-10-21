# ChemSkills Micro-Credential Demo – Technical Architecture

## 1. Overview
The ChemSkills demo is a full-stack TypeScript application built with Next.js 15 (App Router) and React 19. It renders a chemistry micro-credential experience for students and surfaces the underlying data via Next.js API routes backed by Prisma and PostgreSQL. Local storage auth and Prisma seed data make the demo self-contained while keeping the architecture compatible with production services (Clerk, Mux, institutional SIS exports).

The solution is organized into three cooperating layers:
1. **Client experience** – App Router routes, React client components, and CSS modules deliver the dashboard, lesson flows, and badge wallet UI.
2. **Server orchestration** – Next.js route handlers expose REST-like endpoints that aggregate student-centric data from Prisma. Middleware is in place to accommodate future auth enforcement.
3. **Data platform** – A normalized Prisma schema models students, enrollments, lessons, checkpoints, badges, analytics, and surveys. Seed data populates a running demo dataset.

## 2. High-Level Request Flows

### 2.1 Sign-in and routing guard
1. `useAuth` (client hook) reads/writes demo credentials in `localStorage`.
2. Root pages (e.g., `app/page.tsx`, `app/lessons/[lessonId]/page.tsx`) call `useAuth`. If the hook reports no session once `isLoaded` resolves, the user is redirected to `/sign-in`.
3. Auth pages (`app/(auth)/sign-in` and `app/(auth)/sign-up`) call the same hook to mutate session state.
4. Middleware (`middleware.ts`) currently passes through, but the App Router structure is ready for future session validation at the edge.

### 2.2 Student data hydration
1. Feature pages request `useStudentData(user?.email)` once auth is present.
2. The hook calls `fetch('/api/demo/student?email=...')` with a 15s timeout and abort controller.
3. `app/api/demo/student/route.ts` queries Prisma to gather the student record, enrollment, course contacts, analytics, lessons, checkpoints, badge progress, and surveys. It reshapes them into a DTO consumed by the UI.
4. Front-end pages render fallback data (hard-coded arrays) while the request resolves, ensuring the dashboard and lesson detail remain populated during demos.

### 2.3 Lesson video + checkpoint loop
1. Lesson routes (`app/lessons/[lessonId]/video/page.tsx`) locate the lesson record and pass it into `LessonVideoPage`.
2. `LessonVideoPage` embeds a YouTube player via `YoutubePlayer` and orchestrates playback controls, modals, checkpoint timing, and answer selection entirely on the client.
3. Checkpoint submissions mock progress updates: state is stored locally and result modals confirm answers. Future integrations will POST to `/api/checkpoints` once implemented.

### 2.4 Placeholder APIs
Endpoints under `app/api/attempts`, `app/api/progress`, `app/api/uploads`, and `app/api/webhooks` accept payloads and respond with explanatory messages (202 Accepted). They define the contract for future integrations with skill attempts, progress analytics, file uploads, and third-party webhooks (e.g., Clerk, Mux).

## 3. Front-End Module Breakdown

| Area | Location | Notes |
| --- | --- | --- |
| Root layout | `app/layout.tsx` | Sets HTML structure, imports `globals.css`, wraps children in `ErrorBoundary`. |
| Global error boundary | `app/components/ErrorBoundary/index.tsx` | Class-based boundary with reset action; shared across client routes. |
| Dashboard | `app/page.tsx` + `app/page.module.css` | Student landing page with nav sidebar, up-next cards, continue cards, and sign-off control. |
| Lesson detail | `app/lessons/[lessonId]/page.tsx` | Displays lesson outline, segments, skills, and CTA into the video flow. |
| Lesson video | `app/lessons/[lessonId]/video.tsx` | Orchestrates YouTube playback, checkpoints, modals, and rubric/summary UI. |
| Auth | `app/(auth)/sign-in`, `app/(auth)/sign-up` | Client components that call `useAuth` to simulate Clerk behavior. |
| Hook: auth | `app/hooks/useAuth.ts` | Local storage-backed session store exposing `signIn`, `signUp`, `signOut`, `clearError`. |
| Hook: student data | `app/hooks/useStudentData.ts` | Fetches demo API payload, memoizes latest data, exposes loading/error state and `refresh`. |
| Shared UI | `app/components/AppHeader`, `VideoPlayer/YoutubePlayer.tsx` | Optional header (hidden on main dashboard), reusable YouTube embed helper. |

CSS modules per route/component isolate styling. Global CSS (`app/globals.css`) provides typography, color tokens, and layout utility classes used across pages.

## 4. Server & API Layer
- **Framework** – Next.js App Router route handlers. Each handler exports HTTP verbs (`GET`, `POST`) returning `NextResponse`.
- **Primary endpoint** – `GET /api/demo/student`: assembled dataset with the shape expected by the dashboard, badges, analytics, and surveys. Data is scoped by email and leverages Prisma relations for joins.
- **Placeholder endpoints** – Accept JSON payloads and respond with static messaging so that front-end prototypes can demonstrate intent:
  - `GET/POST /api/attempts/[skillId]`
  - `GET /api/progress/[skillId]`
  - `POST /api/uploads/file`
  - `POST /api/uploads/video`
  - `POST /api/webhooks/clerk`
  - `POST /api/webhooks/mux`

This structure makes it straightforward to replace mocked logic without changing client contracts.

## 5. Data Model Overview (Prisma)

Key models in `prisma/schema.prisma`:
- `User` (mapped to `Student`) – student demographics, linked to enrollments, badge progress, lesson progress, avatar settings, analytics, checkpoint responses, and attempts.
- `Course` + `CourseContact` + `Enrollment` – course-level metadata and instructor/checker contacts for the student’s cohort.
- `Lesson`, `LessonSegment`, `LessonCheckpoint`, `CheckpointQuestion` – represent lesson structure, media, checkpoints, question banks, and rubric meta.
- `LessonProgress` + `SegmentProgress` + `CheckpointAttempt/Response` – track student advancement throughout lessons and checkpoints.
- `Badge`, `BadgeRequirement`, `StudentBadge` – define badge catalog and student status (learning, ready, completed) with score/awarded fields.
- `SurveyPrompt` + `SurveyResponse` – store reflection prompts tied to lessons/badges and student submissions.
- `StudentAnalytics` – aggregates engagement stats surfaced on dashboards.

The datasource targets PostgreSQL via Accelerate (`DATABASE_URL`) with a local direct connection defined by `DIRECT_DATABASE_URL`. Prisma client instantiation is centralized in `lib/prisma.ts` to reuse connections across hot reloads.

### Seeding Strategy
`prisma/seed.js` wipes existing demo data and seeds:
- One course (`CHEM101`) with instructor/checker contacts.
- A demo student, avatar settings, enrollment, and analytics snapshot.
- Three detailed lesson records with segments, checkpoints, and seeded questions.
- Badge catalog entries with requirements tied to lessons and readiness states.
- Survey prompts and badge progress statuses.

`npm run db:seed` (configured as `prisma db seed`) executes the script, enabling demos to boot with consistent data.

## 6. External Integrations
- **YouTube iframe API** – Loaded dynamically inside `YoutubePlayer`. Provides playback control for the lesson video experience.
- **Mux (future)** – Prisma seed includes `muxPlaybackId` fields. `/api/uploads/video` and `/api/webhooks/mux` are placeholders for direct upload and event processing.
- **Clerk (future)** – `/api/webhooks/clerk` and the sign-in/up pages signal a future migration from local storage auth to Clerk-hosted identity.
- **Assessment and storage services (future)** – Attempt/progress/upload APIs describe how third-party graders, storage backends, or BU services will connect.

## 7. Operations & Tooling
- **Scripts** – `npm run dev` (Turbopack), `npm run build`, `npm run start`, `npm run lint`, and Jest test runners (`npm run test*`). Lint runs with `--fix` to auto-format.
- **Testing** – Jest + React Testing Library are configured but no bespoke tests exist yet (`jest.config.ts`, `jest.setup.ts`).
- **Linting** – ESLint 9 configuration in `eslint.config.mjs` with Prettier compatibility. Husky + lint-staged automate formatting on commit.
- **Type safety** – TypeScript 5 with strict configuration (`tsconfig.json`). All React components are typed, and custom hooks export explicit interfaces.
- **Environment management** – `.env.local` supplies `DATABASE_URL` (Prisma Accelerate) and `DIRECT_DATABASE_URL` (local Postgres). Additional service keys will be added as integrations mature.

## 8. Security & Privacy Considerations
- Current auth is client-side and not production safe. Migrating to Clerk (or BU SSO) plus HTTP-only session cookies is a top priority.
- Prisma queries run on the server, ensuring lesson/badge data is not bundled into the client without request context.
- Placeholder endpoints return 202 responses without persisting data; when implemented they should validate payloads, authenticate requests, and rate-limit uploads/webhooks.
- Seed data contains sample personally identifiable information (name, BU ID). Treat it as demo data only.

## 9. Known Gaps & Next Steps
1. **Real authentication & authorization** – Replace `useAuth` with Clerk and enforce guards in middleware/route handlers.
2. **Checkpoint persistence** – Implement APIs to record responses, attempts, and update progress in Prisma.
3. **Badge automation** – Drive `StudentBadge` status updates from assessment outcomes and lesson completion.
4. **Role-based dashboards** – Introduce instructor/admin views that reuse the existing data model.
5. **Automated testing** – Add integration tests around `/api/demo/student` transformations and component-level tests for the lesson video flow.

This architecture document should be maintained alongside roadmap execution so stakeholders understand how design decisions and integrations evolve over time.
