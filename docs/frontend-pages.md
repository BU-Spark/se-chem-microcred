# Frontend Page Responsibilities

This reference summarizes every routed page in the ChemSkills demo. Each entry notes the filesystem location, the route it powers, and the primary UI responsibilities so designers and engineers can line changes up with the Figma source of truth.

## Global Shell

**`app/layout.tsx` → all routes**
- Wraps every page with the HTML scaffold and imports `app/globals.css` for shared typography, color, and spacing tokens.
- Injects the shared `<ErrorBoundary>` so runtime failures surface a friendly fallback rather than a blank screen.
- Defines default `<head>` metadata (`ChemSkills Demo`, description, keywords) used unless a page overrides them.

## Authentication

**`app/(auth)/sign-in/[[...sign-in]]/page.tsx` → `/sign-in`**
- Handles returning-user login with email/password fields tied to the local `useAuth()` simulation.
- Surfaces validation states (missing credentials, incorrect password, unknown account) and a success toast before redirecting to the dashboard.
- Lists the seeded demo credentials and links to the sign-up flow for first-time users.

**`app/(auth)/sign-up/[[...sign-up]]/page.tsx` → `/sign-up`**
- Collects name, email, password, and confirmation to create a new local demo account.
- Enforces lightweight validation (required fields, minimum password length, matching confirmation) and funnels errors from `useAuth().signUp`.
- On success, shows a confirmation message then routes the user to `/`.

## Student Experience

**`app/page.tsx` → `/`**
- Primary student dashboard with sidebar navigation and sign-off control, rendered only after `useAuth()` confirms an active session.
- Presents “Up next” and “Continue” lesson cards plus brand callouts; button styling and layout mimic the Figma board.
- Handles graceful sign-out by clearing the simulated session and returning the user to `/sign-in`.

**`app/profile/page.tsx` → `/profile`**
- Personal profile hub showing greeting, demographic placeholders, BUID, and primary contact information derived from the logged-in user.
- Features “Edit avatar” quick action, contact cards for instructor/checker, and course timeline widgets that mirror the profile design spec.
- Reuses the authenticated sidebar/brand treatment and provides a sign-off button consistent with other pages.

**`app/edit_avatar/page.tsx` → `/edit_avatar`**
- Multi-step avatar customization flow where students select a base character, face expression, and accessory.
- Displays live previews (SVG avatars), contextual descriptions, and step indicators so users can experiment before saving.
- Includes cancel/back controls returning to the profile, maintaining the look and feel from the design file.

**`app/analytics/page.tsx` → `/analytics`**
- Student analytics dashboard summarizing progress metrics (hours learning, badges completed, reassessments, questions answered).
- Draws circular progress visualizations for assessment scores and uses icon cards to match the Figma information hierarchy.
- Shares the authenticated sidebar/nav shell and offers a sign-off button; all data is mocked to focus on layout fidelity.

**`app/badges/page.tsx` → `/badges`**
- Organizes earned and in-progress badges into collapsible sections (Completed, Ready to be Assessed, Still Learning).
- Provides badge detail modals on selection, status chips, and responsive list layouts tailored to the wallet design.
- Handles click-away closing for modals and mirrors sidebar/nav patterns used across student pages.

**`app/grades/page.tsx` → `/grades`**
- Placeholder route reserved for the detailed grades view from Figma; currently renders only a heading stub.
- Plan to replace this with the final grade table/cards once the design is implemented.

**`app/settings/page.tsx` → `/settings`**
- Placeholder settings surface awaiting design parity work; shows a simple heading until the detailed layout is ready.

## Lesson Delivery

**`app/lessons/[lessonId]/page.tsx` → `/lessons/:lessonId`**
- Dynamic lesson overview that loads per-lesson copy, skills, and checkpoint timelines from a local catalog (Bunsen Burner sample plus default fallback).
- Auth-gated; shares the sidebar navigation with the rest of the student workspace and highlights the active route.
- Displays “About this unit,” “Skills you’ll learn,” and a media-enriched lesson outline that mirrors storyboard frames from Figma.

**`app/lessons/[lessonId]/video/page.tsx` → `/lessons/:lessonId/video`**
- Route shim that pulls the `lessonId` param and renders the shared `LessonVideoPage` component with a context-specific title.
- Use this entry point to integrate future lesson segments once real content replaces the placeholder map.

**`app/lessons/[lessonId]/video.tsx` → shared component for the above route**
- Houses the full video-with-checkpoints experience: embedded YouTube player, timeline segments, checkpoint quiz modals, and completion flows.
- Manages modal state (checkpoint, results, lesson complete) and answer tracking, following the interaction design from the QEV Figma frames.
- Includes CTA buttons for rewatching, submitting answers, surfacing QR code, and starting surveys at the lesson’s conclusion.

## Instructor Tools

**`app/instructor/qev-demo/page.tsx` → `/instructor/qev-demo`**
- Prototype admin surface for configuring Question Embedded Video (QEV) payloads.
- Supports editing the lesson video URL, writing a description, adding/removing/updating cue points, and previews the structured payload text.
- Serves as the foundation for future instructor tooling specified in the Figma instructor flows.
