import { NextRequest, NextResponse } from 'next/server';
import { fetchAccessibleCourseMemberDetail, fetchUserByEmail } from '@/app/api/courses/lib/course-queries';
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
    category: string | null;
  },
  summary?: string | null
) {
  return {
    id: badge.id,
    slug: badge.slug,
    name: badge.name,
    description: badge.description,
    category: badge.category,
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
    const courseBadges = new Map<string, ReturnType<typeof formatBadge>>();

    for (const lesson of course.lessons) {
      for (const requirement of lesson.badgeRequirements) {
        if (!courseBadges.has(requirement.badge.id)) {
          courseBadges.set(requirement.badge.id, formatBadge(requirement.badge, requirement.summary));
        }
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
        contacts: course.contacts.map((contact) => ({
          id: contact.id,
          type: contact.type,
          name: contact.name,
          email: contact.email,
          avatarUrl: contact.avatarUrl ?? null,
        })),
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
