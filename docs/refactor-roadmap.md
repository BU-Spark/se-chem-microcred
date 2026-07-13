# checkd (chem-skills) — Low-Risk Refactoring Roadmap

> Source: `act-as-a-principal-linked-teacup.pdf` (2026-07-13), committed here so
> the roadmap lives with the code it governs. See
> [CONTRIBUTING.md](../CONTRIBUTING.md) for the contributor-facing summary
> (canonical homes, current phase status) — this file is the full plan.
>
> **Correction to §0.1 (2026-07-13):** the roadmap asserts the three
> `moduleNameMapper` entries removed in that commit were "vestigial" because
> "next/jest resolves `@/*`→root automatically." That assumption is false —
> `next/jest` only feeds `tsconfig.json` `paths` into the SWC transform, not
> into Jest's module resolution. Removing them broke `@/`-aliased imports in
> tests outright; it just didn't surface until a test used one. The actual
> fix was a single generic mapper (`'^@/(.*)$': '<rootDir>/$1'`), not
> deletion. `jest.config.ts` reflects the corrected version.

## Context

This Next.js 15 App Router codebase (~33k lines of app code, dev→main flow)
has grown a set of multi-hundred-line monoliths:
`app/lessons/[lessonId]/video.tsx` (1,799 lines), `app/api/badges/route.ts`
(1,309), `app/courses/new/page.tsx` (1,173), `app/roster/page.tsx` (1,125),
the student-badge API route (1,015), and ~8 more files over 600 lines.
Concerns are heavily mixed (data fetching + form state + inline modals +
inline hooks + inline types in single files), and the same logic is
copy-pasted across files. The goal: extract reusable components, hooks, and
utilities so bug fixes and features become localized, and introduce
Server/Client Component separation incrementally — all without behavior
changes, URL changes, or disruption to in-flight feature branches.

**Execution model (user-confirmed):** one person is leading this refactor
solo; per-change human PR review is not available. The roadmap is therefore
structured around a two-level git model — the commit is the atomic safety
unit, the PR is the integration milestone — with CI, CodeRabbit, and the
test suite serving as the review gate. Canonical shared-components home:
`app/components/`.

## Verified current state (exploration findings)

**UI layer** — everything is client-side. All ~27 pages are `'use client'`;
there are zero Server Components and the root layout is `force-dynamic`. All
data fetching is client-side `useEffect`+`fetch` against `/api/*`. Two hooks
use SWR (`app/hooks/useMyCourses.ts`, `useCanCreateContent.ts`); the
canonical `app/hooks/useStudentData.ts` and 5 page-inline hooks are
hand-rolled with the same `{data, isLoading, error, refresh}` shape.
Server/Client separation is a green-field addition, not a refactor of
existing splits.

**Duplication inventory (grep-verified):**

- `handleSignOut` duplicated in 20 files (+1 in `AppHeader`)
- `SurveyModal` (1–5 face rating) duplicated verbatim ×3
  (`app/page.tsx:814`, `app/course_dashboard/page.tsx:544`, variant in
  `video.tsx`)
- Modal/dialog markup (overlay + `role="dialog"` + `useFocusTrap`) in ~18
  places; `useFocusTrap` hook already exists
- ~250 lines byte-duplicated between `app/api/badges/route.ts` and
  `app/api/badges/import/route.ts` (`slugify`, `parseTimeToSeconds`,
  `normalizeOptions` — with drift: badges pads to 2 options at `:196-206`,
  import doesn't — `normalizeCheckpointQuestions`, plus identical payload
  types)
- `normalizeEmail` defined independently in 11 API files; `badRequest()`
  defined identically twice; no shared error helper
- CSV parser ×2 (`app/roster/page.tsx:86` vs `app/courses/new/page.tsx:449`);
  name/initials/avatar helpers ×6 variants; `EnrollmentSummary`, `Contact`,
  `BadgeStatus`, role unions re-declared inline across 4+ pages
- Two ~350-line deep-copy engines (`badges/import`,
  `courses/[courseId]/duplicate`) using the same `createMany` +
  read-back-id-remap idiom
- Untyped `version: 3` requirement-summary JSON codec built in
  `badges/route.ts:421-529`, re-parsed in `demo/student:102` and
  `import:198`
- Three competing API auth patterns: (1) inline `currentUser()`→email→
  `prisma.user.findUnique` in 20+ routes with copy-pasted 401/404 strings;
  (2) `ensureCurrentUser()` in `app/api/courses/lib/ensure-user.ts` — the
  good, race-safe, lazy-provisioning helper, used by 15 files; (3)
  client-supplied `?email=` + `sessionMatchesEmail` in 5 files.
  `middleware.ts` only session-gates.

**Existing good patterns to generalize (reuse, don't reinvent):**

- `app/badge_creation/` — the decomposition template: `steps/` +
  `components/` + `lib/badge-helpers.ts` + `types.ts`
- `app/api/courses/lib/course-queries.ts` (694 lines, ~9
  `fetchAccessible*` functions baking in the creator-or-staff access
  filter) — used by 11 routes, bypassed by the biggest ones
- `lib/badgeProgress.ts` `syncLessonBadgesForStudent` (11 call sites),
  `lib/checkpointQuestions.ts` (read-side serializer),
  `lib/adminAccess.ts` (`ALPHA_MODE` gate)

**Safety net (leverage):** CI on every push/PR to dev/main runs lint + full
jest suite (37 test files) + production build; husky pre-commit runs
lint-staged + the FULL suite (this makes "every commit is green" automatic,
not aspirational); strict TS; Prettier-as-error; CodeRabbit automated PR
review.

**Traps (must respect):**

- Page tests mock the data hooks (not SWR) and stub `global.fetch` on exact
  URL strings — hook-shape changes and route renames ripple through many
  tests. Preserve hook return shapes and API paths.
- ~~`jest.config.ts:11-15` has three custom `moduleNameMapper` entries
  (`@/components/*`→`app/components`, etc.) — verified vestigial: zero
  source files import via those prefixes... Safe deletion, not a
  migration.~~ **Corrected** — see note at top of this file. A single
  generic mapper is required for `@/`-aliased imports to resolve in Jest.
- Two parallel component dirs (`app/_components/` with 8 files vs
  `app/components/` with 6 folder-style components) and two lib dirs (root
  `lib/` vs `app/lib/` holding one file).
- README invariant: role is always derived per-course from
  `Enrollment.role` — never introduce a global role.
- Active branches `char-customization` (touches Sidebar/avatar) and
  `feature/111-checker-rubric-ns` (touches rubric assessment) — sequence
  around them.
- A badge/lesson/course data-model flaw is documented and deferred pending
  a client decision — badge-route refactors must be pure extractions
  (preserving behavior) so a later model change swaps the service
  internals, not the routes.
- Route-dir naming (`badge_creation`, `course_dashboard`, `my_badges`
  snake_case) is inconsistent but renames change user-facing URLs — out of
  scope (deferred appendix).

## Guiding principles

1. **Strangler over rewrite.** Every extraction leaves the old export
   re-exporting from the new location with `/** @deprecated */` until a
   phase-end cleanup sweep deletes it. Nothing forces other contributors to
   update in lockstep.
2. **Behavior-preserving by default.** Pure extractions ship with zero test
   changes — unchanged tests passing IS the parity evidence. Anything
   behavior-risky gets characterization tests first, in their own commit.
3. **No new dependencies, no URL changes.** No zod (deferred — the
   `parse*Payload()` seams created in Phase 4 make later adoption
   mechanical). No route-dir renames.
4. **The commit is the atomic unit; the PR is the milestone.** Every
   numbered work item below (0.1, 1.4, 4.8, …) is one commit:
   single-concern, <400 lines where possible, fully green (husky already
   runs lint-staged + the full suite pre-commit). PRs bundle a phase's
   commits into one coherent, independently mergeable milestone.
5. **Rollback happens at commit granularity** (`git revert <sha>`), which
   requires that refactor PRs merge without squashing.

## Canonical homes (establish in Phase 0, enforce going forward)

| Concern | Home | Rationale |
|---|---|---|
| Shared components | `app/components/` — PascalCase folder per component, colocated `.module.css` + test | User-confirmed; already the larger/newer home. `app/_components/` merges in. |
| Page-local components | `app/<route>/components/`, `app/<route>/steps/`, `app/<route>/hooks/` | The proven `badge_creation` template. Promote to `app/components/` only at ≥2 consuming routes. |
| Utilities/services | Root `lib/` — client-safe pure code at top level, server-only code under `lib/api/` | 60+ imports already target `@/lib`; prisma singleton lives there. `app/lib/question-rich-text.ts` moves in. |
| Route-colocated API logic | `app/api/<domain>/lib/` | Follows the `app/api/courses/lib/` precedent. |
| Hooks | `app/hooks/` | Already exists with 5 hooks. |
| Shared types | New root `types/` (`types/student.ts`, `types/badges.ts`, `types/enrollment.ts`, `types/api/<domain>.ts`) | Shared by client and server; resolves via existing tsconfig `@/*` with no jest change. |
| Import style | `@/` absolute across directories; relative within a route folder | Matches dominant usage. |
| No barrel `index.ts` files | — | Merge-conflict magnets; jest coverage already excludes `index.*`. Import concrete files. |

## Phase 0 — Foundations & directory unification

**Objective:** one components dir, one lib dir, clean jest config,
documented conventions — stop new code landing in the wrong place before
extraction begins.

**Entry criteria:** dev green in CI; heads-up to owners of
`char-customization` and `feature/111` about the `Sidebar.tsx` move.

**Commits:**

- **0.1** — Delete the 3 vestigial `moduleNameMapper` entries in
  `jest.config.ts:11-15` (~5 lines). *(Corrected in practice — see note at
  top: replaced with one generic mapper, not a bare deletion.)*
- **0.2** — `git mv app/lib/question-rich-text.ts lib/` (+ test), update
  importers, delete `app/lib/`.
- **0.3** — `git mv` the `app/_components/` files (BackButton,
  CourseTileImage, DatabaseDisplayNameProvider, ExportToCsv,
  RichTextEditor, YoutubeThumbnail, `rich-text/`) into `app/components/` as
  PascalCase folders; update imports. Move only — no logic edits in this
  commit (preserves git rename detection).
- **0.4** — `git mv Sidebar.tsx` (its own commit; if `char-customization`
  is still open, pull this commit into its own tiny PR merged in
  coordination with that branch's owner).
- **0.5** — Add a "Where code lives" section to README (or new
  CONTRIBUTING.md) codifying the table above + the per-course-role
  invariant.

**PR packaging:** one PR ("refactor: unify component/lib dirs and
conventions"), commits 0.1–0.3 + 0.5; 0.4 separate only if coordination
requires it. Merge fast — this is the import-churn PR that conflicts with
everything left open.

**Verification:** each commit green via husky; `grep -r "_components" app/`
→ empty after 0.4. **Exit criteria:** single components dir, single lib
dir, no custom jest mappings, conventions documented. **Blast radius:** ~30
files, import lines only.

## Phase 1 — Leaf extractions: pure utilities & shared types

**Objective:** kill the small, provably-pure duplication. Zero behavior
change; every new module gets unit tests.

**Entry criteria:** Phase 0 merged.

**Commits** (each = new module + unit tests + swap call sites + delete old
copies; independent, any order):

- **1.1** — `lib/text/name.ts`: consolidate
  `splitName`/`splitNameForProfile`/`parseName`/`initialsFor`/
  `initialsFromName` (already exported from `Sidebar.tsx:48`)/`avatarAsset`.
  Caution: write table-driven tests capturing each variant's current output
  first; if outputs differ, keep separately-named functions in one file
  rather than silently unifying.
- **1.2** — `lib/text/email.ts`: `normalizeEmail` (replaces 11 API-file
  copies).
- **1.3** — `lib/csv.ts`: two commits — characterization tests for both
  existing parsers first, then shared tokenizer + two thin named wrappers
  preserving each caller's exact semantics.
- **1.4** — `lib/checkpoints/normalizeWrite.ts`: extract the ~250-line
  duplicated block from `badges/route.ts` + `badges/import/route.ts`.
  Preserve the drift: `normalizeOptions` takes a `padToTwoOptions` flag
  (badges passes `true`, import `false`); unifying is a separate
  behavior-labeled decision later. Named `normalizeWrite` to avoid
  colliding with read-side `lib/checkpointQuestions.ts`.
- **1.5** — `types/`: move `StudentData`/`LessonRecord`/`BadgeRecord`/status
  unions out of `useStudentData.ts`, leaving
  `export type { ... } from '@/types/student'` re-exports (the 20
  importers don't change yet). Fold in duplicated `EnrollmentSummary` ×2,
  `Contact`/`CourseContact` ×4, `BadgeStatus`, `RosterRole`/`ProfileRole`.
- **1.6** — `lib/roles.ts`: `isInstructor`/`isChecker`/`isStaff`/
  `roleForCourse(enrollments, courseId)` honoring the `Enrollment.role`
  invariant. Pilot on the worst offender (`app/roster/page.tsx`, 31 inline
  checks); other call sites migrate opportunistically later.

**PR packaging:** one PR ("refactor: shared utils and types"), commits
1.1–1.6 in sequence. If it grows past ~7 commits / a few days of work,
split at the natural seam: 1.1–1.3 (text/CSV) and 1.4–1.6
(checkpoint/types/roles).

**Verification:** new unit tests pass; existing suite unchanged and green
per commit; grep proves duplicates deleted (e.g.
`grep -rn "function normalizeEmail" app/api | wc -l` → 0). **Exit
criteria:** six modules exist with tests; no file privately defines
email/CSV/name/checkpoint-write normalization.

## Phase 2 — API cross-cutting: auth, errors, responses

**Objective:** one auth idiom and one error idiom before decomposing the
big handlers, so decomposition doesn't copy the mess forward.

**Entry criteria:** Phase 1 merged. Can run in parallel with Phase 3
(disjoint files).

**Commits:**

- **2.1** — Promote `ensureCurrentUser`: move
  `app/api/courses/lib/ensure-user.ts` → `lib/api/ensure-user.ts`,
  re-export at old path (15 importers untouched). Unit tests using the
  existing mock convention (`jest.mock('@clerk/nextjs/server')` + per-test
  prisma mock).
- **2.2** — `lib/api/responses.ts`:
  `badRequest`/`unauthorized`/`forbidden`/`notFound`/`serverError` with
  byte-identical messages to the current copy-pasted strings (API tests
  assert them). Pilot in 2–3 small routes.
- **2.3–2.7** — Migrate the ~20 inline-`currentUser()` routes to
  `ensureCurrentUser` + `responses.ts`, one commit per domain group (~4
  routes each). Unchanged route tests = parity proof.
- **2.8 (behavior-risk — own PR)** — The 5 `?email=` routes:
  characterization-test commit first; then derive identity from the
  session via `ensureCurrentUser`, keeping `?email=` accepted-but-
  cross-checked (401 on mismatch, matching today's `sessionMatchesEmail`)
  so no client breaks. Security hardening; give it a staging soak before
  merging to main.

**PR packaging:** PR "refactor(api): consolidate auth + error responses" =
commits 2.1–2.7. PR "fix(api): harden email-param identity" = 2.8 alone,
clearly labeled, merged only after the first PR has proven stable on
staging.

**Verification:** existing API tests unchanged and green per commit;
`grep -rn "currentUser()" app/api | wc -l` trends to ~0 outside `lib/api/`.
**Exit criteria:** every route authenticates via `ensureCurrentUser`; zero
inline `badRequest` definitions; `?email=` identity eliminated.

## Phase 3 — Shared UI primitives & data hooks

**Objective:** build the client-side vocabulary (Modal, SurveyModal,
sign-out, SWR hooks, display components) that Phase 5's page decompositions
will assemble from.

**Entry criteria:** Phases 0–1 merged. Parallel with Phase 2.

**Commits:**

- **3.1** — `app/components/Modal/`: overlay + `role="dialog"` +
  `useFocusTrap` + Escape/overlay-close, matching the dominant existing
  markup so CSS holds. RTL tests (focus trap, escape, aria). Migrate 2
  pilot usages.
- **3.2** — `app/components/SurveyModal/`: diff the three copies first;
  parameterize if video's variant differs. Deletes ~500 duplicated lines.
- **3.3–3.6** — `app/hooks/useSignOut.ts`; migrate all 21 call sites in
  commits of ~5–7 pages (Clerk module mocks in tests are unaffected — the
  hook still calls Clerk underneath).
- **3.7** — SWR scaffolding: `app/hooks/lib/fetcher.ts` + jest util
  providing `SWRConfig` (`provider: () => new Map()`,
  `dedupingInterval: 0`).
- **3.8–3.12** — Convert the hand-rolled fetch hooks to SWR, one hook per
  commit, preserving the exact `{data, isLoading, error, refresh}` return
  shape (page tests mock the hooks → untouched; each hook's own unit test
  is rewritten with the SWR util in the same commit). Smallest fan-out
  first; `useStudentData.ts` last (already thinned by 1.5). Rollback =
  revert one commit.
- **3.13** — Extract page-inline hooks as pure moves (internals untouched):
  `useCourseRoster` (`roster/page.tsx:143`) → `app/roster/hooks/`,
  `useCreatedCourseDetail` (`courses/[courseId]/page.tsx:180`),
  `useAssessmentReadiness` (`assessments/.../page.tsx:161`). SWR-convert
  afterward via the 3.8 pattern.
- **3.14–3.16** — Shared display components, one per commit: `BadgeToken`
  (×5 pages), `CollapsibleSection` (×3), `StudentProfileCard`/`BadgeGrid` —
  the latter must get its own `.module.css`, ending the assessments
  route's cross-route import of
  `app/roster/[studentId]/page.module.css`.
- **3.17** — QR/assessment-code flow component (×2 duplication:
  `video.tsx`, `badges/page.tsx`).

**PR packaging:** three PRs at natural seams — "refactor(ui): modal +
survey + sign-out primitives" (3.1–3.6), "refactor(hooks): SWR data layer"
(3.7–3.13; the one Phase-3 PR worth soaking on staging before the next
lands, since it changes runtime fetch behavior even with shapes preserved),
"refactor(ui): shared display components" (3.14–3.17).

**Verification:** RTL tests for every new component; page tests unchanged;
visual spot-check on staging after each PR (CSS-module moves can shift
specificity). **Exit criteria:** zero verbatim `SurveyModal`/`signOut`
copies (grep-verifiable); all data hooks on SWR with stable shapes; Modal
adopted in ≥6 of ~18 dialog sites (rest migrate during Phase 5).

## Phase 4 — API monolith decomposition (service extraction)

**Objective:** the three giant handlers + twin copy engines become thin
routes (auth → parse → service → respond) over unit-tested functions in
`app/api/<domain>/lib/`, extending the `course-queries.ts` pattern. Pure
extraction only — the pending badge data-model client decision means badge
logic must move verbatim so a later model change swaps service internals,
not routes.

**Entry criteria:** Phase 2 merged. Hold 4.4 until `feature/111-checker-
rubric-ns` merges.

**Commits** (strict order, smallest risk first; characterization tests
always their own commit preceding the extraction they protect):

- **4.0** — Characterization tests: handler-level tests with mocked prisma
  fixtures snapshotting response JSON — priority `demo/student` GET,
  badges PATCH fan-out, student-badge POST scoring. The phase's safety
  net; budget real time.
- **4.1** — `app/api/badges/lib/copy-badge.ts`: extract the shared
  deep-copy engine (`createMany` + read-back-id-remap) from
  `badges/import/route.ts` (679) and
  `courses/[courseId]/duplicate/route.ts` (399); both become thin
  callers. Kills ~350 duplicate lines.
- **4.2** — `lib/requirementSummary.ts`: typed encode/decode for the
  `version: 3` JSON codec; round-trip tests; swap all 3 call sites.
- **4.3** — Extend `course-queries.ts` with a helper capturing the
  creator-or-staff OR-query triplicated in the student-badge route at
  `:246`, `:637`, `:928`.
- **4.4 (post-feature/111 merge)** — Split the student-badge route (1,015
  lines): one commit per method — GET detail / POST scoring (pure scoring
  function from `:726-826` + exhaustive unit tests) / PATCH config — into
  a colocated `lib/`.
- **4.5–4.7** — `badges/route.ts` (1,309), one commit per method: GET list
  query-builder, POST create (introduce the `parseBadgePayload()` seam),
  PATCH family-sync fan-out (`:733-959`) into `app/api/badges/lib/`.
  Extract-then-optimize: N+1 loops inside transactions (`:826`,
  `:898-957`) move verbatim; batching is a separate later
  behavior-labeled commit.
- **4.8** — `demo/student` (810): the ~360-line derivation (`:392-750`)
  becomes pure `buildStudentHomePayload(rows)` + orchestrating
  `getStudentHomeData(userId)` in `app/api/demo/student/lib/`.
  Fixture-driven tests. Deliberately the seam Phase 6 calls from a Server
  Component.
- **4.9** — `courses/route.ts` POST (604): split create-vs-update paths;
  CSV import (`:367-523`) consumes `lib/csv.ts`. Keep the interactive
  `$transaction` + `{timeout: 15000}` boundaries exactly where they are
  (Prisma Accelerate cap).
- **4.10+** — Migrate bypassing routes (qr, lessons/*, checkpoints/*) onto
  `fetchAccessible*` helpers, one commit per route.

**PR packaging:** one PR per route file — "refactor(api): decompose badges
route" (4.0 badges tests + 4.5–4.7), "refactor(api): decompose
student-badge route" (tests + 4.4), "refactor(api): extract badge copy
engine" (4.1–4.2), "refactor(api): decompose demo/student" (4.8),
"refactor(api): decompose course create/update" (4.9). Each leaves dev
deployable and gets a staging soak before starting the next — these are
the highest-stakes server changes in the roadmap.

**Verification:** existing route tests (which import handlers directly)
pass unchanged — the parity proof. Unit tests on every extracted service.
`wc -l` gate: no `route.ts` over ~250 lines at phase end.

## Phase 5 — Page monolith decomposition (still fully client)

**Objective:** every page follows the `badge_creation` template —
`page.tsx` as thin composition over colocated `components/`, `steps/`,
`hooks/`, `lib/`, `types.ts`. No SSR changes yet; `'use client'` stays.

**Entry criteria per page:** its Phase 3 primitives are merged; the page
has a test — for the ~7 untested pages (profile flows especially), write a
smoke/characterization RTL test as the first commit of that page's PR.

**Order (smallest → biggest), one PR per page, commits = one extraction
concern each:**

1. `app/course_dashboard/page.tsx` (585 — small once SurveyModal is
   shared).
2. `app/badges/page.tsx` (622) and `app/profile/page.tsx` (667,
   test-first commit): modals → local `components/`.
3. `app/page.tsx` (879): 3 inline modals + cards → `app/components/home/`
   namespace (root page has no route folder to colocate in).
4. `app/assessments/.../badges/[badgeId]/page.tsx` (718): sections out;
   CSS ownership already fixed in 3.16.
5. `app/courses/[courseId]/page.tsx` (986): `PersonCard` (`:225`) → local
   `components/`; hook already out.
6. `app/roster/page.tsx` (1,125): 3 inline modals (`:911-1122`) onto the
   Modal primitive; roles via `lib/roles.ts`; CSV via `lib/csv.ts`.
7. `app/courses/new/page.tsx` (1,173): first commit moves `ConfigRow` out
   of the page function (`:584`) — inline component definitions remount
   on every render, so extraction is a subtle correctness improvement;
   verify nothing relies on remount-reset state. Then one commit per
   wizard step into `steps/`, mirroring `badge_creation`.
8. `app/lessons/[lessonId]/video.tsx` (1,799) — last, and the one page
   that warrants 2–3 PRs of its own: PR (a) interaction characterization
   tests + the 7 inline modals → local `components/` (1–2 modals per
   commit, ~500 lines); PR (b) QR flow → shared component from 3.17 +
   extract `useYouTubePlayer`, `useCheckpoints`, `useLessonGrading` hooks
   (one hook per commit). The `ModalState` machine at `:26` stays as-is
   (reducer conversion deferred to appendix).

**Verification per commit:** page test unchanged (or newly added) and
green; build passes. **Per PR:** manual staging click-through of the page;
`wc -l` trending down. **Exit criteria:** no page over ~300 lines except
video (target <600); zero inline modal or hook definitions inside page
functions.

## Phase 6 — Incremental Server/Client separation (SSR)

**Objective:** server-rendered initial data where it pays, with zero
big-bang and zero API-route breakage.

**Entry criteria per page:** decomposed (Phase 5) and its data service
extracted (Phase 4.8 pattern). Separately: investigate and document why
the root layout is `force-dynamic` (likely Clerk) before touching it —
removal is its own PR with a staging soak.

**Strategy — server-shell + SWR `fallbackData`:**

- **Commit A (structural, zero behavior):** per page, `page.tsx` becomes a
  Server Component rendering `<XPageClient />`; the `'use client'`
  directive moves down into the client file.
- **Commit B (server data, where it pays):** the server `page.tsx` calls
  the extracted service directly (e.g. `getStudentHomeData(userId)` — not
  `fetch` to its own API), gets identity via `auth()`/`currentUser()` from
  `@clerk/nextjs/server` (middleware already protects the route), and
  passes the payload to the client component as SWR `fallbackData`. The
  `/api` route stays alive and untouched — client-side refresh,
  mutations, and every existing API test keep working. Both paths serve
  until you retire per-route.

**Candidates, in order:** home (`app/page.tsx` via `getStudentHomeData`),
`app/badges`, `app/courses/[courseId]`, grades — read-mostly,
above-the-fold, biggest perceived-perf win.

**Stays client permanently (explicit):** `app/lessons/[lessonId]/`
(YouTube player lifecycle), the `courses/new` and `badge_creation`
wizards, roster's interactive table, `edit_avatar` — anything driven by
interactive `useUser` flows.

**Testing:** server shells are near-trivial; real logic lives in Phase 4
services (unit-tested) and client components (RTL-tested via props). Don't
fight jsdom over async Server Components.

**PR packaging:** one PR per page (commits A + B), each with a staging
soak — this is the only phase with genuine runtime-behavior change, hence
last and per-page revertable.

**Verification:** staging soak per page; no hydration warnings in
console; TTFB/Lighthouse before-after note in each PR; full suite green
(unchanged API tests prove the parallel path). **Exit criteria:** top 3
pages server-hydrated.

## Process notes

- Keep the pinned "refactor claims" issue: before decomposing a page/route,
  note it there so nobody opens a feature branch against a file that's
  about to move. Announce Phase 0 before it lands — it's the only
  milestone that touches imports repo-wide.
- The strangler re-exports (`/** @deprecated */`) exist precisely so
  in-flight branches keep compiling; each phase ends with one
  cleanup-sweep commit deleting re-exports whose importer count is zero
  (grep-verified).
- Behavior-risk work (2.8 email-auth, SWR conversion PR, Phase 6 pages) is
  where to spend scarce human-review capital: get one teammate to review
  just those, and give each a staging soak before it rides a dev→main
  merge.
- **Feature flags:** NOT warranted for pure extractions — atomic
  revertable commits are the rollback mechanism. Reserve parallel-file/flag
  treatment for exactly: SWR hook conversions (old hook kept ~1 week as a
  parallel file, then deleted), the `?email=` auth convergence (2.8), and
  any future `force-dynamic` or options-padding unification. Don't
  overload `ALPHA_MODE`.
- **Hook cost:** husky runs the full suite pre-commit AND pre-push — keep
  new tests fast (fake timers, SWR test provider with zero deduping). If
  suite time becomes painful mid-refactor, `git commit -n` is a trap to
  avoid; instead invest in the slow test.

## Definition of done (grep/wc-verifiable)

1. One components dir (`app/components/`), one lib dir (root `lib/` +
   colocated `app/api/*/lib/`), `types/` exists; `app/_components/` and
   `app/lib/` deleted.
2. `jest.config.ts` has no *custom (vestigial)* `moduleNameMapper` beyond
   what's needed for `@/` alias resolution; aliases resolve identically in
   tsc, jest, and next build.
3. Zero duplicate definitions of: `SurveyModal`, `handleSignOut`,
   `normalizeEmail`, `badRequest`, CSV parsing, write-side checkpoint
   normalization, requirement-summary codec, name/initials helpers.
4. All API routes authenticate via `ensureCurrentUser`; no `?email=`
   identity path.
5. No `route.ts` > ~250 lines; no page/page-client component > ~300 lines
   (video < 600); all data hooks on SWR with unchanged return shapes.
6. Test count strictly increased (characterization + unit tests for every
   extracted module); coverage not decreased; previously-untested pages
   have at least smoke tests.
7. README documents canonical homes and the server-shell pattern; top 3
   pages server-hydrated.

## Appendix — explicitly deferred

- Route-directory renames (`badge_creation` → kebab-case, etc.):
  user-facing URL changes; if ever done, use the existing
  `app/badges_creation` redirect-stub pattern.
- zod adoption: mechanical per-route swap once the `parse*Payload()` seams
  exist (Phase 4).
- Options-padding drift unification (badges pads to 2, import doesn't):
  product decision, not refactor.
- N+1 batching inside badges PATCH / demo-student transactions: perf
  commits after extraction parity is proven.
- `video.tsx` `ModalState` → reducer; removing root-layout
  `force-dynamic`.
- Badge data-model restructuring: pending client decision (documented
  separately — see the badge data-model issue memo); Phase 4's pure
  extractions are designed so this swap later touches only service
  internals.
