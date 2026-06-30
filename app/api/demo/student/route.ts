import { NextResponse } from 'next/server';
import {
  BadgeStatus,
  CourseContactType,
  CourseRole,
  EnrollmentStatus,
  LessonStatus,
  SegmentStatus,
  SurveyContext,
} from '@prisma/client';
import prisma from '../../../../lib/prisma';
import { normalizeCheckpointQuestion } from '../../../../lib/checkpointQuestions';
import { ensureCurrentUser } from '../../courses/lib/ensure-user';
import { syncLessonBadgesForStudent } from '../../../../lib/badgeProgress';

const SEEDED_DEMO_EMAIL = process.env.SEEDED_DEMO_EMAIL?.trim().toLowerCase() || null;
const SEEDED_DEMO_COURSE_CODE = 'CHEM101';

function isSeededDemoUser(email?: string | null) {
  return Boolean(SEEDED_DEMO_EMAIL) && email?.toLowerCase() === SEEDED_DEMO_EMAIL;
}

function avatarPathForBase(base?: string | null): string {
  switch (base) {
    case 'RUBY':
      return '/edit_avatar/ruby.svg';
    case 'EMERALD':
      return '/edit_avatar/emerald.svg';
    case 'AMETHYST':
      return '/edit_avatar/amethyst.svg';
    case 'SAPPHIRE':
    default:
      return '/edit_avatar/sapphire.svg';
  }
}

// Converts a stored "First Last" name into the "Last, First" display format the designs use.
// Names already containing a comma are assumed to be in the desired format and left as-is.
function formatLastFirst(fullName?: string | null) {
  if (!fullName) return null;
  const trimmed = fullName.trim();
  if (!trimmed) return null;
  if (trimmed.includes(',')) return trimmed;
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(' ');
  return `${last}, ${first}`;
}

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
    badgeRequirements: lesson.badgeRequirements.map((requirement) => ({
      badgeId: requirement.badge.id,
      badgeName: requirement.badge.name,
      badgeSlug: requirement.badge.slug,
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
      badgeRequirements: {
        include: {
          badge: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function GET(req: Request) {
  // Resolve (and lazily provision on first sign-in) the signed-in user, then load
  // the full record by id — avoids a second currentUser() call and an email re-query.
  const provisioned = await ensureCurrentUser();

  if (!provisioned) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // The signed-in user record and their first enrollment both depend only on
  // provisioned.id (not on each other), so fetch them concurrently rather than
  // adding two serial round-trips to Prisma Accelerate.
  const requestedCourseId = new URL(req.url).searchParams.get('courseId')?.trim() || null;

  const [student, enrollment] = await Promise.all([
    prisma.user.findUnique({
      where: { id: provisioned.id },
      include: {
        avatar: true,
        analytics: true,
      },
    }),
    prisma.enrollment.findFirst({
      where: {
        studentId: provisioned.id,
        ...(requestedCourseId ? { courseId: requestedCourseId } : {}),
        OR: [
          { role: CourseRole.STUDENT },
          ...(isSeededDemoUser(provisioned.email) ? [{ course: { code: SEEDED_DEMO_COURSE_CODE } }] : []),
        ],
      },
      include: {
        sections: true,
        course: {
          include: {
            contacts: {
              orderBy: { type: 'asc' },
            },
          },
        },
      },
    }),
  ]);

  if (!student) {
    return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  }

  // The student's own section(s) for this course (e.g. "A1"). Stored on EnrollmentSection,
  // NOT on Course.section (which is a legacy single-section field).
  const studentSections = new Set((enrollment?.sections ?? []).map((s) => s.section));
  const primarySection = enrollment?.sections[0]?.section ?? enrollment?.course.section ?? null;

  // Build the instructor + checker contact list from enrollments (the section-aware source
  // of truth) rather than CourseContact (which has no section). The query is folded into the
  // Promise.all below so it runs in parallel with the other reads instead of adding a serial
  // round-trip to Prisma Accelerate.
  const [
    courseStaff,
    courseBadges,
    lessonProgresses,
    lessons,
    initialStudentBadges,
    passingCheckpointAttempts,
    surveyResponses,
    checkpointResponses,
  ] = await Promise.all([
    enrollment
      ? prisma.enrollment.findMany({
          where: {
            courseId: enrollment.courseId,
            role: { in: [CourseRole.INSTRUCTOR, CourseRole.CHECKER] },
            // Exclude pending assessor requests — they aren't staff until approved.
            status: EnrollmentStatus.ACTIVE,
          },
          include: {
            sections: true,
            student: { select: { id: true, name: true, email: true, avatar: { select: { base: true } } } },
          },
        })
      : Promise.resolve([]),
    // Every badge attached to this course (via a lesson's badge requirement),
    // used to derive the "not yet started" group below.
    enrollment
      ? prisma.badge.findMany({
          where: { requirements: { some: { lesson: { courseId: enrollment.courseId } } } },
          select: { id: true, slug: true, name: true, description: true, category: true },
        })
      : Promise.resolve([]),
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

  const checkpointLessonIdsByCheckpointId = new Map(
    lessons.flatMap((lesson) => lesson.checkpoints.map((checkpoint) => [checkpoint.id, lesson.id] as const))
  );
  const touchedLessonIds = new Set<string>(lessonProgresses.map((progress) => progress.lessonId));

  for (const attempt of passingCheckpointAttempts) {
    const lessonId = checkpointLessonIdsByCheckpointId.get(attempt.checkpointId);
    if (lessonId) {
      touchedLessonIds.add(lessonId);
    }
  }

  for (const response of checkpointResponses) {
    const lessonId = checkpointLessonIdsByCheckpointId.get(response.checkpointId);
    if (lessonId) {
      touchedLessonIds.add(lessonId);
    }
  }

  let studentBadges = initialStudentBadges;

  if (touchedLessonIds.size > 0) {
    await prisma.$transaction(async (tx) => {
      for (const lessonId of touchedLessonIds) {
        await syncLessonBadgesForStudent(tx, { studentId: student.id, lessonId });
      }
    });

    studentBadges = await prisma.studentBadge.findMany({
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
    });
  }

  const derivedContacts = courseStaff
    .filter((staff) => {
      if (staff.role === CourseRole.INSTRUCTOR) return true;
      // CHECKER: show those sharing the student's section. If the student has no section
      // assigned, or the checker is course-wide (no sections of their own), show them too.
      if (studentSections.size === 0) return true;
      if (staff.sections.length === 0) return true;
      return staff.sections.some((s) => studentSections.has(s.section));
    })
    .map((staff) => ({
      id: staff.id,
      type: staff.role === CourseRole.INSTRUCTOR ? CourseContactType.INSTRUCTOR : CourseContactType.CHECKER,
      name: formatLastFirst(staff.student.name) ?? staff.student.email ?? 'Unknown',
      email: staff.student.email ?? '',
      avatarUrl: avatarPathForBase(staff.student.avatar?.base),
    }));

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
    const lessonSurveyRequired = lessonSurveyPromptIds.length > 0;
    const lessonSurveyComplete = !lessonSurveyRequired
      ? true
      : lessonSurveyPromptIds.every((id) => surveyPromptIdsCompleted.has(id));

    const answeredCheckpointIds = lesson.checkpoints
      .filter((cp) => (answeredQuestionsByCheckpoint.get(cp.id)?.size ?? 0) > 0 || passingCheckpointIds.has(cp.id))
      .map((cp) => cp.id);
    const lastActiveCheckpoint = [...lesson.checkpoints]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((cp) => answeredQuestionsByCheckpoint.get(cp.id)?.size || passingCheckpointIds.has(cp.id))
      .at(-1);
    const resumeTimeSeconds = lastActiveCheckpoint ? (lastActiveCheckpoint.timeOffsetSeconds ?? 0) + 1 : 0;

    const lessonProgress = progressByLessonId.get(lesson.id);
    const gradedPassed = lessonProgress?.lastGradePassed === true;
    const formatted = formatLesson({
      lesson,
      progress: lessonProgress
        ? {
            ...lessonProgress,
            status: gradedPassed
              ? LessonStatus.COMPLETED
              : allCheckpointsPassed && lessonSurveyComplete
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
    const basePercentComplete = totalUnits > 0 ? Math.min(100, Math.round((completedUnits / totalUnits) * 100)) : 0;
    const percentComplete = gradedPassed ? 100 : basePercentComplete;

    const formattedWithProgress = {
      ...formatted,
      percentComplete,
    };

    // If all checkpoints passed but lesson survey unfinished, cap percentComplete at 99 and keep IN_PROGRESS
    if (!gradedPassed && allCheckpointsPassed && !lessonSurveyComplete) {
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
      return true;
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

  // "Not yet started" = course badges the student has no StudentBadge row for yet.
  const studentBadgeIds = new Set(studentBadges.map((sb) => sb.badgeId));
  const notStartedBadges = courseBadges
    .filter((badge) => !studentBadgeIds.has(badge.id))
    .map((badge) => ({
      id: badge.id,
      slug: badge.slug,
      name: badge.name,
      description: badge.description,
      category: badge.category,
      status: 'NOT_STARTED' as const,
      awardedAt: null,
      score: null,
      requirements: [] as Array<{ summary: string | null; lessonSlug: string | null; lessonTitle: string | null }>,
    }));

  const lessonSurveyPrompts = surveyPrompts
    .filter((prompt) => prompt.context === SurveyContext.LESSON)
    .map((prompt) => ({
      id: prompt.id,
      question: prompt.question,
      lessonSlug: prompt.lesson?.slug ?? null,
      lessonTitle: prompt.lesson?.title ?? null,
      completed: surveyPromptIdsCompleted.has(prompt.id),
    }));

  const badgeSurveyPrompts = surveyPrompts
    .filter((prompt) => prompt.context === SurveyContext.BADGE)
    .map((prompt) => ({
      id: prompt.id,
      question: prompt.question,
      badgeSlug: prompt.badge?.slug ?? null,
      badgeName: prompt.badge?.name ?? null,
      badgeId: prompt.badgeId ?? null,
      completed: surveyPromptIdsCompleted.has(prompt.id),
    }));

  // Only surface a badge survey once the student's badge is actually READY_FOR_FINALIZATION.
  // The finalize route (POST /api/badges/[badgeId]/survey) rejects any other status with 409,
  // so showing the survey earlier produced a prompt that could never be submitted — and thus
  // never recorded as complete, causing it to keep reappearing.
  const finalizationReadyBadgeIds = new Set(
    normalizedStudentBadges
      .filter((badge) => badge.status === BadgeStatus.READY_FOR_FINALIZATION)
      .map((badge) => badge.badgeId)
  );

  const pendingBadgeSurveys = badgeSurveyPrompts
    .filter(
      (prompt) =>
        prompt.badgeId && finalizationReadyBadgeIds.has(prompt.badgeId) && !surveyPromptIdsCompleted.has(prompt.id)
    )
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
          section: primarySection,
          title: enrollment.course.title,
          description: enrollment.course.description,
          contacts: derivedContacts,
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
      notStarted: notStartedBadges,
    },
    surveys: {
      lesson: lessonSurveyPrompts,
      badge: badgeSurveyPrompts,
      pendingBadge: pendingBadgeSurveys,
    },
  });
}
