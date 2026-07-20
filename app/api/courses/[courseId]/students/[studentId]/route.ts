import { NextRequest, NextResponse } from 'next/server';
import { CourseRole } from '@prisma/client';
import { fetchAccessibleCourseMemberDetail, fetchUserByEmail } from '@/app/api/courses/lib/course-queries';
import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';
import prisma from '@/lib/prisma';
import { youtubeUrlFromSummary } from '@/lib/video';

function normalizeEmail(email?: string | null) {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function normalizeId(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function formatBadge(
  badge: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
  },
  summary?: string | null
) {
  return {
    id: badge.id,
    slug: badge.slug,
    name: badge.name,
    description: badge.description,
    youtubeUrl: youtubeUrlFromSummary(summary),
  };
}

export async function GET(req: NextRequest, context: { params: Promise<{ courseId: string; studentId: string }> }) {
  try {
    const email = normalizeEmail(req.nextUrl.searchParams.get('email'));
    const { courseId: rawCourseId, studentId: rawStudentId } = await context.params;
    const courseId = normalizeId(rawCourseId);
    const studentId = normalizeId(rawStudentId);

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if (!courseId || !studentId) {
      return NextResponse.json({ error: 'Course id and student id are required' }, { status: 400 });
    }

    const user = await fetchUserByEmail(email);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const course = await fetchAccessibleCourseMemberDetail(user.id, courseId, studentId);

    if (!course || course.enrollments.length === 0) {
      return NextResponse.json(
        {
          error: 'Member not found in this course or you do not have permission to view it.',
        },
        { status: 404 }
      );
    }

    const enrollment = course.enrollments.find((entry) => entry.student.id === studentId);
    const viewerEnrollment = course.enrollments.find((entry) => entry.student.id === user.id);
    const isCourseCreator = course.createdById === user.id;
    const viewerRole = isCourseCreator || viewerEnrollment?.status === 'ACTIVE' ? viewerEnrollment?.role : undefined;
    const effectiveViewerRole = isCourseCreator ? 'INSTRUCTOR' : viewerRole;

    if (!enrollment || !effectiveViewerRole || effectiveViewerRole === 'STUDENT') {
      return NextResponse.json(
        {
          error: 'Member not found in this course or you do not have permission to view it.',
        },
        { status: 404 }
      );
    }

    if (effectiveViewerRole === 'CHECKER' && !course.settings?.allowCrossSectionView) {
      const viewerSections = new Set(viewerEnrollment?.sections.map((assignment) => assignment.section) ?? []);
      const memberSections = enrollment.sections.map((assignment) => assignment.section);
      const canViewSection =
        memberSections.length === 0 || memberSections.some((section) => viewerSections.has(section));

      if (enrollment.role !== 'STUDENT' || !canViewSection) {
        return NextResponse.json(
          {
            error: 'Member not found in this course or you do not have permission to view it.',
          },
          { status: 404 }
        );
      }
    }

    const member = enrollment.student;

    // Derive the instructor/checker contacts from enrollments (the section-aware source of
    // truth) rather than CourseContact, which has no section. This ensures a student's side
    // "Checker" card shows the assessor assigned to *their* section, not a fixed first one.
    const memberSectionSet = new Set(enrollment.sections.map((assignment) => assignment.section));
    const courseStaff = await prisma.enrollment.findMany({
      where: {
        courseId,
        role: { in: [CourseRole.INSTRUCTOR, CourseRole.CHECKER] },
        status: 'ACTIVE',
      },
      include: {
        sections: { select: { section: true } },
        student: { select: { id: true, name: true, email: true } },
      },
    });

    const contacts = courseStaff
      .filter((staff) => {
        if (staff.role === CourseRole.INSTRUCTOR) return true;
        // CHECKER: show those sharing the student's section. If the student has no section
        // assigned, or the checker is course-wide (no sections of their own), show them too.
        if (memberSectionSet.size === 0) return true;
        if (staff.sections.length === 0) return true;
        return staff.sections.some((assignment) => memberSectionSet.has(assignment.section));
      })
      .map((staff) => ({
        id: staff.id,
        type: staff.role === CourseRole.INSTRUCTOR ? CourseRole.INSTRUCTOR : CourseRole.CHECKER,
        name: staff.student.name ?? staff.student.email ?? 'Unknown',
        email: staff.student.email ?? '',
        avatarUrl: null,
      }));

    const courseBadges = new Map<string, ReturnType<typeof formatBadge>>();
    const lessonStartedByBadgeId = new Map<string, boolean>();

    for (const lesson of course.lessons) {
      const progress = lesson.progress[0] ?? null;
      const lessonStarted =
        Boolean(progress?.startedAt || progress?.completedAt) ||
        progress?.status === 'IN_PROGRESS' ||
        progress?.status === 'COMPLETED' ||
        (progress?.percentComplete ?? 0) > 0;

      for (const requirement of lesson.badgeRequirements) {
        if (!courseBadges.has(requirement.badge.id)) {
          courseBadges.set(requirement.badge.id, formatBadge(requirement.badge, requirement.summary));
        }

        lessonStartedByBadgeId.set(
          requirement.badge.id,
          (lessonStartedByBadgeId.get(requirement.badge.id) ?? false) || lessonStarted
        );
      }
    }

    const progressByBadgeId = new Map(
      member.badgeProgress.map((badgeProgress) => [badgeProgress.badgeId, badgeProgress])
    );

    const inProgress: Array<
      ReturnType<typeof formatBadge> & {
        status: string;
        awardedAt: string | null;
        score: number | null;
      }
    > = [];
    const notStarted: Array<ReturnType<typeof formatBadge>> = [];
    const completed: Array<
      ReturnType<typeof formatBadge> & {
        status: string;
        awardedAt: string | null;
        score: number | null;
      }
    > = [];
    const readyForFinalization: Array<
      ReturnType<typeof formatBadge> & {
        status: string;
        awardedAt: string | null;
        score: number | null;
      }
    > = [];

    for (const badge of courseBadges.values()) {
      const progress = progressByBadgeId.get(badge.id);

      if (!progress) {
        notStarted.push(badge);
        continue;
      }

      const badgeWithProgress = {
        ...badge,
        status: progress.status,
        awardedAt: progress.awardedAt?.toISOString() ?? null,
        score: progress.score ?? null,
      };

      if (progress.status === 'COMPLETED') {
        completed.push(badgeWithProgress);
      } else if (progress.status === 'READY_FOR_FINALIZATION') {
        readyForFinalization.push(badgeWithProgress);
      } else if (progress.status === 'LEARNING' && !lessonStartedByBadgeId.get(badge.id)) {
        notStarted.push(badge);
      } else {
        inProgress.push(badgeWithProgress);
      }
    }

    return NextResponse.json(
      {
        memberRole: enrollment.role,
        member: {
          id: member.id,
          name: member.name,
          email: member.email,
          buid: member.buid,
          gender: member.gender,
          raceEthnicity: member.raceEthnicity,
          parentalEducation: member.parentalEducation,
          pellGrantQualified: member.pellGrantQualified,
          createdAt: member.createdAt.toISOString(),
          avatar: member.avatar
            ? {
                base: member.avatar.base,
                face: member.avatar.face,
                accessory: member.avatar.accessory,
              }
            : null,
        },
        course: {
          id: course.id,
          title: course.title,
          sections: enrollment.sections.map((assignment) => assignment.section),
          createdBy: course.createdBy
            ? {
                id: course.createdBy.id,
                name: course.createdBy.name,
                email: course.createdBy.email,
                buid: course.createdBy.buid,
              }
            : null,
        },
        contacts,
        badges: {
          inProgress,
          notStarted,
          readyForFinalization,
          completed,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET /api/courses/[courseId]/students/[studentId] failed:', error);

    return NextResponse.json({ error: 'Failed to fetch roster member details' }, { status: 500 });
  }
}

// Remove a student from a course. Instructor-only: the signed-in user must be
// the course creator, and only STUDENT enrollments are removable here. Deleting
// the enrollment cascades its EnrollmentSection rows (see prisma schema).
export async function DELETE(_req: NextRequest, context: { params: Promise<{ courseId: string; studentId: string }> }) {
  try {
    const { courseId: rawCourseId, studentId: rawStudentId } = await context.params;
    const courseId = normalizeId(rawCourseId);
    const studentId = normalizeId(rawStudentId);

    if (!courseId || !studentId) {
      return NextResponse.json({ error: 'Course id and student id are required' }, { status: 400 });
    }

    const user = await ensureCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only the course creator (instructor) may remove students.
    const course = await prisma.course.findFirst({
      where: { id: courseId, createdById: user.id },
      select: { id: true },
    });
    if (!course) {
      return NextResponse.json(
        { error: 'Course not found or you do not have permission to manage it.' },
        { status: 404 }
      );
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: { courseId, studentId, role: CourseRole.STUDENT },
      select: { id: true },
    });
    if (!enrollment) {
      return NextResponse.json({ error: 'Student is not enrolled in this course.' }, { status: 404 });
    }

    await prisma.enrollment.delete({ where: { id: enrollment.id } });

    return NextResponse.json({ message: 'Student removed from course.' }, { status: 200 });
  } catch (error) {
    console.error('DELETE /api/courses/[courseId]/students/[studentId] failed:', error);

    return NextResponse.json({ error: 'Failed to remove student from course.' }, { status: 500 });
  }
}
