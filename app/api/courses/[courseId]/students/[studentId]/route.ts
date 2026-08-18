import { NextRequest, NextResponse } from 'next/server';
import { CourseRole } from '@prisma/client';
import { fetchAccessibleCourseMemberDetail, fetchUserByEmail } from '@/app/api/courses/lib/course-queries';
import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';
import prisma from '@/lib/prisma';
import { normalizeEmail } from '@/lib/text/email';
import { youtubeUrlFromSummary } from '@/lib/video';
import { classifyStudentBadgeCohort } from '@/lib/badgeCohorts';
import { canSendCourseMessages } from '@/lib/messaging/audience';

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
    imageUrl: string | null;
    imagePositionX: number;
    imagePositionY: number;
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

    const canMessage =
      enrollment.role === 'STUDENT' &&
      canSendCourseMessages(
        { isCreator: isCourseCreator, role: viewerRole ?? null },
        course.settings?.allowCheckerMessages ?? false
      );

    const member = enrollment.student;

    // Derive the instructor/checker contacts from enrollments (the section-aware source of
    // truth) rather than CourseContact, which has no section. This ensures a student's side
    // "Checker" card shows the checker assigned to *their* section, not a fixed first one.
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
    // Requirement lessons per badge, plus this member's progress on each, so the
    // cohort rule in lib/badgeCohorts.ts can run against the same inputs the
    // course badge page uses.
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

    // Attempts are the signal that separates "finished the video" from "assessed
    // in person and hasn't passed". Scoped to this course so another course's
    // assessment of the same source badge can't bleed in.
    const badgeIds = [...courseBadges.keys()];
    const attemptRows =
      badgeIds.length > 0
        ? await prisma.assessmentAttempt.findMany({
            where: { courseId, studentId, badgeId: { in: badgeIds } },
            select: { badgeId: true, passed: true },
          })
        : [];

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
