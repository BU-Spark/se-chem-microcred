import { BadgeStatus, LessonStatus, Prisma } from '@prisma/client';

type BadgeProgressClient = Prisma.TransactionClient;

type SyncLessonBadgesResult = {
  readyForAssessment: boolean;
};

type BadgeWithRequirements = {
  id: string;
  requirements: Array<{ lessonId: string | null }>;
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function isBadgeReadyForAssessment(tx: BadgeProgressClient, studentId: string, badge: BadgeWithRequirements) {
  const requirementLessonIds = uniqueStrings(badge.requirements.map((requirement) => requirement.lessonId));

  if (requirementLessonIds.length === 0) {
    return false;
  }

  const lessonProgresses = await tx.lessonProgress.findMany({
    where: { studentId, lessonId: { in: requirementLessonIds } },
    select: { lessonId: true, status: true, percentComplete: true, lastGradePassed: true },
  });

  const progressByLessonId = new Map(lessonProgresses.map((progress) => [progress.lessonId, progress]));

  // QEV is cleared when every required lesson is COMPLETED with a passing grade.
  // There is no longer a lesson-survey gate — finishing the checkpoints + passing
  // the grade is the whole bar.
  return requirementLessonIds.every((lessonId) => {
    const progress = progressByLessonId.get(lessonId);
    const lessonComplete = progress?.status === LessonStatus.COMPLETED || (progress?.percentComplete ?? 0) >= 100;
    return lessonComplete && progress?.lastGradePassed === true;
  });
}

async function latestAssessmentFailed(tx: BadgeProgressClient, studentId: string, badgeId: string) {
  const latestAttempt = await tx.assessmentAttempt.findFirst({
    where: { studentId, badgeId },
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
    select: { passed: true },
  });

  return latestAttempt?.passed === false;
}

export async function syncLessonBadgesForStudent(
  tx: BadgeProgressClient,
  {
    studentId,
    lessonId,
  }: {
    studentId: string;
    lessonId: string;
  }
): Promise<SyncLessonBadgesResult> {
  const badgeRequirements = await tx.badgeRequirement.findMany({
    where: { lessonId },
    select: {
      badge: {
        select: {
          id: true,
          requirements: {
            select: { lessonId: true },
          },
        },
      },
    },
  });

  const badgesById = new Map<string, BadgeWithRequirements>();
  for (const requirement of badgeRequirements) {
    badgesById.set(requirement.badge.id, requirement.badge);
  }

  let readyForAssessment = false;

  for (const badge of badgesById.values()) {
    const studentBadge = await tx.studentBadge.upsert({
      where: {
        studentId_badgeId: {
          studentId,
          badgeId: badge.id,
        },
      },
      create: {
        studentId,
        badgeId: badge.id,
        status: BadgeStatus.LEARNING,
      },
      update: {},
    });

    if (studentBadge.status !== BadgeStatus.LEARNING) {
      continue;
    }

    if (await latestAssessmentFailed(tx, studentId, badge.id)) {
      continue;
    }

    const isReady = await isBadgeReadyForAssessment(tx, studentId, badge);

    if (!isReady) {
      continue;
    }

    // QEV is cleared: leave LEARNING for READY_FOR_ASSESSMENT and stamp the
    // milestone. qevPassedAt is what makes the badge status honest under Model B —
    // from here on the status means something, and a later failed assessment keeps
    // the student at READY_FOR_ASSESSMENT rather than lying with LEARNING.
    await tx.studentBadge.update({
      where: { id: studentBadge.id },
      data: {
        status: BadgeStatus.READY_FOR_ASSESSMENT,
        qevPassedAt: studentBadge.qevPassedAt ?? new Date(),
      },
    });
    readyForAssessment = true;
  }

  return { readyForAssessment };
}
