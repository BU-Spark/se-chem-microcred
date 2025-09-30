#!/bin/bash

# ===== Top-level =====
git add prisma/schema.prisma
git commit -m "feat(db): define User, Course, Section, Skill, RubricItem, Video, QEVQuestion, Quiz, QuizAttempt, SkillAttempt, IssuedBadge models"

git add prisma/migrations
git commit -m "chore(db): initialize migrations folder"

git add middleware.ts
git commit -m "feat(auth): add Clerk middleware to protect app routes"

# ===== Auth pages =====
git add "app/(auth)/sign-in/[[...sign-in]]/page.tsx"
git commit -m "feat(auth): add Clerk sign-in page"

git add "app/(auth)/sign-up/[[...sign-up]]/page.tsx"
git commit -m "feat(auth): add Clerk sign-up page"

# ===== API routes =====
git add app/api/auth/me/route.ts
git commit -m "feat(api): add endpoint for current user sync"

git add app/api/skills/route.ts
git commit -m "feat(api): add endpoint to list/create skills"

git add app/api/skills/[skillId]/route.ts
git commit -m "feat(api): add endpoint to fetch single skill"

git add app/api/content/[skillId]/route.ts
git commit -m "feat(api): add endpoint for skill content (Mux/QEV/quiz)"

git add app/api/quizzes/[quizId]/attempts/route.ts
git commit -m "feat(api): add endpoint to start quiz attempt"

git add app/api/quizzes/attempts/[id]/submit/route.ts
git commit -m "feat(api): add endpoint to submit quiz attempt"

git add app/api/attempts/[skillId]/route.ts
git commit -m "feat(api): add endpoint for attempt history"

git add app/api/progress/[skillId]/route.ts
git commit -m "feat(api): add endpoint for skill progress"

git add app/api/badges/mine/route.ts
git commit -m "feat(api): add endpoint to fetch user badges"

git add app/api/badges/export/[id]/route.ts
git commit -m "feat(api): add endpoint to export badge"

git add app/api/uploads/video/route.ts
git commit -m "feat(api): add Mux direct upload endpoint"

git add app/api/uploads/file/route.ts
git commit -m "feat(api): add S3/GCS signed URL endpoint"

git add app/api/webhooks/mux/route.ts
git commit -m "feat(api): add webhook for Mux events"

git add app/api/webhooks/clerk/route.ts
git commit -m "feat(api): add webhook for Clerk user sync"

# ===== Pages =====
git add app/skills/page.tsx
git commit -m "feat(ui): add skills catalog page"

git add app/skills/[skillId]/page.tsx
git commit -m "feat(ui): add skill detail page"

git add app/badges/page.tsx
git commit -m "feat(ui): add badge wallet page"

git add app/report/page.tsx
git commit -m "feat(ui): add student micro-credential report page"

# ===== Components =====
git add app/components/VideoQEVPlayer
git commit -m "feat(ui): scaffold Mux video player with QEV"

git add app/components/QEVOverlay
git commit -m "feat(ui): scaffold QEV overlay component"

git add app/components/QuizPanel
git commit -m "feat(ui): scaffold quiz panel component"

git add app/components/RubricPanel
git commit -m "feat(ui): scaffold rubric panel component"

git add app/components/AttemptTimeline
git commit -m "feat(ui): scaffold attempt timeline component"

git add app/components/ProgressWidgets
git commit -m "feat(ui): scaffold progress widget components"

git add app/components/ProgressCharts
git commit -m "feat(ui): scaffold progress chart component (Recharts)"

# ===== Hooks =====
git add app/hooks/useSkills.ts
git commit -m "feat(hooks): add hook to fetch skills + status"

git add app/hooks/useQEV.ts
git commit -m "feat(hooks): add hook for QEV cue logic"

git add app/hooks/useQuiz.ts
git commit -m "feat(hooks): add hook for quiz lifecycle"

git add app/hooks/useBadges.ts
git commit -m "feat(hooks): add hook to fetch user badges"

git add app/hooks/useAuth.ts
git commit -m "feat(hooks): add wrapper hook for Clerk auth"

# ===== Utils =====
git add app/utils/apiClient.ts
git commit -m "feat(utils): add API client with Clerk auth headers"

git add app/utils/db.ts
git commit -m "feat(utils): add Prisma client singleton"

git add app/utils/mux.ts
git commit -m "feat(utils): add Mux helper functions"

git add app/utils/storage.ts
git commit -m "feat(utils): add S3/GCS storage helper"

git add app/utils/email.ts
git commit -m "feat(utils): add Resend email helper"

git add app/utils/qev.utils.ts
git commit -m "feat(utils): add QEV timing/lock helpers"

git add app/utils/progress.utils.ts
git commit -m "feat(utils): add progress status calculation helpers"

# ===== Types =====
git add app/types/qev.types.ts
git commit -m "feat(types): add types for QEV"

git add app/types/skill.types.ts
git commit -m "feat(types): add types for skills"

git add app/types/quiz.types.ts
git commit -m "feat(types): add types for quizzes"

git add app/types/badge.types.ts
git commit -m "feat(types): add types for badges"

# ===== Assets =====
git add public/badges
git commit -m "feat(assets): add badge icon assets"

# ===== Push everything =====
git push
