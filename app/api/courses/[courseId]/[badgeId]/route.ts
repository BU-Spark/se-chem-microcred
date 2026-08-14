import { NextRequest, NextResponse } from 'next/server';
import {
  fetchAccessibleCourseDetail,
  fetchAccessibleBadgeDetail,
  fetchUserByEmail,
} from '@/app/api/courses/lib/course-queries';
import { normalizeEmail } from '@/lib/text/email';
import { parseRequirementSummary } from '@/lib/badges/requirement-summary';

type BadgeStatus = 'LEARNING' | 'READY_FOR_ASSESSMENT' | 'IN_REVIEW' | 'COMPLETED' | 'LOCKED';
type AnalyticsStatus = 'PROFICIENT' | 'STILL_LEARNING' | 'NOT_STARTED';
type StillLearningReason = 'VIDEO_IN_PROGRESS' | 'VIDEO_COMPLETED_ONLY' | 'IN_PERSON_FAILED';

function normalizeCourseId(courseId?: string | null) {
  const trimmed = courseId?.trim();
  return trimmed ? trimmed : null;
}

function normalizeBadgeId(badgeId?: string | null) {
  const trimmed = badgeId?.trim();
  return trimmed ? trimmed : null;
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
      // StudentBadge rows are eagerly created with LEARNING status when a badge
      // is created/imported, so a LEARNING row alone doesn't mean the student
      // has started. Mirror the roster member route: they've started only once
      // a requirement lesson shows activity.
      const lessonStarted = enrollment.student.lessonProgress.some(
        (lessonProgress) =>
          Boolean(lessonProgress.startedAt || lessonProgress.completedAt) ||
          lessonProgress.status === 'IN_PROGRESS' ||
          lessonProgress.status === 'COMPLETED' ||
          lessonProgress.percentComplete > 0
      );
      const lessonCompleted = enrollment.student.lessonProgress.some(
        (lessonProgress) => lessonProgress.status === 'COMPLETED' || Boolean(lessonProgress.completedAt)
      );
      const status = (
        !progress || (progress.status === 'LEARNING' && !lessonStarted) ? 'NOT_STARTED' : progress.status
      ) as BadgeStatus | 'NOT_STARTED';
      const assessmentAttempts = enrollment.student.assessmentAttempts ?? [];
      const surveyResponses = enrollment.student.surveyResponses ?? [];
      const hasFailedAssessment = assessmentAttempts.some((attempt) => attempt.passed === false);
      const analyticsStatus: AnalyticsStatus =
        status === 'COMPLETED' ? 'PROFICIENT' : status === 'NOT_STARTED' ? 'NOT_STARTED' : 'STILL_LEARNING';
      const stillLearningReason: StillLearningReason | null =
        analyticsStatus !== 'STILL_LEARNING'
          ? null
          : hasFailedAssessment || status === 'LOCKED'
            ? 'IN_PERSON_FAILED'
            : lessonCompleted || status === 'READY_FOR_ASSESSMENT' || status === 'IN_REVIEW'
              ? 'VIDEO_COMPLETED_ONLY'
              : 'VIDEO_IN_PROGRESS';
      const latestFeedback = surveyResponses[0] ?? null;

      return {
        enrollmentId: enrollment.id,
        sections: enrollment.sections.map((assignment) => assignment.section),
        // Rebuild the student payload without the lessonProgress rows fetched
        // above — they exist only to derive `status`.
        student: {
          id: enrollment.student.id,
          name: enrollment.student.name,
          email: enrollment.student.email,
          externalId: enrollment.student.externalId,
          badgeProgress: enrollment.student.badgeProgress,
        },
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
        analyticsStatus,
        stillLearningReason,
        videoStatus: lessonCompleted ? 'COMPLETED' : lessonStarted ? 'IN_PROGRESS' : 'NOT_STARTED',
        assessmentAttemptCount: assessmentAttempts.length,
        feedback: latestFeedback
          ? {
              rating: latestFeedback.rating,
              comment: latestFeedback.comment,
              submittedAt: latestFeedback.submittedAt.toISOString(),
              question: latestFeedback.prompt.question,
            }
          : null,
      };
    });
    const totalStudents = students.length;
    const completedCount = students.filter((student) => student.status === 'COMPLETED').length;
    const inProgressCount = students.filter((student) => student.analyticsStatus === 'STILL_LEARNING').length;
    const notStartedCount = students.filter((student) => student.status === 'NOT_STARTED').length;
    const readyForAssessmentCount = students.filter((student) => student.status === 'READY_FOR_ASSESSMENT').length;
    const inReviewCount = students.filter((student) => student.status === 'IN_REVIEW').length;
    const lockedCount = students.filter((student) => student.status === 'LOCKED').length;
    // Assessment averages describe demonstrated proficiency, so exclude scores
    // from students who have not completed the badge/assessment yet.
    const scoredStudents = students.filter(
      (student) => student.analyticsStatus === 'PROFICIENT' && typeof student.progress?.score === 'number'
    );
    const averageScore =
      scoredStudents.length > 0
        ? Math.round(
            scoredStudents.reduce((sum, student) => sum + (student.progress?.score ?? 0), 0) / scoredStudents.length
          )
        : null;
    const videoInProgressCount = students.filter(
      (student) => student.stillLearningReason === 'VIDEO_IN_PROGRESS'
    ).length;
    const videoCompletedOnlyCount = students.filter(
      (student) => student.stillLearningReason === 'VIDEO_COMPLETED_ONLY'
    ).length;
    const inPersonFailedCount = students.filter((student) => student.stillLearningReason === 'IN_PERSON_FAILED').length;
    const feedbackRows = students.flatMap((student) => (student.feedback ? [student.feedback] : []));
    const averageRating =
      feedbackRows.length > 0
        ? Math.round((feedbackRows.reduce((sum, response) => sum + response.rating, 0) / feedbackRows.length) * 10) / 10
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
          inReviewCount,
          lockedCount,
          completedPercent: calculatePercent(completedCount, totalStudents),
          inProgressPercent: calculatePercent(inProgressCount, totalStudents),
          notStartedPercent: calculatePercent(notStartedCount, totalStudents),
          readyForAssessmentPercent: calculatePercent(readyForAssessmentCount, totalStudents),
          inReviewPercent: calculatePercent(inReviewCount, totalStudents),
          lockedPercent: calculatePercent(lockedCount, totalStudents),
          averageScore,
          videoInProgressCount,
          videoCompletedOnlyCount,
          inPersonFailedCount,
          videoInProgressPercent: calculatePercent(videoInProgressCount, totalStudents),
          videoCompletedOnlyPercent: calculatePercent(videoCompletedOnlyCount, totalStudents),
          inPersonFailedPercent: calculatePercent(inPersonFailedCount, totalStudents),
          feedbackResponseCount: feedbackRows.length,
          averageRating,
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
