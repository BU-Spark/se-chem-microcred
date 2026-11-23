import { NextRequest, NextResponse } from 'next/server';
import { CourseRole } from '@prisma/client';
import { currentUser } from '@clerk/nextjs/server';
import { fetchAccessibleCourseMemberDetail, fetchUserByEmail } from '@/app/api/courses/lib/course-queries';
import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';
import prisma from '@/lib/prisma';
import { normalizeEmail } from '@/lib/text/email';
import { youtubeUrlFromSummary } from '@/lib/video';
import { classifyStudentBadgeCohort } from '@/lib/badgeCohorts';
import { canSendCourseMessages } from '@/lib/messaging/audience';
import { sharesSectionWith } from '@/lib/sections';

function normalizeId(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// The viewer's email arrives as a client-supplied query param; require it to
// match the signed-in Clerk session so a caller can't read profiles as someone else.
async function sessionMatchesEmail(email: string) {
  const clerkUser = await currentUser();
  const sessionEmail = normalizeEmail(clerkUser?.emailAddresses?.[0]?.emailAddress);
  return Boolean(sessionEmail) && sessionEmail === email;
}

function formatBadge(
  badge: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    imagePositionX: number;
    imagePositionY: number;
    imageScale: number;
  },
  summary?: string | null
) {
  return {
    id: badge.id,
    slug: badge.slug,
    name: badge.name,
    description: badge.description,
    imageUrl: badge.imageUrl,
    imagePositionX: badge.imagePositionX,
    imagePositionY: badge.imagePositionY,
    imageScale: badge.imageScale,
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

    const [sessionOk, user] = await Promise.all([sessionMatchesEmail(email), fetchUserByEmail(email)]);

    if (!sessionOk) {
      return NextResponse.json({ error: 'Session does not match the requested user.' }, { status: 403 });
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const [course, courseStaff, attemptRows] = await Promise.all([
      fetchAccessibleCourseMemberDetail(user.id, courseId, studentId),
      prisma.enrollment.findMany({
        where: {
          courseId,
          role: { in: [CourseRole.INSTRUCTOR, CourseRole.CHECKER] },
          status: 'ACTIVE',
        },
        select: {
          id: true,
          role: true,
          studentId: true,
          sections: { select: { section: true } },
          student: { select: { id: true, name: true, firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.assessmentAttempt.findMany({
        where: { courseId, studentId },
        select: { badgeId: true, passed: true },
      }),
    ]);

    if (!course || course.enrollments.length === 0) {
      return NextResponse.json(
        {
          error: 'Member not found in this course or you do not have permission to view it.',
        },
        { status: 404 }
      );
    }

    const enrollment = course.enrollments.find((entry) => entry.student.id === studentId);
    // courseStaff holds only ACTIVE instructor/checker enrollments, so the viewer is in
    // it exactly when their enrollment can grant access. A creator needn't be enrolled.
    const viewerEnrollment = courseStaff.find((entry) => entry.studentId === user.id);
    const isCourseCreator = course.createdById === user.id;
    const viewerRole = viewerEnrollment?.role;
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
      const canViewSection = sharesSectionWith(
        viewerEnrollment?.sections.map((assignment) => assignment.section) ?? [],
        enrollment.sections.map((assignment) => assignment.section)
      );

      if (enrollment.role !== 'STUDENT' || !canViewSection) {
        return NextResponse.json(
          {
            error: 'Member not found in this course or you do not have permission to view it.',
          },
          { status: 404 }
        );
      }
    }

    const canMessage =
      enrollment.role === 'STUDENT' &&
      canSendCourseMessages(
        { isCreator: isCourseCreator, role: viewerRole ?? null },
        course.settings?.allowCheckerMessages ?? false
      );

    const member = enrollment.student;

    const memberSectionSet = new Set(enrollment.sections.map((assignment) => assignment.section));

    const contacts = courseStaff
      .filter((staff) => {
        if (staff.role === CourseRole.INSTRUCTOR) return true;

        if (memberSectionSet.size === 0) return true;
        if (staff.sections.length === 0) return true;
        return staff.sections.some((assignment) => memberSectionSet.has(assignment.section));
      })
      .map((staff) => ({
        id: staff.id,
        type: staff.role === CourseRole.INSTRUCTOR ? CourseRole.INSTRUCTOR : CourseRole.CHECKER,
        name: staff.student.name ?? staff.student.email ?? 'Unknown',

        firstName: staff.student.firstName,
        lastName: staff.student.lastName,
        email: staff.student.email ?? '',
        avatarUrl: null,
      }));

    const courseBadges = new Map<string, ReturnType<typeof formatBadge>>();

    const lessonIdsByBadgeId = new Map<string, string[]>();
    const lessonProgressByBadgeId = new Map<
      string,
      Array<(typeof course.lessons)[number]['progress'][number] & { lessonId: string }>
    >();

    for (const lesson of course.lessons) {
      const progress = lesson.progress[0] ?? null;

      for (const requirement of lesson.badgeRequirements) {
        const badgeId = requirement.badge.id;

        if (!courseBadges.has(badgeId)) {
          courseBadges.set(badgeId, formatBadge(requirement.badge, requirement.summary));
        }

        lessonIdsByBadgeId.set(badgeId, [...(lessonIdsByBadgeId.get(badgeId) ?? []), lesson.id]);

        if (progress) {
          lessonProgressByBadgeId.set(badgeId, [
            ...(lessonProgressByBadgeId.get(badgeId) ?? []),
            { ...progress, lessonId: lesson.id },
          ]);
        }
      }
    }

    const attemptsByBadgeId = new Map<string, Array<{ passed: boolean }>>();
    for (const attempt of attemptRows) {
      attemptsByBadgeId.set(attempt.badgeId, [
        ...(attemptsByBadgeId.get(attempt.badgeId) ?? []),
        { passed: attempt.passed },
      ]);
    }

    const progressByBadgeId = new Map(
      member.badgeProgress.map((badgeProgress) => [badgeProgress.badgeId, badgeProgress])
    );

    type BadgeWithCohort = ReturnType<typeof formatBadge> & {
      status: string | null;
      awardedAt: string | null;
      score: number | null;
      stage: string | null;
      locked: boolean;
      attemptCount: number;
    };

    // The same three cohorts the course badge page reports, so a student's row
    // there and their profile here can never disagree.
    const proficient: BadgeWithCohort[] = [];
    const stillLearning: BadgeWithCohort[] = [];
    const notStarted: BadgeWithCohort[] = [];

    for (const badge of courseBadges.values()) {
      const progress = progressByBadgeId.get(badge.id);
      const attempts = attemptsByBadgeId.get(badge.id) ?? [];
      const cohort = classifyStudentBadgeCohort({
        badgeStatus: progress?.status ?? null,
        awardedAt: progress?.awardedAt ?? null,
        requirementLessonIds: lessonIdsByBadgeId.get(badge.id) ?? [],
        lessonProgress: lessonProgressByBadgeId.get(badge.id) ?? [],
        attempts,
      });

      const entry: BadgeWithCohort = {
        ...badge,
        status: progress?.status ?? null,
        awardedAt: progress?.awardedAt?.toISOString() ?? null,
        score: progress?.score ?? null,
        stage: cohort.stage,
        locked: cohort.locked,
        attemptCount: attempts.length,
      };

      if (cohort.cohort === 'PROFICIENT') {
        proficient.push(entry);
      } else if (cohort.cohort === 'STILL_LEARNING') {
        stillLearning.push(entry);
      } else {
        notStarted.push(entry);
      }
    }

    return NextResponse.json(
      {
        memberRole: enrollment.role,
        viewerRole: effectiveViewerRole,
        canMessage,
        member: {
          id: member.id,
          name: member.name,
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email,
          externalId: member.externalId,
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
                externalId: course.createdBy.externalId,
              }
            : null,
        },
        contacts,
        badges: {
          proficient,
          stillLearning,
          notStarted,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET /api/courses/[courseId]/students/[studentId] failed:', error);

    return NextResponse.json({ error: 'Failed to fetch roster member details' }, { status: 500 });
  }
}

// Remove a student from a course. Instructor-only: the signed-in user must be coruse creator.

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
