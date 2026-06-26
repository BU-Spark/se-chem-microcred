import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { fetchAccessibleCourseDetail, fetchUserByEmail } from '@/app/api/courses/lib/course-queries';
import prisma from '@/lib/prisma';

function normalizeEmail(email?: string | null) {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

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

    const viewerEnrollment = course.enrollments.find((enrollment) => enrollment.student.id === user.id);
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
