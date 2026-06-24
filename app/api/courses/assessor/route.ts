import { NextRequest, NextResponse } from 'next/server';
import { fetchAssessorCourseEnrollments, fetchUserByEmail } from '@/app/api/courses/lib/course-queries';

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
