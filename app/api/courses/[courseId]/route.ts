import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { fetchAccessibleCourseDetail, fetchUserByEmail } from '@/app/api/courses/lib/course-queries';

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

    return NextResponse.json(
      {
        viewerRole,
        course: {
          ...course,
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
