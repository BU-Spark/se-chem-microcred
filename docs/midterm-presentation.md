## Project Overview

- **Name:** ChemSkills Micro-Credential Platform  
- **Client:** BU General Chemistry (CH101/CH102) Laboratory Program  
- **Team:** Codex + BU DS 519 Student Team  
- **Goal:** Deliver a unified digital experience that teaches, evaluates, and tracks foundational chemistry lab skills through question-embedded videos, assessments, and instructor feedback tools.

---

## Problem Statement

Lab instructors currently manage 800+ students manually. Skill instruction (videos, rubrics, written docs) is scattered, tracking progress is cumbersome, and students lack a consolidated view of their mastery status or timely feedback.

---

## Main User Stories

1. **As a chemistry student**, I can watch skill videos with embedded checkpoints, answer questions, and track completion so I know what to practice next.  
2. **As a chemistry student**, I can schedule and complete in-person skill check-ins, see rubric-based feedback, and understand whether I am “proficient” or “still learning.”  
3. **As an instructor/TA**, I can monitor each student’s skill progress, record check-in results, and share feedback quickly.  
4. **As an instructor**, I can see aggregated progress dashboards to plan lab sessions and interventions.  

---

## "Marketecture"

- **Users:** Students, Teaching Assistants, Instructors/Lab Coordinators  
- **Experience Pillars:**  
  - Centralized content (videos, rubrics, practice guidance)  
  - Embedded assessment questions & check-in workflows  
  - Progress dashboards + micro-credential reporting  
- **Value:** Reduces admin burden, increases feedback quality, makes skill progression transparent.

---

## Technical Architecture

- **Frontend:** Next.js 15 (App Router), TypeScript, modular CSS  
- **Data Layer:** Prisma ORM with PostgreSQL (Prisma Accelerate)  
- **State & Auth Simulation:** Local storage/auth hook (migrating toward server-backed auth)  
- **Video Delivery:** YouTube iframe integration (mux planned) with checkpoint controls  
- **API Routes:** Next.js Route Handlers for student data, checkpoint attempts, analytics  
- **Deployment Target:** Vercel (preview) → production (TBD)  

---

## Milestones & Timeline

### Stage 1 – Project Foundation *(Completed)*

- Next.js 15 app scaffolded with shared linting/testing tools  
- Repository hygiene in place (.env patterns, CI-ready configs)  
- Initial Vercel preview deployment path validated  

### Stage 2 – Data & Auth Scaffold *(Completed)*

- Prisma schema for students, lessons, checkpoints, attempts, badges  
- Seed scripts plus demo data for rapid prototyping  
- Local auth simulation and student enrollment flow wired  

### Stage 3 – Student Experience MVP *(In Progress — Current Stage)*

- Student dashboard for lessons, badges, analytics, profile  
- Question-embedded video player with checkpoint gating  
- Checkpoint evaluation API, attempt tracking, and progress bar polish  
- Remaining to finish: swap in Mux playback + tighten student UX feedback loops  

### Stage 4 – Assessment Depth *(Up Next)*

- Expand checkpoint types (short answer, media prompts) and review flows  
- Surface richer progress insights to students (attempt history, recommended next steps)  
- Lock in Clerk-backed authentication for a smooth handoff to real accounts  

### Stage 5 – Production Readiness *(Later)*

- Advanced analytics for student learning patterns and credential exports  
- Mobile responsiveness and accessibility audit  
- CI/CD hardening, staging/prod deployment pipeline, rollout playbook  

---

## Demo (<1 min)

Covered live: student logs in, plays embedded video, answers checkpoint, progress unlocks next segment, views updated dashboard.
