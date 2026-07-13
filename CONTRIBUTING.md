# Contributing to checkd (chem-skills)

This project is mid-way through a planned refactor. This document is the
contributor-facing summary — where new code should live, and what
conventions apply — pulled from the full roadmap at
[docs/refactor-roadmap.md](docs/refactor-roadmap.md). Read that file for the
complete phase-by-phase plan, rationale, and the duplication inventory that
motivated it. See [README.md](README.md) for product/feature overview.

## Guiding principles

1. **Strangler over rewrite.** When extracting shared code out of an
   existing file, leave the old export re-exporting from the new location
   (marked `/** @deprecated */`) rather than force every caller to update in
   the same commit. A later cleanup sweep deletes re-exports with zero
   importers.
2. **Behavior-preserving by default.** Pure extractions should ship with
   zero test changes — unchanged tests passing is the parity proof.
   Anything behavior-risky gets characterization tests first, in their own
   commit.
3. **No new dependencies, no URL changes** as part of refactor work. Route
   directory renames (`badge_creation` → kebab-case, etc.) are explicitly
   out of scope — they change user-facing URLs.
4. **Commit = atomic unit, PR = milestone.** Keep refactor commits
   single-concern and small (<400 lines where possible) — husky runs
   lint-staged + the full test suite pre-commit, so every commit should be
   green on its own. PRs bundle a coherent set of commits; merge without
   squashing so `git revert <sha>` stays a viable per-commit rollback.

## Canonical homes

| Concern | Home | Notes |
|---|---|---|
| Shared components | `app/components/<ComponentName>/` — PascalCase folder per component, colocated `.module.css` + test | See below for the folder convention. |
| Page-local components | `app/<route>/components/`, `app/<route>/steps/`, `app/<route>/hooks/` | Promote to `app/components/` only once ≥2 routes need it. `app/badge_creation/` is the reference template. |
| Utilities/services | Root `lib/` — client-safe pure code at top level, server-only code under `lib/api/` | Imported as `@/lib/<name>`. |
| Route-colocated API logic | `app/api/<domain>/lib/` | Follows the `app/api/courses/lib/` precedent. |
| Hooks | `app/hooks/` | |
| Shared types | Root `types/` (planned, not yet created — see roadmap Phase 1) | |
| Import style | `@/` absolute across directories; relative within a route folder | |
| Barrel `index.ts` files | Avoid | Merge-conflict magnets; import concrete files directly. |

### Shared components: `app/components/<ComponentName>/`

Shared components used to live in a flat `app/_components/` directory. That
directory is gone (Phase 0 of the roadmap) — everything moved into
`app/components/`, one folder per component:

- `app/components/BackButton/BackButton.tsx` (+ `BackButton.module.css`)
- `app/components/RichText/RichTextEditor.tsx` (+ `ToolbarPlugin.tsx`)
- `app/components/Navigation/Sidebar.tsx`
- `app/components/Profile/DatabaseDisplayNameProvider.tsx`
- `app/components/Courses/CourseTileImage.tsx`
- `app/components/Export/ExportToCsv.tsx`
- `app/components/Video/Youtube/YoutubeThumbnail.tsx`

**When adding a new shared component:**

1. Create a folder named for the component in PascalCase:
   `app/components/MyThing/`.
2. Put the component, its CSS module, and any tightly-coupled sub-parts
   (e.g. a toolbar plugin only that component uses) inside that folder.
3. Either `MyThing.tsx` or `index.tsx` is fine as the entry file — match
   whatever the neighboring components in that area already use. Don't mix
   both conventions in the same folder, and don't add a barrel `index.ts`
   purely to re-export other files.
4. Import it via the `@/` alias:
   `import MyThing from '@/app/components/MyThing/MyThing'`.

A few components (`GlobalHeader.tsx`) still sit loose directly under
`app/components/` — they predate the directory unification and haven't been
migrated into their own folder yet. Don't add new components this way; if
you're touching one of these files for other reasons, moving it into its
own folder is a welcome drive-by.

### Shared non-UI logic: `lib/`

Non-UI shared logic (Prisma client, grading, badge progress, rich-text
helpers, request/video utils) lives in the **root-level** `lib/` directory,
not `app/lib/` — the latter no longer exists, it was consolidated into
`lib/` so both application code and Prisma seed/CLI scripts resolve it the
same way. New shared helpers belong in `lib/`, imported as `@/lib/<name>`.

## Import alias

`@/*` resolves to the repo root (`tsconfig.json` `paths`), so:

- `@/app/components/RichText/RichTextEditor` → `app/components/RichText/RichTextEditor.tsx`
- `@/lib/question-rich-text` → `lib/question-rich-text.ts`

**Jest gotcha:** `next/jest` does *not* derive `moduleNameMapper` from
`tsconfig.json`'s `paths` — it only feeds `paths` into the SWC transform,
not module resolution. `jest.config.ts` carries an explicit mapper to keep
`@/` working in tests:

```ts
moduleNameMapper: {
  '^@/(.*)$': '<rootDir>/$1',
},
```

(An earlier version of the refactor roadmap assumed this mapper was
unnecessary and safe to delete outright — that assumption turned out to be
wrong; see the correction note at the top of
[docs/refactor-roadmap.md](docs/refactor-roadmap.md).) If you add a new
alias to `tsconfig.json`, mirror it here or `@/`-style imports will resolve
fine in the app but fail with "Cannot find module" in Jest.

When mocking a component with `jest.mock(...)`, use its real, current
`@/app/...` path — a mock against a stale path silently fails to intercept
the import, and the test ends up exercising the real component instead of
the mock.

## Where the refactor stands

**Phase 0 (foundations)** is done: single `app/components/` dir, single
`lib/` dir, corrected jest config, this document. Phases 1–6 (shared
utilities, API auth/error consolidation, shared UI primitives, API
monolith decomposition, page decomposition, incremental SSR) are planned
but not started — see [docs/refactor-roadmap.md](docs/refactor-roadmap.md)
for entry criteria, commit breakdown, and PR packaging per phase before
starting work in that area, so you don't duplicate or conflict with
in-flight refactor work.

Things explicitly **out of scope** for refactor work (see the roadmap's
appendix): route-directory renames, zod adoption, options-padding drift
unification, N+1 query batching, `video.tsx`'s `ModalState` → reducer
conversion, removing the root layout's `force-dynamic`, and badge
data-model restructuring (pending a client decision — see the badge
data-model issue memo).

## Before opening a PR

```bash
npm run lint    # ESLint + Prettier (auto-fix)
npm test        # Jest + React Testing Library
npm run build   # production build — catches path/import issues lint/test miss
```

If you move or rename a file under `app/components/` or `lib/`, grep for
every importer before deleting the old path, and check test files
specifically — `jest.mock()` calls reference paths as string literals, so
TypeScript won't catch a stale mock path for you:

```bash
grep -rn "OldPath" app lib --include="*.ts" --include="*.tsx"
```

See [README.md § Notes for Contributors](README.md#notes-for-contributors)
for product/domain conventions (roles come from `Enrollment.role`, seed
data must stay idempotent, etc.).
