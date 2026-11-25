// Roster progress: badges completed per student for a course (or one section of it).
//
// Kept off GET /api/courses/[courseId] on purpose: badge progress is staff-only.
// Checkers are scoped to their own sections unless the course allows cross-section view.
//
// Two round trips, no writes:
//   1. (parallel) the access check — course, settings, the viewer's staff enrollment —
//      and the course's distinct badge ids.
//   2. one grouped count of completed badges per visible student.
import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { CourseRole, Prisma } from '@prisma/client';

import prisma from '@/lib/prisma';
import { COMPLETED_BADGE_WHERE, type BadgeSnapshotResponse } from '@/lib/roster/badgeSnapshot';
import { normalizeEmail } from '@/lib/text/email';

export type { BadgeSnapshotResponse } from '@/lib/roster/badgeSnapshot';

const NOT_FOUND = 'Course not found or you do not have permission to view it.';

export async function GET(req: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  try {
    const clerkUser = await currentUser();
    const email = normalizeEmail(clerkUser?.emailAddresses?.[0]?.emailAddress);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { courseId: rawCourseId } = await context.params;
    const courseId = rawCourseId?.trim();
    if (!courseId) return NextResponse.json({ error: 'A course is required.' }, { status: 400 });
    const requestedSection = req.nextUrl.searchParams.get('section')?.trim() || null;

    const [course, badgeRequirements] = await Promise.all([
      prisma.course.findUnique({
        where: { id: courseId },
        select: {
          createdBy: { select: { email: true } },
          settings: { select: { allowCrossSectionView: true } },
          enrollments: {
            where: { status: 'ACTIVE', role: { in: [CourseRole.INSTRUCTOR, CourseRole.CHECKER] }, student: { email } },
            select: { role: true, sections: { select: { section: true } } },
          },
        },
      }),
      prisma.badgeRequirement.findMany({
        where: { lesson: { courseId } },
        select: { badgeId: true },
        distinct: ['badgeId'],
      }),
    ]);
    if (!course) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    const viewerEnrollment = course.enrollments[0] ?? null;
    const isCreator = normalizeEmail(course.createdBy?.email) === email;
    const viewerRole = isCreator ? CourseRole.INSTRUCTOR : viewerEnrollment?.role;
    if (viewerRole !== CourseRole.INSTRUCTOR && viewerRole !== CourseRole.CHECKER) {
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    }

    const badgeIds = badgeRequirements.map((requirement) => requirement.badgeId);

    const sectionScoped = viewerRole === CourseRole.CHECKER && !course.settings?.allowCrossSectionView;
    const viewerSections = new Set(viewerEnrollment?.sections.map((assignment) => assignment.section) ?? []);
    let sectionWhere: Prisma.EnrollmentWhereInput = {};
    if (requestedSection) {
      if (sectionScoped && !viewerSections.has(requestedSection)) {
        return NextResponse.json(response(badgeIds.length, {}));
      }
      sectionWhere = { sections: { some: { section: requestedSection } } };
    } else if (sectionScoped) {
      sectionWhere = {
        OR: [{ sections: { some: { section: { in: [...viewerSections] } } } }, { sections: { none: {} } }],
      };
    }

    if (badgeIds.length === 0) return NextResponse.json(response(0, {}));

    // Students with no completed badge don't appear; the client reads a missing id as 0.
    const counts = await prisma.studentBadge.groupBy({
      by: ['studentId'],
      where: {
        ...COMPLETED_BADGE_WHERE,
        badgeId: { in: badgeIds },
        student: {
          enrollments: {
            some: { courseId, role: CourseRole.STUDENT, status: 'ACTIVE', ...sectionWhere },
          },
        },
      },
      _count: { _all: true },
    });

    return NextResponse.json(
      response(badgeIds.length, Object.fromEntries(counts.map((row) => [row.studentId, row._count._all])))
    );
  } catch (error) {
    console.error('GET /api/courses/[courseId]/badge-snapshot failed:', error);
    return NextResponse.json({ error: 'Unable to load badge progress.' }, { status: 500 });
  }
}

function response(badgeCount: number, completed: Record<string, number>): BadgeSnapshotResponse {
  return { badgeCount, completed, fetchedAt: new Date().toISOString() };
}
