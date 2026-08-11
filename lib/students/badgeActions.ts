// Instructor-only "student actions" on one student's badge: reset progress, waive
// the QEV requirement, and record a grade outside a normal assessment.
//
// The rules and the write order live here rather than in the route so the route
// stays a thin dispatcher, matching lib/badgeState.ts. Every executor takes a
// transaction client — all three are multi-table writes that must not half-apply.
//
// See docs/student-actions-plan.md.

import { BadgeStatus, Prisma } from '@prisma/client';

type ActionClient = Prisma.TransactionClient;

// Snapshot text for the override's AssessmentTaskResponse row. Existing checker
// overrides carry 'Checker override' in the same columns, so the two stay
// distinguishable in attempt history without a schema change.
export const INSTRUCTOR_OVERRIDE_LABEL = 'Instructor override';

export type StudentBadgeActionPayload =
  | { action: 'RESET_PROGRESS'; confirmBadgeName: string; acknowledgeSharedBadges: boolean }
  | { action: 'WAIVE_QEV' }
  | { action: 'OVERRIDE_GRADE'; passed: boolean; reason: string };

/**
 * Pull a student action out of a PATCH body.
 *
 * Returns `null` when the body carries no `action` at all, which is how the route
 * tells a student action apart from an ordinary config edit (reassessment limit,
 * cooldown override) on the same endpoint.
 */
export function parseStudentBadgeAction(
  value: unknown
): { payload: StudentBadgeActionPayload } | { error: string } | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const body = value as {
    action?: unknown;
    confirmBadgeName?: unknown;
    acknowledgeSharedBadges?: unknown;
    passed?: unknown;
    reason?: unknown;
  };

  if (body.action === undefined || body.action === null) {
    return null;
  }

  if (typeof body.action !== 'string') {
    return { error: 'Unknown student action.' };
  }

  switch (body.action) {
    case 'RESET_PROGRESS': {
      const confirmBadgeName = typeof body.confirmBadgeName === 'string' ? body.confirmBadgeName.trim() : '';

      if (!confirmBadgeName) {
        return { error: 'Resetting progress requires the badge name as confirmation.' };
      }

      return {
        payload: {
          action: 'RESET_PROGRESS',
          confirmBadgeName,
          acknowledgeSharedBadges: body.acknowledgeSharedBadges === true,
        },
      };
    }

    case 'WAIVE_QEV':
      return { payload: { action: 'WAIVE_QEV' } };

    case 'OVERRIDE_GRADE': {
      if (typeof body.passed !== 'boolean') {
        return { error: 'An override must record either proficient or still learning.' };
      }

      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

      if (!reason) {
        return { error: 'Overriding a grade requires a written reason.' };
      }

      return { payload: { action: 'OVERRIDE_GRADE', passed: body.passed, reason } };
    }

    default:
      return { error: 'Unknown student action.' };
  }
}

/** The lessons a badge requires, which is the blast radius of a progress reset. */
export async function fetchBadgeRequirementLessons(client: ActionClient, badgeId: string) {
  const requirements = await client.badgeRequirement.findMany({
    where: { badgeId, lessonId: { not: null } },
    select: { lesson: { select: { id: true, title: true } } },
  });

  const byId = new Map<string, { id: string; title: string }>();
  for (const requirement of requirements) {
    if (requirement.lesson) {
      byId.set(requirement.lesson.id, requirement.lesson);
    }
  }

  return [...byId.values()];
}

/**
 * Other badges that require any of these lessons.
 *
 * BadgeRequirement is many-to-many, so nothing in the schema stops one lesson
 * backing two badges — and a reset deletes lesson progress, which would silently
 * knock the second badge out of readiness. Course content is authored one lesson
 * per badge today, so this is expected to return nothing; the route makes the
 * instructor acknowledge it on the rare occasion it doesn't.
 */
export async function findBadgesSharingLessons(
  client: ActionClient,
  { badgeId, lessonIds }: { badgeId: string; lessonIds: string[] }
) {
  if (lessonIds.length === 0) {
    return [];
  }

  const requirements = await client.badgeRequirement.findMany({
    where: { lessonId: { in: lessonIds }, badgeId: { not: badgeId } },
    select: { badge: { select: { id: true, name: true } } },
  });

  const byId = new Map<string, { id: string; name: string }>();
  for (const requirement of requirements) {
    byId.set(requirement.badge.id, requirement.badge);
  }

  return [...byId.values()];
}

/**
 * Delete every trace of this student's work on this badge, then return the badge
 * row to LEARNING.
 *
 * The StudentBadge row is reset in place, never deleted: deleting it is the
 * badge-unassign failure mode, which FK-cascades through the student's history.
 *
 * Deleting the assessment attempts is what makes the reset stick.
 * syncLessonBadgesForStudent refuses to re-promote a badge whose latest attempt
 * failed, so leaving attempts behind would strand the badge at LEARNING forever.
 *
 * Per-student policy overrides (reassessmentLimit, cooldownDays,
 * reassessmentRequired) deliberately survive — they are instructor policy, not
 * student progress, and re-granting them after every reset would be busywork.
 */
export async function resetBadgeProgress(
  client: ActionClient,
  {
    studentBadgeId,
    studentId,
    badgeId,
    lessonIds,
  }: { studentBadgeId: string; studentId: string; badgeId: string; lessonIds: string[] }
) {
  // AssessmentTaskResponse cascades from its attempt; the lesson-side rows do not
  // cascade, so they are deleted children-first.
  const { count: assessmentAttemptsDeleted } = await client.assessmentAttempt.deleteMany({
    where: { studentId, badgeId },
  });

  if (lessonIds.length > 0) {
    await client.checkpointResponse.deleteMany({
      where: { studentId, checkpoint: { lessonId: { in: lessonIds } } },
    });
    await client.checkpointAttempt.deleteMany({
      where: { userId: studentId, checkpoint: { lessonId: { in: lessonIds } } },
    });
    await client.lessonAttempt.deleteMany({
      where: { studentId, lessonId: { in: lessonIds } },
    });
    await client.segmentProgress.deleteMany({
      where: { lessonProgress: { studentId, lessonId: { in: lessonIds } } },
    });
    await client.lessonProgress.deleteMany({
      where: { studentId, lessonId: { in: lessonIds } },
    });
  }

  const badgeProgress = await client.studentBadge.update({
    where: { id: studentBadgeId },
    data: {
      status: BadgeStatus.LEARNING,
      score: null,
      awardedAt: null,
      qevPassedAt: null,
      qevWaivedAt: null,
      qevWaivedById: null,
      cooldownUntil: null,
      feedbackReviewedAt: null,
      gradeOverriddenAt: null,
      gradeOverriddenById: null,
    },
    select: { status: true },
  });

  return { status: badgeProgress.status, assessmentAttemptsDeleted, lessonsReset: lessonIds.length };
}

/**
 * Let the student sit the in-person assessment without finishing the video lesson.
 *
 * Lesson progress is deliberately untouched: writing LessonProgress rows the
 * student never earned would corrupt the very QEV analytics the completion figures
 * exist to report. The waiver is recorded instead and surfaced in the UI, so an
 * assessment that unlocked without a finished lesson explains itself.
 */
export async function waiveQevRequirement(
  client: ActionClient,
  { studentBadgeId, instructorId, now = new Date() }: { studentBadgeId: string; instructorId: string; now?: Date }
) {
  return client.studentBadge.update({
    where: { id: studentBadgeId },
    data: {
      status: BadgeStatus.READY_FOR_ASSESSMENT,
      qevPassedAt: now,
      qevWaivedAt: now,
      qevWaivedById: instructorId,
    },
    select: { status: true, qevWaivedAt: true },
  });
}

/**
 * Record a proficient / still-learning result outside a normal assessment.
 *
 * Written as a new AssessmentAttempt rather than an edit of an existing one, so
 * attempt history stays append-only and every grade keeps its author, timestamp
 * and reason.
 *
 * The score is 100 or 0: no rubric was scored, and the isOverride response row plus
 * the mandatory reason keep it legible as a decision rather than a measurement.
 *
 * A pass lands on COMPLETED immediately, skipping the usual
 * IN_REVIEW → student-acknowledges → COMPLETED route — the instructor's decision is
 * final and the badge should be earned when they close the modal.
 *
 * A fail returns the student to READY_FOR_ASSESSMENT with the cooldown cleared, and
 * deliberately does not run resolveFailAcknowledge: an instructor correcting a
 * record by hand is not the student burning a reassessment, and must not be able to
 * accidentally spend their budget or lock them out.
 */
export async function overrideAssessmentGrade(
  client: ActionClient,
  {
    studentBadgeId,
    courseId,
    studentId,
    badgeId,
    instructorId,
    passed,
    reason,
    now = new Date(),
  }: {
    studentBadgeId: string;
    courseId: string;
    studentId: string;
    badgeId: string;
    instructorId: string;
    passed: boolean;
    reason: string;
    now?: Date;
  }
) {
  const score = passed ? 100 : 0;

  const attempt = await client.assessmentAttempt.create({
    data: {
      courseId,
      badgeId,
      studentId,
      checkerId: instructorId,
      passed,
      score,
      // No rubric was scored, so there are no points to report.
      pointsEarned: null,
      pointsPossible: null,
      feedback: reason,
      completedAt: now,
      responses: {
        create: {
          taskId: null,
          subgoalText: INSTRUCTOR_OVERRIDE_LABEL,
          taskText: INSTRUCTOR_OVERRIDE_LABEL,
          points: 0,
          passed,
          feedback: reason,
          isOverride: true,
          sortOrder: 0,
        },
      },
    },
    select: { id: true, passed: true, score: true, completedAt: true },
  });

  const badgeProgress = await client.studentBadge.update({
    where: { id: studentBadgeId },
    data: {
      status: passed ? BadgeStatus.COMPLETED : BadgeStatus.READY_FOR_ASSESSMENT,
      score,
      awardedAt: passed ? now : null,
      cooldownUntil: null,
      // The override bypasses the acknowledge flow entirely, so stamp the review to
      // stop the student being prompted about feedback on a settled decision.
      feedbackReviewedAt: now,
      gradeOverriddenAt: now,
      gradeOverriddenById: instructorId,
    },
    select: { status: true },
  });

  return { attempt, status: badgeProgress.status };
}
