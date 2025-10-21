import { NextResponse } from 'next/server';
import { BadgeStatus, LessonStatus, SegmentStatus, SurveyContext } from '@prisma/client';
import prisma from '../../../../lib/prisma';

function groupBadgesByStatus(badges: Array<ReturnType<typeof formatBadge>>) {
  return badges.reduce(
    (acc, badge) => {
      acc[badge.status].push(badge);
      return acc;
    },
    {
      [BadgeStatus.COMPLETED]: [] as ReturnType<typeof formatBadge>[],
      [BadgeStatus.READY_FOR_ASSESSMENT]: [] as ReturnType<typeof formatBadge>[],
      [BadgeStatus.LEARNING]: [] as ReturnType<typeof formatBadge>[],
    }
  );
}

function formatBadge(studentBadge: {
  id: string;
  status: BadgeStatus;
  score: number | null;
  awardedAt: Date | null;
  badge: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    category: string | null;
    requirements: Array<{
      lessonId: string | null;
      summary: string | null;
      lesson: { slug: string; title: string } | null;
    }>;
  };
}) {
  return {
    id: studentBadge.badge.id,
    slug: studentBadge.badge.slug,
    name: studentBadge.badge.name,
    description: studentBadge.badge.description,
    category: studentBadge.badge.category,
    status: studentBadge.status,
    awardedAt: studentBadge.awardedAt?.toISOString() ?? null,
    score: studentBadge.score ?? null,
    requirements: studentBadge.badge.requirements.map((requirement) => ({
      summary: requirement.summary,
      lessonSlug: requirement.lesson?.slug ?? null,
      lessonTitle: requirement.lesson?.title ?? null,
    })),
  };
}

function formatLesson({
  lesson,
  progress,
}: {
  lesson: Awaited<ReturnType<typeof fetchLessons>>[number];
  progress?: Awaited<ReturnType<typeof fetchLessonProgress>> extends Array<infer T> ? T : never;
}) {
  const segmentStatusMap = new Map<string, SegmentStatus>();
  if (progress) {
    for (const segmentProgress of progress.segments) {
      segmentStatusMap.set(segmentProgress.segmentId, segmentProgress.status);
    }
  }

  const checkpointsBySegment = lesson.checkpoints.reduce<Record<string, string[]>>((acc, checkpoint) => {
    if (checkpoint.segmentId) {
      acc[checkpoint.segmentId] = acc[checkpoint.segmentId] ?? [];
      acc[checkpoint.segmentId].push(checkpoint.id);
    }
    return acc;
  }, {});

  return {
    id: lesson.id,
    slug: lesson.slug,
    title: lesson.title,
    summary: lesson.summary,
    description: lesson.description,
    thumbnailUrl: lesson.thumbnailUrl,
    estimatedMinutes: lesson.estimatedMinutes,
    dueDate: lesson.dueDate?.toISOString() ?? null,
    sortOrder: lesson.sortOrder,
    status: progress?.status ?? LessonStatus.NOT_STARTED,
    percentComplete: progress?.percentComplete ?? 0,
    segments: lesson.segments.map((segment) => ({
      id: segment.id,
      title: segment.title,
      summary: segment.summary,
      duration: segment.duration,
      videoUrl: segment.videoUrl,
      muxPlaybackId: segment.muxPlaybackId,
      thumbnailUrl: segment.thumbnailUrl,
      status: segmentStatusMap.get(segment.id) ?? SegmentStatus.NOT_STARTED,
      checkpointIds: checkpointsBySegment[segment.id] ?? [],
    })),
    checkpoints: lesson.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      title: checkpoint.title,
      label: checkpoint.label,
      meta: checkpoint.meta,
      description: checkpoint.description,
      questionCount: checkpoint.questionCount,
      segmentId: checkpoint.segmentId,
      timeOffsetSeconds: checkpoint.timeOffsetSeconds,
      snapshotUrl: checkpoint.snapshotUrl,
      questions: checkpoint.questions.map((question) => ({
        id: question.id,
        prompt: question.prompt,
        options: question.options,
        correctIndex: question.correctIndex,
      })),
    })),
    skills: lesson.skills.map((skill) => skill.text),
  };
}

async function fetchLessonProgress(studentId: string) {
  return prisma.lessonProgress.findMany({
    where: { studentId },
    include: {
      segments: true,
    },
  });
}

async function fetchLessons(courseId: string) {
  return prisma.lesson.findMany({
    where: { courseId },
    include: {
      segments: {
        orderBy: { sortOrder: 'asc' },
      },
      checkpoints: {
        orderBy: { sortOrder: 'asc' },
        include: {
          questions: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
      skills: {
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email')?.toLowerCase();

  if (!email) {
    return NextResponse.json({ error: 'Missing email query parameter.' }, { status: 400 });
  }

  const student = await prisma.user.findUnique({
    where: { email },
    include: {
      avatar: true,
      analytics: true,
    },
  });

  if (!student) {
    return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId: student.id },
    include: {
      course: {
        include: {
          contacts: {
            orderBy: { type: 'asc' },
          },
        },
      },
    },
  });

  const [lessonProgresses, lessons, studentBadges] = await Promise.all([
    fetchLessonProgress(student.id),
    enrollment ? fetchLessons(enrollment.courseId) : Promise.resolve([]),
    prisma.studentBadge.findMany({
      where: { studentId: student.id },
      include: {
        badge: {
          include: {
            requirements: {
              include: {
                lesson: {
                  select: { slug: true, title: true },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const surveyPrompts = await prisma.surveyPrompt.findMany({
    where: {
      OR: [
        { lessonId: { in: lessons.map((lesson) => lesson.id) } },
        { badgeId: { in: studentBadges.map((badge) => badge.badgeId) } },
      ],
    },
    include: {
      lesson: { select: { slug: true, title: true } },
      badge: { select: { slug: true, name: true } },
    },
  });

  const progressByLessonId = new Map(lessonProgresses.map((progress) => [progress.lessonId, progress]));
  const lessonCatalog = lessons.map((lesson) => formatLesson({ lesson, progress: progressByLessonId.get(lesson.id) }));

  const upNextLessons = lessonCatalog
    .filter((lesson) => lesson.status === LessonStatus.NOT_STARTED)
    .sort((a, b) => (a.dueDate && b.dueDate ? Date.parse(a.dueDate) - Date.parse(b.dueDate) : 0));

  const continueLessons = lessonCatalog
    .filter((lesson) => lesson.status === LessonStatus.IN_PROGRESS)
    .sort((a, b) => (a.dueDate && b.dueDate ? Date.parse(a.dueDate) - Date.parse(b.dueDate) : 0));

  const badgeGroups = groupBadgesByStatus(studentBadges.map(formatBadge));

  const lessonSurveyPrompts = surveyPrompts
    .filter((prompt) => prompt.context === SurveyContext.LESSON)
    .map((prompt) => ({
      id: prompt.id,
      question: prompt.question,
      lessonSlug: prompt.lesson?.slug ?? null,
      lessonTitle: prompt.lesson?.title ?? null,
    }));

  const badgeSurveyPrompts = surveyPrompts
    .filter((prompt) => prompt.context === SurveyContext.BADGE)
    .map((prompt) => ({
      id: prompt.id,
      question: prompt.question,
      badgeSlug: prompt.badge?.slug ?? null,
      badgeName: prompt.badge?.name ?? null,
    }));

  return NextResponse.json({
    student: {
      id: student.id,
      name: student.name,
      email: student.email,
      buid: student.buid,
      gender: student.gender,
      raceEthnicity: student.raceEthnicity,
      parentalEducation: student.parentalEducation,
      pellGrantQualified: student.pellGrantQualified,
      createdAt: student.createdAt.toISOString(),
      avatar: student.avatar
        ? {
            base: student.avatar.base,
            face: student.avatar.face,
            accessory: student.avatar.accessory,
          }
        : null,
    },
    course: enrollment
      ? {
          id: enrollment.course.id,
          code: enrollment.course.code,
          section: enrollment.course.section,
          title: enrollment.course.title,
          description: enrollment.course.description,
          contacts: enrollment.course.contacts.map((contact) => ({
            id: contact.id,
            type: contact.type,
            name: contact.name,
            email: contact.email,
            avatarUrl: contact.avatarUrl,
          })),
        }
      : null,
    analytics: student.analytics
      ? {
          hoursLearning: student.analytics.hoursLearning,
          badgesCompleted: student.analytics.badgesCompleted,
          badgesReadyForAssessment: student.analytics.badgesReadyForAssessment,
          badgesNotAttempted: student.analytics.badgesNotAttempted,
          questionsAnswered: student.analytics.questionsAnswered,
          averageAssessmentScore: student.analytics.averageAssessmentScore,
          highestAssessmentScore: student.analytics.highestAssessmentScore,
        }
      : null,
    lessons: {
      catalog: lessonCatalog,
      upNext: upNextLessons,
      inProgress: continueLessons,
    },
    badges: {
      completed: badgeGroups[BadgeStatus.COMPLETED],
      readyForAssessment: badgeGroups[BadgeStatus.READY_FOR_ASSESSMENT],
      learning: badgeGroups[BadgeStatus.LEARNING],
    },
    surveys: {
      lesson: lessonSurveyPrompts,
      badge: badgeSurveyPrompts,
    },
  });
}
