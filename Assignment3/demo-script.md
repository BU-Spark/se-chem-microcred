# 1-Minute Demo Script

Use this outline when recording the ~1 minute walkthrough with the workflow already located in `.github/workflows/ci.yml`.

1. **Intro (0:00 - 0:10)** – Explain you’re demoing the Assignment3 CI pipeline: lint + Jest test + Next.js build.
2. **Local checks (0:10 - 0:25)** – In the terminal, run `npm run lint -- --max-warnings=0` followed by `npm run test -- --runInBand --coverage app/page.test.tsx` and mention these must pass before committing.
3. **Commit & push (0:25 - 0:35)** – Stage and show `git commit`/`git push` so it’s clear what triggered CI.
4. **Actions run (0:35 - 0:50)** – In GitHub’s Actions tab, open the latest “Node.js CI” run and expand the `Run linter`, `Run unit tests (app/page.test.tsx)`, and `Build project` steps to show they executed successfully and in order.
5. **Wrap-up (0:50 - 1:00)** – State the final status (green = good, red = investigate) and point to the coverage artifact so viewers know where to inspect results.
