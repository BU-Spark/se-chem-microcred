import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { BadgeStatus } from '@prisma/client';
import { normalizeEmail } from '@/lib/text/email';

import prisma from '@/lib/prisma';

type RouteContext = {
  params: Promise<{
    badgeId: string;
  }>;
};

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
    },
  });

  if (!studentBadge) {
    return NextResponse.json({ error: 'Badge enrollment not found.' }, { status: 404 });
  }

  if (studentBadge.status === BadgeStatus.READY_FOR_ASSESSMENT) {
    return NextResponse.json({ status: studentBadge.status }, { status: 200 });
  }

  if (studentBadge.status !== BadgeStatus.LEARNING) {
    return NextResponse.json({ error: 'Badge feedback is not reviewable in its current status.' }, { status: 409 });
  }

  const latestAttempt = await prisma.assessmentAttempt.findFirst({
    where: {
      studentId: student.id,
      badgeId,
    },
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
    select: { passed: true },
  });

  if (latestAttempt?.passed !== false) {
    return NextResponse.json({ error: 'No failed assessment feedback is available to review.' }, { status: 409 });
  }

  const updated = await prisma.studentBadge.update({
    where: { id: studentBadge.id },
    data: { status: BadgeStatus.READY_FOR_ASSESSMENT },
    select: { status: true },
  });

  return NextResponse.json({ status: updated.status }, { status: 200 });
}
