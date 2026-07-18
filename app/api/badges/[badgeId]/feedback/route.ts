import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { BadgeStatus } from '@prisma/client';

import prisma from '@/lib/prisma';
import { resolveEffectiveBadgePolicy } from '@/lib/badgePolicy';
import { resolveFailAcknowledge } from '@/lib/badgeState';

type RouteContext = {
  params: Promise<{
    badgeId: string;
  }>;
};

function normalizeEmail(email?: string | null) {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

async function getSignedInStudent() {
  const clerkUser = await currentUser();
  const email = normalizeEmail(clerkUser?.emailAddresses?.[0]?.emailAddress);

  if (!email) {
    return null;
  }

  return prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
}

function latestAttemptSelect() {
  return {
    id: true,
    passed: true,
    score: true,
    pointsEarned: true,
    pointsPossible: true,
    feedback: true,
    completedAt: true,
    assessor: {
      select: {
        name: true,
        email: true,
      },
    },
    responses: {
      orderBy: { sortOrder: 'asc' as const },
      select: {
        id: true,
        subgoalText: true,
        taskText: true,
        points: true,
        passed: true,
        feedback: true,
        isOverride: true,
        sortOrder: true,
      },
    },
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const { badgeId } = await context.params;

  if (!badgeId) {
    return NextResponse.json({ error: 'Missing badge id.' }, { status: 400 });
  }

  const student = await getSignedInStudent();

  if (!student) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const studentBadge = await prisma.studentBadge.findUnique({
    where: {
      studentId_badgeId: {
        studentId: student.id,
        badgeId,
      },
    },
    select: {
      id: true,
      status: true,
      score: true,
      awardedAt: true,
      badge: {
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          rubricGoal: {
            select: {
              id: true,
              name: true,
              subgoals: {
                orderBy: { sortOrder: 'asc' },
                select: {
                  id: true,
                  text: true,
                  passThreshold: true,
                  sortOrder: true,
                  tasks: {
                    orderBy: { sortOrder: 'asc' },
                    select: {
                      id: true,
                      text: true,
                      points: true,
                      sortOrder: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!studentBadge) {
    return NextResponse.json({ error: 'Badge enrollment not found.' }, { status: 404 });
  }

  const latestAttempt = await prisma.assessmentAttempt.findFirst({
    where: {
      studentId: student.id,
      badgeId,
    },
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
    select: latestAttemptSelect(),
  });

  return NextResponse.json({
    badge: {
      id: studentBadge.badge.id,
      slug: studentBadge.badge.slug,
      name: studentBadge.badge.name,
      description: studentBadge.badge.description,
      status: studentBadge.status,
      score: studentBadge.score,
      awardedAt: studentBadge.awardedAt?.toISOString() ?? null,
    },
    rubric: studentBadge.badge.rubricGoal
      ? {
          goalId: studentBadge.badge.rubricGoal.id,
          goalName: studentBadge.badge.rubricGoal.name,
          subgoals: studentBadge.badge.rubricGoal.subgoals,
        }
      : null,
    latestAttempt: latestAttempt
      ? {
          id: latestAttempt.id,
          passed: latestAttempt.passed,
          score: latestAttempt.score,
          pointsEarned: latestAttempt.pointsEarned,
          pointsPossible: latestAttempt.pointsPossible,
          feedback: latestAttempt.feedback,
          completedAt: latestAttempt.completedAt?.toISOString() ?? null,
          assessorName: latestAttempt.assessor.name ?? latestAttempt.assessor.email ?? null,
          responses: latestAttempt.responses,
        }
      : null,
  });
}

export async function POST(_request: Request, context: RouteContext) {
  const { badgeId } = await context.params;

  if (!badgeId) {
    return NextResponse.json({ error: 'Missing badge id.' }, { status: 400 });
  }

  const student = await getSignedInStudent();

  if (!student) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const studentBadge = await prisma.studentBadge.findUnique({
    where: {
      studentId_badgeId: {
        studentId: student.id,
        badgeId,
      },
    },
    select: {
      id: true,
      status: true,
      cooldownUntil: true,
      feedbackReviewedAt: true,
      reassessmentLimit: true,
      cooldownDays: true,
      reassessmentRequired: true,
      badge: {
        select: {
          reassessmentLimit: true,
          cooldownDays: true,
          reassessmentRequired: true,
        },
      },
    },
  });

  if (!studentBadge) {
    return NextResponse.json({ error: 'Badge enrollment not found.' }, { status: 404 });
  }

  // Acknowledging a failed attempt is idempotent: once the fail path has already
  // routed the badge to READY_FOR_ASSESSMENT (retry) or LOCKED (terminal), replay
  // the current status instead of erroring.
  if (studentBadge.status === BadgeStatus.READY_FOR_ASSESSMENT || studentBadge.status === BadgeStatus.LOCKED) {
    return NextResponse.json({ status: studentBadge.status }, { status: 200 });
  }

  if (studentBadge.status !== BadgeStatus.IN_REVIEW) {
    return NextResponse.json({ error: 'Badge feedback is not reviewable in its current status.' }, { status: 409 });
  }

  const [latestAttempt, failedAttempts] = await Promise.all([
    prisma.assessmentAttempt.findFirst({
      where: { studentId: student.id, badgeId },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      select: { passed: true },
    }),
    prisma.assessmentAttempt.count({
      where: { studentId: student.id, badgeId, passed: false },
    }),
  ]);

  // The pass path acknowledges + rates through the survey route → COMPLETED; the
  // feedback route only handles the fail path.
  if (latestAttempt?.passed !== false) {
    return NextResponse.json({ error: 'No failed assessment feedback is available to review.' }, { status: 409 });
  }

  const policy = resolveEffectiveBadgePolicy(studentBadge, studentBadge.badge);
  const now = new Date();
  const transition = resolveFailAcknowledge(failedAttempts, policy, now);

  const updated = await prisma.studentBadge.update({
    where: { id: studentBadge.id },
    data: {
      status: transition.status,
      cooldownUntil: transition.cooldownUntil,
      feedbackReviewedAt: studentBadge.feedbackReviewedAt ?? now,
    },
    select: { status: true, cooldownUntil: true },
  });

  return NextResponse.json(
    { status: updated.status, cooldownUntil: updated.cooldownUntil?.toISOString() ?? null },
    { status: 200 }
  );
}
