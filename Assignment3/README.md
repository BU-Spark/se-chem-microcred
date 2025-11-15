# Assignment 3 – CI Pipeline Deliverable

## CI Tool
- **GitHub Actions** workflow leveraging in `.github/workflows/ci.yml`.

## Implemented Tasks
1. **ESLint** – runs `npm run lint -- --max-warnings=0` and fails on any lint error/warning.
2. **Jest Unit Tests** – runs `npm run test -- --runInBand --ci app/page.test.tsx`, so our custom `app/page.test.tsx` file executes inside CI with coverage enabled and logs published in Actions.
3. **Next.js Build** – runs `npm run build` only after linting and tests succeed, guaranteeing the bundle is produced from vetted code.

## How to Trigger
- Any `push` or `pull_request` targeting `main` or `dev` fires automatically because `.github/workflows/ci.yml` already lives in the repo (keep the rest of the assignment files inside `Assignment3/` for grading).
- Run manually in GitHub via **Actions → Assignment3 CI → Run workflow** (enabled through `workflow_dispatch`).

## Before Pushing or Committing
- Run `npm run lint -- --max-warnings=0` locally to catch formatting and syntax issues early.
- Run `npm run test -- --runInBand --coverage app/page.test.tsx` so the same unit tests that CI uses (`app/page.test.tsx`) stay green prior to pushing any branch or opening a pull request.

## Demo Instructions
1. Point GitHub to `.github/workflows/ci.yml` (already present in this repo) by pushing any commit/PR.
2. In GitHub, open the **Actions** tab, pick the latest `Assignment3 CI` run, and start a screen recording (QuickTime, Loom, etc.).
3. Narrate the queued run, show the sequential `Run ESLint`, `Run Jest tests`, and `Build Next.js app` logs, and highlight that the job stops on failure.
4. Conclude with a ~10 second recap interpreting the pass/fail status and where artifacts/logs live.

## Challenges
- The Codespace/CLI environment cannot capture or upload an actual video, so only written demo instructions are provided.
- Existing `npm run lint` uses `--fix`; adding `--max-warnings=0` via CLI ensures the CI job still fails on violations without altering project scripts.
