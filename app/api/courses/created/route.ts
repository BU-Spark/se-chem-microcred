import { NextRequest, NextResponse } from 'next/server';
import { fetchCreatedCourses, fetchUserByEmail } from '@/app/api/courses/lib/course-queries';

function normalizeEmail(email?: string | null) {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export async function GET(req: NextRequest) {
  try {
    const email = normalizeEmail(req.nextUrl.searchParams.get('email'));

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const user = await fetchUserByEmail(email);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
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
