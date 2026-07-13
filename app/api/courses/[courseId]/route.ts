import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { fetchAccessibleCourseDetail, fetchUserByEmail } from '@/app/api/courses/lib/course-queries';
import prisma from '@/lib/prisma';
import { normalizeEmail } from '@/lib/text/email';

function normalizeCourseId(courseId?: string | null) {
  const trimmed = courseId?.trim();
  return trimmed ? trimmed : null;
}

export async function GET(req: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  try {
    void req;
    const clerkUser = await currentUser();
    const email = normalizeEmail(clerkUser?.emailAddresses?.[0]?.emailAddress);
    const { courseId: rawCourseId } = await context.params;
    const courseId = normalizeCourseId(rawCourseId);

    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!courseId) {
      return NextResponse.json({ error: 'Course id is required' }, { status: 400 });
    }

    const user = await fetchUserByEmail(email);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const course = await fetchAccessibleCourseDetail(user.id, courseId);

    if (!course) {
      return NextResponse.json(
        { error: 'Course not found or you do not have permission to view it.' },
        { status: 404 }
      );
    }

    // A pending assessor request does not grant access yet — only an active
    // enrollment (or course ownership) does.
    const viewerEnrollment = course.enrollments.find(
      (enrollment) => enrollment.student.id === user.id && enrollment.status === 'ACTIVE'
    );
    const viewerRole = course.createdById === user.id ? 'INSTRUCTOR' : viewerEnrollment?.role;

    if (!viewerRole) {
      return NextResponse.json(
        { error: 'Course not found or you do not have permission to view it.' },
        { status: 404 }
      );
    }

    // Resolve avatar bases for contacts by looking up each contact's user record by email.
    const contactEmails = course.contacts.map((c) => c.email).filter(Boolean);
    const contactUsers =
      contactEmails.length > 0
        ? await prisma.user.findMany({
            where: { email: { in: contactEmails } },
            select: { email: true, avatar: { select: { base: true } } },
          })
        : [];
    const avatarBaseByEmail = new Map(contactUsers.map((u) => [u.email, u.avatar?.base ?? null]));

    return NextResponse.json(
      {
        viewerRole,
        course: {
          ...course,
          createdBy: course.createdBy
            ? {
                ...course.createdBy,
                avatarBase: course.createdBy.avatar?.base ?? null,
              }
            : null,
          contacts: course.contacts.map((contact) => ({
            ...contact,
            avatarBase: avatarBaseByEmail.get(contact.email) ?? null,
          })),
          enrollments: course.enrollments.map((enrollment) => ({
            ...enrollment,
            sections: enrollment.sections.map((assignment) => assignment.section),
          })),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET /api/courses/[courseId] failed:', error);

    return NextResponse.json({ error: 'Failed to fetch course details' }, { status: 500 });
  }
}

// MVP test-cleanup tool — delete a course (and all its content) the signed-in
// user created. Optional FKs (BadgeRequirement.lessonId, Message.courseId)
// SetNull; everything else is removed in FK-safe order. REMOVE BEFORE HANDOFF.
export async function DELETE(req: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  try {
    void req;
    const clerkUser = await currentUser();
    const email = normalizeEmail(clerkUser?.emailAddresses?.[0]?.emailAddress);
    const { courseId: rawCourseId } = await context.params;
    const courseId = normalizeCourseId(rawCourseId);

    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!courseId) {
      return NextResponse.json({ error: 'Course id is required' }, { status: 400 });
    }

    const user = await fetchUserByEmail(email);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Only the course creator may delete, and only their own course.
    const course = await prisma.course.findFirst({
      where: { id: courseId, createdById: user.id },
      select: { id: true },
    });

    if (!course) {
      return NextResponse.json({ error: 'Course not found or you are not its creator.' }, { status: 404 });
    }

    const lessons = await prisma.lesson.findMany({ where: { courseId }, select: { id: true } });
    const lessonIds = lessons.map((lesson) => lesson.id);

    const [segments, checkpoints, lessonProgress, surveyPrompts] = await Promise.all([
      prisma.lessonSegment.findMany({ where: { lessonId: { in: lessonIds } }, select: { id: true } }),
      prisma.lessonCheckpoint.findMany({ where: { lessonId: { in: lessonIds } }, select: { id: true } }),
      prisma.lessonProgress.findMany({ where: { lessonId: { in: lessonIds } }, select: { id: true } }),
      prisma.surveyPrompt.findMany({ where: { lessonId: { in: lessonIds } }, select: { id: true } }),
    ]);
    const segmentIds = segments.map((segment) => segment.id);
    const checkpointIds = checkpoints.map((checkpoint) => checkpoint.id);
    const surveyPromptIds = surveyPrompts.map((prompt) => prompt.id);
    void lessonProgress;

    // Children first, parents last. Array form runs as one non-interactive batch
    // (avoids Accelerate's interactive-transaction timeout).
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
      prisma.surveyPrompt.deleteMany({ where: { lessonId: { in: lessonIds } } }),
      prisma.badgeRequirement.deleteMany({ where: { lessonId: { in: lessonIds } } }),
      prisma.assessmentAttempt.deleteMany({ where: { courseId } }),
      prisma.lesson.deleteMany({ where: { courseId } }),
      prisma.enrollment.deleteMany({ where: { courseId } }),
      prisma.courseContact.deleteMany({ where: { courseId } }),
      prisma.courseSettings.deleteMany({ where: { courseId } }),
      prisma.message.deleteMany({ where: { courseId } }),
      prisma.course.delete({ where: { id: courseId } }),
    ]);

    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error) {
    console.error('DELETE /api/courses/[courseId] failed:', error);

    return NextResponse.json({ error: 'Failed to delete course' }, { status: 500 });
  }
}
