import { NextRequest, NextResponse } from 'next/server';
import { CourseRole, Prisma } from '@prisma/client';

import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';
import prisma from '@/lib/prisma';
import { countCompletedBadges, type BadgeSnapshotResponse } from '@/lib/roster/badgeSnapshot';

export type { BadgeSnapshotResponse } from '@/lib/roster/badgeSnapshot';

const NOT_FOUND = 'Course not found or you do not have permission to view it.';

export async function GET(req: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  try {
    const current = await ensureCurrentUser();
    if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { courseId: rawCourseId } = await context.params;
    const courseId = rawCourseId?.trim();
    if (!courseId) return NextResponse.json({ error: 'A course is required.' }, { status: 400 });
    const requestedSection = req.nextUrl.searchParams.get('section')?.trim() || null;

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        createdById: true,
        settings: { select: { allowCrossSectionView: true } },
        enrollments: {
          where: { studentId: current.id, status: 'ACTIVE' },
          select: { role: true, sections: { select: { section: true } } },
        },
        lessons: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            badgeRequirements: {
              orderBy: { createdAt: 'asc' },
              select: { badgeId: true },
            },
          },
        },
      },
    });
    if (!course) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    const viewerEnrollment = course.enrollments[0] ?? null;
    const isCreator = course.createdById === current.id;
    const viewerRole = isCreator ? CourseRole.INSTRUCTOR : viewerEnrollment?.role;
    if (viewerRole !== CourseRole.INSTRUCTOR && viewerRole !== CourseRole.CHECKER) {
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    }

    // Course badges and their requirement lessons; a badge can be required by several lessons.
    const requirementLessonIds = new Map<string, string[]>();
    for (const lesson of course.lessons) {
      for (const { badgeId } of lesson.badgeRequirements) {
        requirementLessonIds.set(badgeId, [...(requirementLessonIds.get(badgeId) ?? []), lesson.id]);
      }
    }
    const badgeIds = [...requirementLessonIds.keys()];

    // Same visibility rule as the student profile route: a section-scoped checker
    // sees students in one of their sections, plus students with no section.
    const sectionScoped = viewerRole === CourseRole.CHECKER && !course.settings?.allowCrossSectionView;
    const viewerSections = new Set(viewerEnrollment?.sections.map((assignment) => assignment.section) ?? []);
    let sectionWhere: Prisma.EnrollmentWhereInput = {};
    if (requestedSection) {
      if (sectionScoped && !viewerSections.has(requestedSection)) {
        return NextResponse.json(emptyResponse(badgeIds.length));
      }
      sectionWhere = { sections: { some: { section: requestedSection } } };
    } else if (sectionScoped) {
      sectionWhere = {
        OR: [{ sections: { some: { section: { in: [...viewerSections] } } } }, { sections: { none: {} } }],
      };
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { courseId, role: CourseRole.STUDENT, status: 'ACTIVE', ...sectionWhere },
      select: { studentId: true },
    });
    const studentIds = enrollments.map((enrollment) => enrollment.studentId);
    if (studentIds.length === 0 || badgeIds.length === 0) {
      return NextResponse.json({
        ...emptyResponse(badgeIds.length),
        completed: Object.fromEntries(studentIds.map((id) => [id, 0])),
      });
    }

    const lessonIds = [...new Set([...requirementLessonIds.values()].flat())];
    const [studentBadges, lessonProgress, attempts] = await Promise.all([
      prisma.studentBadge.findMany({
        where: { studentId: { in: studentIds }, badgeId: { in: badgeIds } },
        select: { studentId: true, badgeId: true, status: true, awardedAt: true },
      }),
      prisma.lessonProgress.findMany({
        where: { studentId: { in: studentIds }, lessonId: { in: lessonIds } },
        select: {
          studentId: true,
          lessonId: true,
          status: true,
          startedAt: true,
          completedAt: true,
          percentComplete: true,
        },
      }),
      prisma.assessmentAttempt.findMany({
        where: { courseId, studentId: { in: studentIds }, badgeId: { in: badgeIds } },
        select: { studentId: true, badgeId: true, passed: true },
      }),
    ]);

    const body: BadgeSnapshotResponse = {
      badgeCount: badgeIds.length,
      completed: countCompletedBadges({
        badgeIds,
        requirementLessonIds,
        studentIds,
        studentBadges,
        lessonProgress,
        attempts,
      }),
      fetchedAt: new Date().toISOString(),
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error('GET /api/courses/[courseId]/badge-snapshot failed:', error);
    return NextResponse.json({ error: 'Unable to load badge progress.' }, { status: 500 });
  }
}

function emptyResponse(badgeCount: number): BadgeSnapshotResponse {
  return { badgeCount, completed: {}, fetchedAt: new Date().toISOString() };
}
