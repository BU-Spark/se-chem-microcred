import { NextResponse } from 'next/server';
import { fetchEnrolledCourses } from '@/app/api/courses/lib/course-queries';
import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';

export async function GET() {
  try {
    // Resolve (and lazily provision) the signed-in user from the Clerk session.
    // We do NOT trust a client ?email= param — that would let any signed-in user
    // read another user's enrollments.
    const user = await ensureCurrentUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const enrollments = await fetchEnrolledCourses(user.id);

    return NextResponse.json(
      {
        user,
        count: enrollments.length,
        enrollments,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET /api/courses/enrolled failed:', error);

    return NextResponse.json({ error: 'Failed to fetch enrolled courses' }, { status: 500 });
  }
}
