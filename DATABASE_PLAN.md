# Database Plan

## Goals & Assumptions
- Persist student-facing micro-credential data beyond the current localStorage demo.
- Align with a future Clerk (or similar) auth provider while keeping Prisma as the system of record.
- Support lessons, assessments, badge awards, and analytics dashboards with auditable history.
- Optimize for multi-tenant friendly design (one institution per deployment) but leave room for future multi-org support.
- Prefer soft deletes (`deletedAt`) over hard deletes to enable recovery and analytics.

## High-Level Domain Model
- `User` represents authenticated people (students, instructors, admins).
- `StudentProfile` stores learner-specific data and preferences.
- `MicroCredential` groups modules, lessons, and badge requirements.
- `Module` (a.k.a. learning path section) orders lessons within a credential.
- `Lesson` holds metadata for learning objects and links to content delivery systems.
- `LessonAttempt` tracks learner progress and completion states.
- `Assessment` + `AssessmentQuestion` + `AssessmentResponse` capture evaluated work.
- `Enrollment` connects students to micro-credentials and aggregates progress stats.
- `Badge` + `BadgeRequirement` + `BadgeAward` track credentialing outcomes.
- `ProgressEvent` records granular timeline events for analytics / auditing.

## Entity Reference

### `User`
- `id` (`String`, cuid) primary key.
- `email` unique, lower-cased in application layer.
- `name`, `role` (`STUDENT` | `INSTRUCTOR` | `ADMIN`), `status` (`ACTIVE` | `INVITED` | `DISABLED`).
- `clerkId` (or external provider id) nullable but indexed for SSO.
- Relationships: `studentProfile?`, `enrollments`, `createdBadges`, `createdLessons` (ownership metadata).
- Indexes: `@@index([role])`, `@@index([status])`, `@@unique([clerkId])`.

### `StudentProfile`
- `userId` unique FK to `User`.
- Optional demographic data (`institutionId`, `major`, `graduationYear`).
- Preferences (`timezone`, `notificationOptIn`, `avatarUrl`).
- Relationships: `lessonAttempts`, `assessmentResponses`, `badgeAwards`.

### `MicroCredential`
- Core program entity with `title`, `slug`, `summary`, `estimatedDurationMinutes`, `level` (`BEGINNER` | `INTERMEDIATE` | `ADVANCED`).
- Flags: `isPublished`, `publishedAt`, `archivedAt`.
- Relationships: `modules`, `enrollments`, `badges`, `createdBy` (`User`).
- Indexes: `@@unique([slug])`, `@@index([isPublished, archivedAt])`.

### `Module`
- Ordered grouping of lessons within a micro-credential.
- Fields: `title`, `order`, `description`, `microCredentialId`.
- Relationship: `lessons`.
- Indexes: `@@index([microCredentialId, order])`.

### `Lesson`
- Metadata (`title`, `slug`, `summary`, `durationMinutes`, `status` (`DRAFT` | `REVIEW` | `PUBLISHED` | `ARCHIVED`)).
- Content references: `contentUrl`, `contentType` (markdown, video, external tool).
- Foreign keys: `moduleId`, `createdById` (`User`).
- Relationships: `assessments`, `lessonAttempts`.
- Indexes: `@@unique([slug])`, `@@index([status])`.

### `LessonAttempt`
- Tracks learner-state per lesson: `status` (`NOT_STARTED` | `IN_PROGRESS` | `COMPLETED`), `progressPercent`, `startedAt`, `completedAt`.
- Foreign keys: `lessonId`, `studentProfileId`, `enrollmentId`.
- Indexes: `@@unique([lessonId, studentProfileId])` for deduping.

### `Assessment`
- Types: `QUIZ`, `PRACTICAL`, `REFLECTION`.
- Fields: `title`, `description`, `passingScore`, `retryLimit`, `isAutoGraded`.
- FKs: `lessonId`, `createdById`.
- Relationships: `questions`, `submissions`.

### `AssessmentQuestion`
- `questionType` (`MULTIPLE_CHOICE`, `MULTI_SELECT`, `SHORT_ANSWER`, `RICH_TEXT`).
- Fields: `prompt`, `order`, `points`, `metadata` (JSON for rubric, choices, etc.).
- Relationship: `options` (for choice-based questions).

### `QuestionOption`
- Fields: `label`, `value`, `isCorrect`, `order`.
- FK: `assessmentQuestionId`.

### `AssessmentSubmission`
- Represents a learner attempt at an assessment.
- Fields: `status` (`IN_PROGRESS`, `SUBMITTED`, `GRADED`), `score`, `passed`, `gradedAt`, `gradedById`.
- FKs: `assessmentId`, `lessonAttemptId`, `studentProfileId`.
- Relationship: `responses`.
- Indexes: `@@index([studentProfileId, assessmentId])`.

### `AssessmentResponse`
- Stores learner answers per question.
- Fields: `answer` (JSON), `scoreAwarded`, `feedback`.
- FKs: `assessmentSubmissionId`, `assessmentQuestionId`.

### `Enrollment`
- Connects `User` (student) to `MicroCredential`.
- Fields: `status` (`ACTIVE`, `COMPLETED`, `WITHDRAWN`), `startedAt`, `completedAt`, `progressPercent`.
- FKs: `studentId` (`User`), `microCredentialId`.
- Relationships: `lessonAttempts`, `assessmentSubmissions`, `progressEvents`.
- Indexes: `@@unique([studentId, microCredentialId])`.

### `Badge`
- Metadata: `name`, `slug`, `description`, `imageUrl`, `awardedBy` (`User`), `microCredentialId` (nullable for global badges).
- Indexes: `@@unique([slug])`.

### `BadgeRequirement`
- Types: `COMPLETE_LESSONS`, `PASS_ASSESSMENT`, `ACHIEVE_SCORE`, `MANUAL_REVIEW`.
- Fields: `config` (JSON for thresholds/lesson ids), `order`.
- FKs: `badgeId`.

### `BadgeAward`
- Links a badge to a `StudentProfile`.
- Fields: `awardedAt`, `awardedById`, `evidenceUrl`, `notes`.
- Index: `@@unique([badgeId, studentProfileId])`.

### `ProgressEvent`
- Append-only log for analytics (`eventType`, `payload` JSON, `occurredAt`).
- FKs: `enrollmentId`, `lessonId?`, `assessmentId?`.
- Indexes: `@@index([eventType, occurredAt])`.

### Supporting Tables (optional, planned for later)
- `Institution` and `Cohort` for multi-institution deployments.
- `ResourceLink` for attaching supplemental files/links to lessons or modules.
- `Announcement` for in-app alerts.

## Relationship Diagram (textual)
```
User 1---1 StudentProfile
User 1---* Enrollment *---1 MicroCredential 1---* Module 1---* Lesson 1---* Assessment 1---* AssessmentQuestion 1---* QuestionOption
StudentProfile 1---* LessonAttempt *---1 Lesson
LessonAttempt 1---* AssessmentSubmission 1---* AssessmentResponse
MicroCredential 1---* Badge 1---* BadgeRequirement
StudentProfile 1---* BadgeAward *---1 Badge
Enrollment 1---* ProgressEvent
```

## Prisma Schema Notes
- Use Prisma `enum` blocks for roles, statuses, and types listed above.
- Enable `@@map` only if legacy table names ever diverge; default naming works for new project.
- Example model pattern:

```prisma
model LessonAttempt {
  id               String           @id @default(cuid())
  status           AttemptStatus    @default(NOT_STARTED)
  progressPercent  Int              @default(0)
  startedAt        DateTime?
  completedAt      DateTime?
  lesson           Lesson           @relation(fields: [lessonId], references: [id])
  lessonId         String
  studentProfile   StudentProfile   @relation(fields: [studentProfileId], references: [id])
  studentProfileId String
  enrollment       Enrollment       @relation(fields: [enrollmentId], references: [id])
  enrollmentId     String
  submissions      AssessmentSubmission[]
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt
  deletedAt        DateTime?

  @@unique([lessonId, studentProfileId])
  @@index([enrollmentId])
}
```

- Add `createdAt`, `updatedAt`, `deletedAt?` to all primary models for consistency.
- Store rich text or structured content in external CMS (sanity, markdown) and reference via URLs/IDs.

## Lifecycle & Data Flows
- **Enrollment creation:** admin or auto-enroll inserts `Enrollment`, seeds `LessonAttempt` rows (status `NOT_STARTED`).
- **Progress updates:** lesson completion updates `LessonAttempt` and `Enrollment.progressPercent`; also append `ProgressEvent`.
- **Assessment grading:** `AssessmentSubmission` created on learner submit; auto-graded results set `score` and `passed`; manual grading uses `gradedById`.
- **Badge evaluation:** background job evaluates `BadgeRequirement` rules per enrollment and issues `BadgeAward`.
- **Analytics:** dashboards aggregate from `LessonAttempt`, `AssessmentSubmission`, and `ProgressEvent` views.

## Indexing & Performance
- Composite indexes on foreign keys (`lessonId`, `studentProfileId`, etc.) to support feed queries.
- Partial indexes (supported via raw SQL in Prisma) can enforce uniqueness on non-deleted rows if soft delete becomes prevalent.
- Consider materialized views (managed outside Prisma) for heavy analytics; Prisma can expose them via `@@ignore` + raw SQL.

## Migration & Seeding Strategy
- Initialize Prisma with `npx prisma init`, target PostgreSQL in `.env` (`DATABASE_URL`).
- Write migration scripts using `prisma migrate dev` for local and `prisma migrate deploy` for production.
- Seed script (`prisma/seed.ts`) should:
  - Create demo admin/instructor accounts.
  - Insert sample micro-credential, modules, lessons, assessments, and badges mirroring current UI copy.
  - Generate a demo student enrollment with partially completed attempts for dashboard previews.
- Maintain test fixtures using Prisma client in Jest setup for integration tests.

## Operational Considerations
- Enforce referential integrity (Postgres default) to avoid orphaned attempts or submissions.
- Add row-level auditing via `ProgressEvent` and optional `AuditLog` table for admin operations.
- Use database-backed sessions/token tables if Clerk is replaced; otherwise rely on Clerk's webhooks to sync `User` records.
- Keep personally identifiable information minimal; store sensitive metadata in encrypted columns if required by institution.

## Next Steps
- Translate this plan into a Prisma schema (`prisma/schema.prisma`) and generate the client.
- Plug `useAuth` into real `User` + `Enrollment` records once backend endpoints exist.
- Implement service layer functions for enrollment, progress updates, and badge evaluation using Prisma Client.
- Backfill analytics dashboards using aggregated queries or dedicated views built on the proposed tables.
