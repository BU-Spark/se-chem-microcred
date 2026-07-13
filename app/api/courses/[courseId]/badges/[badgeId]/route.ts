import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

import { fetchUserByEmail } from '@/app/api/courses/lib/course-queries';
import prisma from '@/lib/prisma';
import { normalizeEmail } from '@/lib/text/email';

function normalizeId(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Unassign a badge from a course: removes the course's copy of the badge (the
// clone created on import) and the lesson/content it brought with it, but leaves
// the source catalog badge intact so it can be re-assigned later. Scoped to the
// signed-in course creator and to lessons belonging to this course.
export async function DELETE(req: NextRequest, context: { params: Promise<{ courseId: string; badgeId: string }> }) {
  try {
    void req;
    const clerkUser = await currentUser();
    const email = normalizeEmail(clerkUser?.emailAddresses?.[0]?.emailAddress);
    const { courseId: rawCourseId, badgeId: rawBadgeId } = await context.params;
    const courseId = normalizeId(rawCourseId);
    const badgeId = normalizeId(rawBadgeId);

    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!courseId) {
      return NextResponse.json({ error: 'Course id is required' }, { status: 400 });
    }

    if (!badgeId) {
      return NextResponse.json({ error: 'Badge id is required' }, { status: 400 });
    }

    const user = await fetchUserByEmail(email);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Only the course creator may unassign, and only their own course.
    const course = await prisma.course.findFirst({
      where: { id: courseId, createdById: user.id },
      select: { id: true },
    });

    if (!course) {
      return NextResponse.json({ error: 'Course not found or you are not its creator.' }, { status: 404 });
    }

    // The badge must be assigned to this course (linked to one of its lessons).
    const requirements = await prisma.badgeRequirement.findMany({
      where: { badgeId, lesson: { courseId } },
      select: { lessonId: true },
    });

    if (requirements.length === 0) {
      return NextResponse.json({ error: 'Badge is not assigned to this course.' }, { status: 404 });
    }

    const lessonIds = requirements
      .map((requirement) => requirement.lessonId)
      .filter((lessonId): lessonId is string => Boolean(lessonId));

    const [segments, checkpoints, surveyPrompts] = await Promise.all([
      prisma.lessonSegment.findMany({ where: { lessonId: { in: lessonIds } }, select: { id: true } }),
      prisma.lessonCheckpoint.findMany({ where: { lessonId: { in: lessonIds } }, select: { id: true } }),
      prisma.surveyPrompt.findMany({
        where: { OR: [{ lessonId: { in: lessonIds } }, { badgeId }] },
        select: { id: true },
      }),
    ]);
    const segmentIds = segments.map((segment) => segment.id);
    const checkpointIds = checkpoints.map((checkpoint) => checkpoint.id);
    const surveyPromptIds = surveyPrompts.map((prompt) => prompt.id);

    // Children first, parents last. Array form runs as one non-interactive batch
    // (avoids Accelerate's interactive-transaction timeout). The badge clone is
    // removed last; the source catalog badge it points to is left untouched.
    await prisma.$transaction([
      prisma.checkpointResponse.deleteMany({ where: { checkpointId: { in: checkpointIds } } }),
      prisma.checkpointAttempt.deleteMany({ where: { checkpointId: { in: checkpointIds } } }),
      prisma.segmentProgress.deleteMany({ where: { segmentId: { in: segmentIds } } }),
      prisma.checkpointQuestion.deleteMany({ where: { checkpointId: { in: checkpointIds } } }),
      prisma.lessonCheckpoint.deleteMany({ where: { lessonId: { in: lessonIds } } }),
      prisma.lessonSegment.deleteMany({ where: { lessonId: { in: lessonIds } } }),
      prisma.lessonSkill.deleteMany({ where: { lessonId: { in: lessonIds } } }),
      prisma.lessonProgress.deleteMany({ where: { lessonId: { in: lessonIds } } }),
      prisma.surveyResponse.deleteMany({ where: { promptId: { in: surveyPromptIds } } }),
      prisma.surveyPrompt.deleteMany({ where: { id: { in: surveyPromptIds } } }),
      prisma.badgeRequirement.deleteMany({ where: { badgeId } }),
      prisma.assessmentAttempt.deleteMany({ where: { badgeId, courseId } }),
      prisma.studentBadge.deleteMany({ where: { badgeId } }),
      prisma.message.deleteMany({ where: { badgeId } }),
      prisma.lesson.deleteMany({ where: { id: { in: lessonIds } } }),
      prisma.badge.delete({ where: { id: badgeId } }),
    ]);

    return NextResponse.json({ unassigned: true }, { status: 200 });
  } catch (error) {
    console.error('DELETE /api/courses/[courseId]/badges/[badgeId] failed:', error);

    return NextResponse.json({ error: 'Failed to unassign badge' }, { status: 500 });
  }
}
