import { NextResponse } from 'next/server';
import { fetchCreatedCourses } from '@/app/api/courses/lib/course-queries';
import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';

export async function GET() {
  try {
    // Resolve (and lazily provision) the signed-in user from the Clerk session.
    // We do NOT trust a client ?email= param — that would let any signed-in user
    // read another user's courses.
    const user = await ensureCurrentUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const courses = await fetchCreatedCourses(user.id);

    return NextResponse.json(
      {
        user,
        count: courses.length,
        courses,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET /api/courses/created failed:', error);

    return NextResponse.json({ error: 'Failed to fetch created courses' }, { status: 500 });
  }
}
