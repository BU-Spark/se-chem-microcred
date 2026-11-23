import { NextRequest, NextResponse } from 'next/server';
import { CourseRole, Prisma } from '@prisma/client';

import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';
import prisma from '@/lib/prisma';
import { buildBadgeSnapshot, type BadgeSnapshotResponse, type SnapshotBadge } from '@/lib/roster/badgeSnapshot';

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
              select: { badge: { select: { id: true, name: true, slug: true } } },
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

    // Course badges in course order; a badge can be required by several lessons.
    const badges: SnapshotBadge[] = [];
    const requirementLessonIds = new Map<string, string[]>();
    for (const lesson of course.lessons) {
      for (const { badge } of lesson.badgeRequirements) {
        const lessons = requirementLessonIds.get(badge.id);
        if (lessons) {
          lessons.push(lesson.id);
        } else {
          requirementLessonIds.set(badge.id, [lesson.id]);
          badges.push({ id: badge.id, name: badge.name, slug: badge.slug });
        }
      }
    }

    // Same visibility rule as the student profile route: a section-scoped checker
    // sees students in one of their sections, plus students with no section.
    const sectionScoped = viewerRole === CourseRole.CHECKER && !course.settings?.allowCrossSectionView;
    const viewerSections = new Set(viewerEnrollment?.sections.map((assignment) => assignment.section) ?? []);
    let sectionWhere: Prisma.EnrollmentWhereInput = {};
    if (requestedSection) {
      if (sectionScoped && !viewerSections.has(requestedSection)) {
        return NextResponse.json(emptyResponse(badges));
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
    if (studentIds.length === 0 || badges.length === 0) {
      return NextResponse.json({
        ...emptyResponse(badges),
        students: Object.fromEntries(studentIds.map((id) => [id, []])),
      });
    }

    const badgeIds = badges.map((badge) => badge.id);
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
        select: {
          studentId: true,
          badgeId: true,
          passed: true,
          pointsEarned: true,
          pointsPossible: true,
          completedAt: true,
          createdAt: true,
        },
      }),
    ]);

    const body: BadgeSnapshotResponse = {
      badges,
      students: buildBadgeSnapshot({
        badges,
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

function emptyResponse(badges: SnapshotBadge[]): BadgeSnapshotResponse {
  return { badges, students: {}, fetchedAt: new Date().toISOString() };
}
