import { NextResponse } from 'next/server';
import { fetchAssessorCourseEnrollments } from '@/app/api/courses/lib/course-queries';
import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';

export async function GET() {
  try {
    // Resolve (and lazily provision) the signed-in user from the Clerk session.
    // We do NOT trust a client ?email= param — that would let any signed-in user
    // read another user's assessor courses.
    const user = await ensureCurrentUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const enrollments = await fetchAssessorCourseEnrollments(user.id);

    return NextResponse.json(
      {
        user,
        count: enrollments.length,
        enrollments: enrollments.map((enrollment) => ({
          id: enrollment.id,
          role: enrollment.role,
          sections: enrollment.sections.map((assignment) => assignment.section),
          course: enrollment.course,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET /api/courses/assessor failed:', error);

    return NextResponse.json({ error: 'Failed to fetch assessor courses' }, { status: 500 });
  }
}
