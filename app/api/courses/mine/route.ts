import { NextResponse } from 'next/server';
import {
  fetchCheckerCourseEnrollments,
  fetchCreatedCourses,
  fetchEnrolledCourses,
} from '@/app/api/courses/lib/course-queries';
import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';

/**
 * Consolidated endpoint that returns the signed-in user's created, enrolled, and
 * checker courses in a single response. This replaces three separate fetches
 * (created/enrolled/checker) — each of which independently called
 * ensureCurrentUser() — with one request and one user provisioning round-trip.
 *
 * The three sub-payloads are drop-in equivalents of the bodies returned by the
 * existing /api/courses/{created,enrolled,checker} routes.
 */
export async function GET() {
  try {
    // Resolve (and lazily provision) the signed-in user from the Clerk session.
    // We do NOT trust a client ?email= param — that would let any signed-in user
    // read another user's courses.
    const user = await ensureCurrentUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [createdCourses, enrolledEnrollments, checkerEnrollments] = await Promise.all([
      fetchCreatedCourses(user.id),
      fetchEnrolledCourses(user.id),
      fetchCheckerCourseEnrollments(user.id),
    ]);

    return NextResponse.json(
      {
        user,
        created: {
          count: createdCourses.length,
          courses: createdCourses,
        },
        enrolled: {
          count: enrolledEnrollments.length,
          enrollments: enrolledEnrollments,
        },
        checker: {
          count: checkerEnrollments.length,
          // Replicate the /api/courses/checker mapping exactly so the pages can
          // consume this section identically to the standalone endpoint.
          enrollments: checkerEnrollments.map((enrollment) => ({
            id: enrollment.id,
            role: enrollment.role,
            sections: enrollment.sections.map((assignment) => assignment.section),
            course: enrollment.course,
          })),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET /api/courses/mine failed:', error);

    return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 });
  }
}
