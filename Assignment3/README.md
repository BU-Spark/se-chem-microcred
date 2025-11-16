# Assignment 3 – CI Pipeline

## CI Tool
- **GitHub Actions** CI workflow defined in `.github/workflows/ci.yml`.

---

## Implemented Tasks

1. **ESLint (Code Quality Check)**  
   - CI command:  
     ```bash
     npm run lint -- --max-warnings=0
     ```  
   - The pipeline fails on any ESLint error or warning, enforcing a strict style and static analysis gate.

2. **Jest Unit Tests (Behavior Verification)**  
   - CI command:  
     ```bash
     npm run test -- --runInBand --ci app/page.test.tsx
     ```  
   - Ensures the custom test file `app/page.test.tsx` is executed inside CI, with logs visible in the GitHub Actions run and coverage enabled.

3. **Next.js Build (Build Verification)**  
   - CI command:  
     ```bash
     npm run build
     ```  
   - Only runs **after** linting and tests succeed, guaranteeing that the production build is created from vetted, passing code.

---

## How to Trigger the Pipeline

- **Automatically**  
  - Any `push` or `pull_request` targeting the `main` or `dev` branches triggers the CI workflow, since `.github/workflows/ci.yml` is already present in the repository.
  - All Assignment-3-specific files are kept inside the `Assignment3/` directory for grading, while CI configuration lives independently under `.github/workflows/`.

- **Manually**  
  - In GitHub, navigate to:  
    `Actions → Assignment3 CI → Run workflow`  
  - Choose a branch and click **Run workflow** (enabled via the `workflow_dispatch` option).

---

## Challenges
- **Aligning Local Developer Experience With CI Strictness**
- The existing npm run lint script uses eslint . --fix, which is convenient for local development but inappropriate for CI, where we want lint errors to cause the job to fail rather than be automatically fixed.
To handle this without modifying the project’s scripts, the CI pipeline appends --max-warnings=0 to force strict lint behavior.

- **Clarifying Responsibility Between Local Hooks and CI Pipeline**
- The project uses Husky and lint-staged, meaning tests may run automatically during git commit. Understanding how these local hooks interact with CI and ensuring tests run reliably in both contexts required separation of local validation and CI verification.

---
