import { NextRequest, NextResponse } from 'next/server';
import {
  fetchAccessibleCourseDetail,
  fetchAccessibleBadgeDetail,
  fetchUserByEmail,
} from '@/app/api/courses/lib/course-queries';

type BadgeStatus = 'LEARNING' | 'READY_FOR_ASSESSMENT' | 'READY_FOR_FINALIZATION' | 'COMPLETED';

type AssessmentSummary = {
  displayText: string;
  videoTitle?: string | null;
  youtubeUrl?: string | null;
  videoLength?: string | null;
  checkpoints: Array<{
    number?: number;
    title?: string | null;
    question?: string | null;
    questionType?: string | null;
    points?: number | string | null;
    time?: string | null;
    segmentLabel?: string | null;
  }>;
};

function normalizeEmail(email?: string | null) {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function normalizeCourseId(courseId?: string | null) {
  const trimmed = courseId?.trim();
  return trimmed ? trimmed : null;
}

function normalizeBadgeId(badgeId?: string | null) {
  const trimmed = badgeId?.trim();
  return trimmed ? trimmed : null;
}

function parseRequirementSummary(summary?: string | null): AssessmentSummary {
  if (!summary) {
    return {
      displayText: 'No assessment details recorded yet.',
      videoTitle: null,
      youtubeUrl: null,
      videoLength: null,
      checkpoints: [],
    };
  }

  try {
    const parsed = JSON.parse(summary) as Partial<AssessmentSummary>;

    return {
      displayText: 'Assessment details recorded.',
      videoTitle: typeof parsed.videoTitle === 'string' && parsed.videoTitle.trim() ? parsed.videoTitle.trim() : null,
      youtubeUrl: typeof parsed.youtubeUrl === 'string' && parsed.youtubeUrl.trim() ? parsed.youtubeUrl.trim() : null,
      videoLength:
        typeof parsed.videoLength === 'string' && parsed.videoLength.trim() ? parsed.videoLength.trim() : null,
      checkpoints: parsed.checkpoints ?? [],
    };
  } catch {
    return {
      displayText: summary,
      videoTitle: null,
      youtubeUrl: null,
      videoLength: null,
      checkpoints: [],
    };
  }
}

function formatTimestamp(seconds?: number | null) {
  const safeSeconds = Math.max(0, Math.floor(seconds ?? 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return [hours, minutes, remainingSeconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function formatDuration(seconds?: number | null) {
  if (!seconds || seconds <= 0) return null;
  return formatTimestamp(seconds);
}

function normalizeLessonCheckpoints(
  lesson: NonNullable<Awaited<ReturnType<typeof fetchAccessibleBadgeDetail>>>['lessons'][number]
) {
  return (lesson.checkpoints ?? []).map((checkpoint, index) => {
    const questionCount = checkpoint.questions?.length || checkpoint.questionCount;
    return {
      number: index + 1,
      title: checkpoint.label?.trim() || 'Checkpoint',
      question: checkpoint.questions[0]?.prompt ?? null,
      questionType: null,
      points: null,
      time: formatTimestamp(checkpoint.timeOffsetSeconds),
      segmentLabel: `Segment ${index + 1}`,
      questionCount,
      questionText: `${questionCount} question${questionCount === 1 ? '' : 's'}`,
    };
  });
}

function calculatePercent(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

export async function GET(req: NextRequest, context: { params: Promise<{ courseId: string; badgeId: string }> }) {
  try {
    const email = normalizeEmail(req.nextUrl.searchParams.get('email'));
    const { courseId: rawCourseId } = await context.params;
    const { badgeId: rawBadgeId } = await context.params;
    const courseId = normalizeCourseId(rawCourseId);
    const badgeId = normalizeBadgeId(rawBadgeId);

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if (!courseId) {
      return NextResponse.json({ error: 'Course id is required' }, { status: 400 });
    }

    if (!badgeId) {
      return NextResponse.json({ error: 'Badge id is required' }, { status: 400 });
    }

    const user = await fetchUserByEmail(email);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const [course, badge] = await Promise.all([
      fetchAccessibleCourseDetail(user.id, courseId),
      fetchAccessibleBadgeDetail(user.id, courseId, badgeId),
    ]);

    if (!course) {
      return NextResponse.json(
        { error: 'Course not found or you do not have permission to view it.' },
        { status: 404 }
      );
    }

    if (!badge) {
      return NextResponse.json(
        { error: 'Course not found or you do not have permission to view it.' },
        { status: 404 }
      );
    }

    const badgeLesson = badge.lessons[0] ?? null;
    const requirement = badgeLesson?.badgeRequirements[0] ?? null;
    const badgeDetail = requirement?.badge;
    const parsedAssessment = parseRequirementSummary(requirement?.summary);
    const primarySegment =
      badgeLesson?.segments?.find((segment) => segment.videoUrl) ?? badgeLesson?.segments?.[0] ?? null;
    const lessonCheckpoints = badgeLesson ? normalizeLessonCheckpoints(badgeLesson) : [];
    const rubricGoal = badgeDetail?.rubricGoal ?? null;
    const assessment = {
      ...parsedAssessment,
      displayText: rubricGoal?.name ?? parsedAssessment.displayText,
      rubricGoal,
      videoTitle: primarySegment?.title ?? parsedAssessment.videoTitle,
      youtubeUrl: primarySegment?.videoUrl ?? parsedAssessment.youtubeUrl,
      videoLength: formatDuration(primarySegment?.duration) ?? parsedAssessment.videoLength,
      checkpoints: lessonCheckpoints.length > 0 ? lessonCheckpoints : parsedAssessment.checkpoints,
    };
    const students = badge.enrollments.map((enrollment) => {
      const progress = enrollment.student.badgeProgress[0] ?? null;
      const status = (progress?.status ?? 'NOT_STARTED') as BadgeStatus | 'NOT_STARTED';

      return {
        enrollmentId: enrollment.id,
        sections: enrollment.sections.map((assignment) => assignment.section),
        student: enrollment.student,
        progress: progress
          ? {
              id: progress.id,
              badgeId: progress.badgeId,
              status: progress.status,
              awardedAt: progress.awardedAt?.toISOString() ?? null,
              score: progress.score,
              updatedAt: progress.updatedAt.toISOString(),
            }
          : null,
        status,
      };
    });
    const totalStudents = students.length;
    const completedCount = students.filter((student) => student.status === 'COMPLETED').length;
    const inProgressCount = students.filter(
      (student) =>
        student.status === 'LEARNING' ||
        student.status === 'READY_FOR_ASSESSMENT' ||
        student.status === 'READY_FOR_FINALIZATION'
    ).length;
    const notStartedCount = students.filter((student) => student.status === 'NOT_STARTED').length;
    const readyForAssessmentCount = students.filter((student) => student.status === 'READY_FOR_ASSESSMENT').length;
    const readyForFinalizationCount = students.filter((student) => student.status === 'READY_FOR_FINALIZATION').length;
    const scoredStudents = students.filter((student) => typeof student.progress?.score === 'number');
    const averageScore =
      scoredStudents.length > 0
        ? Math.round(
            scoredStudents.reduce((sum, student) => sum + (student.progress?.score ?? 0), 0) / scoredStudents.length
          )
        : null;

    // Mirror the course-detail route: course owner is the instructor, otherwise
    // fall back to the viewer's active enrollment role (STUDENT/CHECKER).
    const viewerEnrollment = course.enrollments.find(
      (enrollment) => enrollment.student.id === user.id && enrollment.status === 'ACTIVE'
    );
    const viewerRole = course.createdById === user.id ? 'INSTRUCTOR' : (viewerEnrollment?.role ?? null);

    return NextResponse.json(
      {
        viewerRole,
        course: {
          ...course,
          enrollments: course.enrollments.map((enrollment) => ({
            ...enrollment,
            sections: enrollment.sections.map((assignment) => assignment.section),
          })),
        },
        badge: badgeDetail
          ? {
              ...badgeDetail,
              lesson: badgeLesson
                ? {
                    id: badgeLesson.id,
                    title: badgeLesson.title,
                    sortOrder: badgeLesson.sortOrder,
                  }
                : null,
            }
          : null,
        summary: {
          totalStudents,
          completedCount,
          inProgressCount,
          notStartedCount,
          readyForAssessmentCount,
          readyForFinalizationCount,
          completedPercent: calculatePercent(completedCount, totalStudents),
          inProgressPercent: calculatePercent(inProgressCount, totalStudents),
          notStartedPercent: calculatePercent(notStartedCount, totalStudents),
          readyForAssessmentPercent: calculatePercent(readyForAssessmentCount, totalStudents),
          readyForFinalizationPercent: calculatePercent(readyForFinalizationCount, totalStudents),
          averageScore,
        },
        assessment,
        students,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET /api/courses/[courseId]/[badgeId] failed:', error);

    return NextResponse.json({ error: 'Failed to fetch badge details' }, { status: 500 });
  }
}
