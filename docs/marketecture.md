# ChemSkills Micro-Credential Demo – Marketecture Overview

## 1. Solution Purpose
ChemSkills is a demo experience for Boston University’s chemistry micro-credential initiative. It showcases how a learner progresses from enrollment through lesson consumption and badge attainment in a unified web application. The goal of the demo is to communicate the end-to-end value proposition to academic stakeholders, instructional designers, and potential implementation partners before a production deployment is funded.

## 2. Target Personas and Value
- **Undergraduate student** – Receives a guided lesson queue, checkpointed video experiences, and a badge wallet that communicates real-time credential status. The benefit is clarity around what to do next and evidence of mastery that is portable outside the classroom.
- **Faculty / course coordinator** – Gains confidence that the platform can surface analytics (hours spent, question performance) and provide course-aligned badge pathways without standing up a full LMS replacement.
- **Instructional designer / lab manager** – Sees how lesson segments, checkpoints, rubric feedback, and survey prompts can be programmed into a structured learning path with lightweight content management.
- **Program administrator** – Evaluates how badge completions, survey responses, and student attributes can roll up into program-level dashboards and accreditation reporting.

## 3. Experience Summary
1. **Entry & account simulation** – The demo uses a client-side auth hook to mimic future account management (currently Clerk). Visitors sign into a seeded “Student Demo” profile and are dropped on a dashboard.
2. **Student dashboard** – Displays “Up next” and “Pick up where you left off” cards driven by lesson status. Side navigation routes to profile, analytics, badge wallet, grades, and settings stubs.
3. **Lesson detail + video** – Each lesson is broken into segments with time-coded checkpoints. The video player integrates with YouTube and layers in-progress questions, a rubric drawer, and progress tracking to illustrate checkpointed mastery.
4. **Badge wallet and analytics** – Badge cards communicate earning status (learning, ready for assessment, completed) while analytics summarize engagement hours, question counts, and performance.
5. **Surveys and feedback** – Survey prompts seeded from Prisma show how post-lesson/badge reflections can close the learning loop.

The current demo includes mocked interactions for upload flows, mux webhooks, and badge attempts; these are documented to communicate eventual integrations.

## 4. Differentiating Capabilities
- **Checkpointed video learning** – Time-coded checkpoints tie questions and rubrics directly to video segments, giving faculty a way to verify student comprehension asynchronously.
- **Micro-credential focus** – The application centers on skill badges, demonstrating how badge requirements map to lessons and how students see readiness status at a glance.
- **Integrated analytics** – Engagement metrics, question banks, and lesson progression are unified from the same data model, enabling shared dashboards for students and staff.
- **Composable program architecture** – Next.js App Router, Prisma models, and API routes make it straightforward to replace mocked services with production integrations (Clerk for auth, Mux for media, BU SIS for enrollment).
- **Low-friction adoption** – Seed data and local storage auth allow non-technical stakeholders to demo the experience without infrastructure setup.

## 5. Conceptual System Landscape
- **Experience layer** – React 19 + Next.js 15 App Router client components render dashboard, lessons, and badge views. Styling relies on CSS modules with global tokens.
- **Engagement services** – Local hooks (`useAuth`, `useStudentData`) handle sign-in and data retrieval. Future versions will swap these for production services (Clerk, REST/GraphQL APIs).
- **Learning content service** – `/api/demo/student` aggregates lessons, badges, analytics, and survey prompts via Prisma. The data mirrors what a future Student Information System and content authoring tool will provide.
- **Credential services (future)** – Placeholder endpoints exist for skill attempt logging, progress updates, file uploads, and webhooks. These communicate how badge workflows will evolve once real services (Mux, assessment graders, LMS exports) are integrated.
- **Data platform** – Prisma orchestrates a Postgres schema managed through migrations and seeding. It unifies student demographics, enrollments, lesson structures, checkpoints, survey prompts, and badge requirements.

## 6. Message Pillars for Stakeholder Communication
- **Student-first clarity** – Personalized dashboards, branded UI, and in-line checkpoints motivate students and reduce ambiguity around lab prep.
- **Faculty control** – Segmented lessons, question banks, and rubric-ready checkpoints let instructors tailor micro-credentials without custom development for each cohort.
- **Program insight** – Embedded analytics, badge readiness indicators, and survey pipelines give administrators real-time quality markers to inform interventions and accreditation artifacts.
- **Launch-ready foundation** – The stack mirrors what a production deployment would use (Next.js, Prisma, Clerk, Mux), so the demo’s investment carries forward.

## 7. Roadmap Signals
Short-term focus is replacing mocks with live services (Clerk auth, Mux uploads, assessment grading) and expanding dashboard views for advisors/instructors. Mid-term goals include role-based access, automated badge issuance, and integrations with BU data exports. Long-term vision extends to multi-course pathways, employer-facing credential verification, and AI-driven study recommendations.
