import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { normalizeEmail } from '@/lib/text/email';

import { fetchUserByEmail } from '@/app/api/courses/lib/course-queries';
import prisma from '@/lib/prisma';

function normalizeId(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// MVP test-cleanup tool — delete a badge the signed-in user created. Deleting any
// badge in a "family" (a source catalog badge + its course copies) removes the
// whole family the user owns, so a test badge fully disappears. REMOVE BEFORE HANDOFF.
export async function DELETE(req: NextRequest, context: { params: Promise<{ badgeId: string }> }) {
  try {
    void req;
    const clerkUser = await currentUser();
    const email = normalizeEmail(clerkUser?.emailAddresses?.[0]?.emailAddress);
    const { badgeId: rawBadgeId } = await context.params;
    const badgeId = normalizeId(rawBadgeId);

    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!badgeId) {
      return NextResponse.json({ error: 'Badge id is required' }, { status: 400 });
    }

    const user = await fetchUserByEmail(email);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const target = await prisma.badge.findFirst({
      where: { id: badgeId, createdById: user.id },
      select: { id: true, sourceBadgeId: true },
    });

    if (!target) {
      return NextResponse.json({ error: 'Badge not found or you are not its creator.' }, { status: 404 });
    }

    // Resolve the family root, then collect every badge in it the user owns.
    const rootId = target.sourceBadgeId ?? target.id;
    const family = await prisma.badge.findMany({
      where: { createdById: user.id, OR: [{ id: rootId }, { sourceBadgeId: rootId }, { id: target.id }] },
      select: { id: true },
    });
    const badgeIds = family.map((badge) => badge.id);

    const prompts = await prisma.surveyPrompt.findMany({
      where: { badgeId: { in: badgeIds } },
      select: { id: true },
    });
    const promptIds = prompts.map((prompt) => prompt.id);

    // Children first, parents last. AssessmentTaskResponse cascades with its
    // attempt (task FK is SetNull) and RubricSubgoal/RubricTask cascade with the
    // goal; SurveyPrompt/Message badge FKs are optional but removed explicitly.
    await prisma.$transaction([
      prisma.assessmentAttempt.deleteMany({ where: { badgeId: { in: badgeIds } } }),
      prisma.rubricGoal.deleteMany({ where: { badgeId: { in: badgeIds } } }),
      prisma.studentBadge.deleteMany({ where: { badgeId: { in: badgeIds } } }),
      prisma.badgeRequirement.deleteMany({ where: { badgeId: { in: badgeIds } } }),
      prisma.surveyResponse.deleteMany({ where: { promptId: { in: promptIds } } }),
      prisma.surveyPrompt.deleteMany({ where: { badgeId: { in: badgeIds } } }),
      prisma.message.deleteMany({ where: { badgeId: { in: badgeIds } } }),
      prisma.badge.deleteMany({ where: { id: { in: badgeIds } } }),
    ]);

    return NextResponse.json({ deleted: badgeIds.length }, { status: 200 });
  } catch (error) {
    console.error('DELETE /api/badges/[badgeId] failed:', error);

    return NextResponse.json({ error: 'Failed to delete badge' }, { status: 500 });
  }
}
