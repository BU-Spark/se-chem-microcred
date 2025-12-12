import { NextResponse } from 'next/server';
import { BadgeStatus, LessonStatus, SegmentStatus, SurveyContext } from '@prisma/client';
import prisma from '../../../../lib/prisma';
import { normalizeCheckpointQuestion } from '../../../../lib/checkpointQuestions';

function groupBadgesByStatus(badges: Array<ReturnType<typeof formatBadge>>) {
  return badges.reduce(
    (acc, badge) => {
      acc[badge.status].push(badge);
      return acc;
    },
    {
      [BadgeStatus.COMPLETED]: [] as ReturnType<typeof formatBadge>[],
      [BadgeStatus.READY_FOR_ASSESSMENT]: [] as ReturnType<typeof formatBadge>[],
      [BadgeStatus.READY_FOR_FINALIZATION]: [] as ReturnType<typeof formatBadge>[],
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
  completedCheckpointIds = [],
  resumeTimeSeconds = 0,
  answeredCount = 0,
  answeredCheckpointIds = [],
  lastGradePercent = null,
  lastGradePassed = null,
  lastGradedAt = null,
}: {
  lesson: Awaited<ReturnType<typeof fetchLessons>>[number];
  progress?: Awaited<ReturnType<typeof fetchLessonProgress>> extends Array<infer T> ? T : never;
  completedCheckpointIds?: string[];
  resumeTimeSeconds?: number;
  answeredCount?: number;
  answeredCheckpointIds?: string[];
  lastGradePercent?: number | null;
  lastGradePassed?: boolean | null;
  lastGradedAt?: Date | null;
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

  let derivedStatus = progress?.status ?? LessonStatus.NOT_STARTED;
  if (derivedStatus !== LessonStatus.COMPLETED && (answeredCount > 0 || lastGradePassed === false)) {
    derivedStatus = LessonStatus.IN_PROGRESS;
  }

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
    passingPercent: lesson.passingPercent,
    status: derivedStatus,
    percentComplete: 0, // placeholder; recomputed later with checkpoints + survey
    completedCheckpointIds,
    resumeTimeSeconds,
    answeredCheckpointIds,
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
      questions: checkpoint.questions.map((question) => normalizeCheckpointQuestion(question)),
    })),
    skills: lesson.skills.map((skill) => skill.text),
    lastGradePercent: lastGradePercent ?? null,
    lastGradePassed: lastGradePassed ?? null,
    lastGradedAt: lastGradedAt ? lastGradedAt.toISOString() : null,
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

import { currentUser } from '@clerk/nextjs/server';

export async function GET() {
  const user = await currentUser();

  if (!user || !user.emailAddresses?.[0]) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = user.emailAddresses[0].emailAddress.toLowerCase();

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

  const [lessonProgresses, lessons, studentBadges, passingCheckpointAttempts, surveyResponses, checkpointResponses] =
    await Promise.all([
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
      prisma.checkpointAttempt.findMany({
        where: {
          userId: student.id,
          isPassing: true,
        },
        select: {
          checkpointId: true,
        },
      }),
      prisma.surveyResponse.findMany({
        where: {
          studentId: student.id,
        },
        select: {
          promptId: true,
        },
      }),
      prisma.checkpointResponse.findMany({
        where: { studentId: student.id },
        select: {
          checkpointId: true,
          questionId: true,
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
      badge: { select: { id: true, slug: true, name: true } },
    },
  });

  const badgeSurveyPromptMap = surveyPrompts.reduce<Map<string, string[]>>((acc, prompt) => {
    if (prompt.context === SurveyContext.BADGE && prompt.badgeId) {
      const list = acc.get(prompt.badgeId) ?? [];
      list.push(prompt.id);
      acc.set(prompt.badgeId, list);
    }
    return acc;
  }, new Map());
  const lessonSurveyPromptMap = surveyPrompts.reduce<Map<string, string[]>>((acc, prompt) => {
    if (prompt.context === SurveyContext.LESSON && prompt.lessonId) {
      const list = acc.get(prompt.lessonId) ?? [];
      list.push(prompt.id);
      acc.set(prompt.lessonId, list);
    }
    return acc;
  }, new Map());

  const progressByLessonId = new Map(lessonProgresses.map((progress) => [progress.lessonId, progress]));
  const surveyPromptIdsCompleted = new Set(surveyResponses.map((response) => response.promptId));
  const passingCheckpointIds = new Set(passingCheckpointAttempts.map((attempt) => attempt.checkpointId));
  const checkpointsByLessonId = new Map<string, string[]>(
    lessons.map((lesson) => [lesson.id, lesson.checkpoints.map((checkpoint) => checkpoint.id)])
  );
  const answeredQuestionsByCheckpoint = checkpointResponses.reduce<Map<string, Set<string>>>((acc, response) => {
    if (!response.questionId) {
      return acc;
    }
    const set = acc.get(response.checkpointId) ?? new Set<string>();
    set.add(response.questionId);
    acc.set(response.checkpointId, set);
    return acc;
  }, new Map());

  const lessonCatalog = lessons.map((lesson) => {
    const answeredCount = lesson.checkpoints.reduce((sum, cp) => {
      const answeredSet = answeredQuestionsByCheckpoint.get(cp.id);
      return sum + (answeredSet ? Math.min(answeredSet.size, cp.questions.length) : 0);
    }, 0);
    const allCheckpointsPassed =
      lesson.checkpoints.length === 0 ||
      lesson.checkpoints.every((checkpoint) => passingCheckpointIds.has(checkpoint.id));
    const completedCheckpointIds = lesson.checkpoints
      .filter((checkpoint) => passingCheckpointIds.has(checkpoint.id))
      .map((checkpoint) => checkpoint.id);
    const lessonSurveyPromptIds = lessonSurveyPromptMap.get(lesson.id) ?? [];
    const lessonSurveyRequired = true; // surveys are always enabled in the demo
    const lessonSurveyComplete =
      lessonSurveyPromptIds.length > 0 ? lessonSurveyPromptIds.every((id) => surveyPromptIdsCompleted.has(id)) : false;

    const answeredCheckpointIds = lesson.checkpoints
      .filter((cp) => (answeredQuestionsByCheckpoint.get(cp.id)?.size ?? 0) > 0 || passingCheckpointIds.has(cp.id))
      .map((cp) => cp.id);
    const lastActiveCheckpoint = [...lesson.checkpoints]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((cp) => answeredQuestionsByCheckpoint.get(cp.id)?.size || passingCheckpointIds.has(cp.id))
      .at(-1);
    const resumeTimeSeconds = lastActiveCheckpoint ? (lastActiveCheckpoint.timeOffsetSeconds ?? 0) + 1 : 0;

    const lessonProgress = progressByLessonId.get(lesson.id);
    const formatted = formatLesson({
      lesson,
      progress: lessonProgress
        ? {
            ...lessonProgress,
            status:
              allCheckpointsPassed && lessonSurveyComplete
                ? LessonStatus.COMPLETED
                : answeredCount > 0
                  ? LessonStatus.IN_PROGRESS
                  : LessonStatus.NOT_STARTED,
          }
        : undefined,
      completedCheckpointIds,
      resumeTimeSeconds:
        allCheckpointsPassed && !lessonSurveyComplete
          ? (lesson.checkpoints.at(-1)?.timeOffsetSeconds ?? 0) + 1
          : resumeTimeSeconds,
      answeredCount,
      answeredCheckpointIds,
      lastGradePercent: lessonProgress?.lastGradePercent ?? null,
      lastGradePassed: lessonProgress?.lastGradePassed ?? null,
      lastGradedAt: lessonProgress?.lastGradedAt ?? null,
    });

    // Recompute percentComplete based on passed checkpoints + lesson survey
    const totalUnits = lesson.checkpoints.length + (lessonSurveyRequired ? 1 : 0);
    const completedUnits = completedCheckpointIds.length + (lessonSurveyRequired && lessonSurveyComplete ? 1 : 0);
    const percentComplete = totalUnits > 0 ? Math.min(100, Math.round((completedUnits / totalUnits) * 100)) : 0;

    const formattedWithProgress = {
      ...formatted,
      percentComplete,
    };

    // If all checkpoints passed but lesson survey unfinished, cap percentComplete at 99 and keep IN_PROGRESS
    if (allCheckpointsPassed && !lessonSurveyComplete) {
      return {
        ...formattedWithProgress,
        status: LessonStatus.IN_PROGRESS,
        percentComplete: Math.min(99, percentComplete || 99),
      };
    }

    return formattedWithProgress;
  });

  const upNextLessons = lessonCatalog
    .filter((lesson) => lesson.status === LessonStatus.NOT_STARTED)
    .sort((a, b) => (a.dueDate && b.dueDate ? Date.parse(a.dueDate) - Date.parse(b.dueDate) : 0));

  const continueLessons = lessonCatalog
    .filter((lesson) => lesson.status === LessonStatus.IN_PROGRESS)
    .sort((a, b) => (a.dueDate && b.dueDate ? Date.parse(a.dueDate) - Date.parse(b.dueDate) : 0));

  const normalizedStudentBadges = studentBadges.map((entry) => {
    const requirementLessonIds = entry.badge.requirements
      .map((requirement) => requirement.lessonId)
      .filter((lessonId): lessonId is string => Boolean(lessonId));

    if (requirementLessonIds.length === 0) {
      return entry;
    }

    const hasInProgressRequirement = requirementLessonIds.some((lessonId) => {
      const progress = progressByLessonId.get(lessonId);
      return progress?.status === LessonStatus.IN_PROGRESS;
    });

    const allRequirementsCompleted = requirementLessonIds.every((lessonId) => {
      const progress = progressByLessonId.get(lessonId);
      if (!progress || progress.status !== LessonStatus.COMPLETED) {
        return false;
      }

      const checkpointIds = checkpointsByLessonId.get(lessonId) ?? [];
      if (checkpointIds.length === 0) {
        return true;
      }

      return checkpointIds.every((checkpointId) => passingCheckpointIds.has(checkpointId));
    });

    let status = entry.status;

    if (status === BadgeStatus.LEARNING) {
      if (hasInProgressRequirement) {
        status = BadgeStatus.LEARNING;
      } else if (allRequirementsCompleted) {
        status = BadgeStatus.READY_FOR_ASSESSMENT;
      }
    }

    if (status === BadgeStatus.READY_FOR_ASSESSMENT && allRequirementsCompleted && !hasInProgressRequirement) {
      status = BadgeStatus.READY_FOR_ASSESSMENT;
    }

    if (status === BadgeStatus.READY_FOR_FINALIZATION) {
      const promptIds = badgeSurveyPromptMap.get(entry.badgeId) ?? [];
      const surveyComplete = promptIds.length > 0 && promptIds.every((id) => surveyPromptIdsCompleted.has(id));
      if (surveyComplete) {
        status = BadgeStatus.COMPLETED;
      }
    }

    return status === entry.status
      ? entry
      : {
          ...entry,
          status,
        };
  });

  const badgeGroups = groupBadgesByStatus(normalizedStudentBadges.map(formatBadge));

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
      badgeId: prompt.badgeId ?? null,
    }));

  const pendingBadgeSurveys = badgeSurveyPrompts
    .filter((prompt) => prompt.badgeId && !surveyPromptIdsCompleted.has(prompt.id))
    .map((prompt) => ({
      promptId: prompt.id,
      badgeId: prompt.badgeId as string,
      badgeSlug: prompt.badgeSlug,
      badgeName: prompt.badgeName,
      question: prompt.question,
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
            avatarUrl: contact.avatarUrl ?? null,
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
      readyForFinalization: badgeGroups[BadgeStatus.READY_FOR_FINALIZATION],
      learning: badgeGroups[BadgeStatus.LEARNING],
    },
    surveys: {
      lesson: lessonSurveyPrompts,
      badge: badgeSurveyPrompts,
      pendingBadge: pendingBadgeSurveys,
    },
  });
}
