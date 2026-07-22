import { CheckpointPayload, CheckpointQuestionPayload } from '@/lib/checkpoints/types';
import { RubricGoalPayload } from '@/lib/rubric/types';
import { hasVisibleQuestionText, sanitizeQuestionRichText } from '@/lib/question-rich-text';
import { extractYouTubeId } from '@/lib/video';
import { BadgeStatus, CourseRole, Prisma, SurveyContext } from '@prisma/client';
import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import {
  normalizeCorrectIndices,
  normalizeOptions,
  normalizeRichText,
  normalizeString,
  buildQuestionOptions,
} from '@/lib/checkpoints/normalizeWrite';
import { parseFiniteNumber, parseTimeToSeconds, slugify, formatQuestionCount } from '@/lib/utils';

// --Constants--
const DEFAULT_PASSING_PERCENT = 70;

// --Helper Functions--
function getQuestionPrompt(question: CheckpointQuestionPayload) {
  const value = question.question ?? question.prompt;
  return hasVisibleQuestionText(value) ? sanitizeQuestionRichText(value) : null;
}

function buildCheckpointQuestionsWithSummary(checkpoint: CheckpointPayload) {
  const rawQuestions =
    Array.isArray(checkpoint.questions) && checkpoint.questions.length > 0 ? checkpoint.questions : [checkpoint];

  return rawQuestions
    .map((question, questionIndex) => {
      const prompt = getQuestionPrompt(question);
      const questionType = question.questionType === 'shortAnswer' ? 'shortAnswer' : 'multipleChoice';
      const options = questionType === 'multipleChoice' ? normalizeOptions(question.options) : [];
      return {
        sortOrder: questionIndex,
        prompt,
        questionOptions: buildQuestionOptions(question),
        summary: {
          number: questionIndex + 1,
          question: prompt,
          questionType,
          options,
          correctIndices: questionType === 'multipleChoice' ? normalizeCorrectIndices(question, options.length) : [],
          numericAnswer: parseFiniteNumber(question.numericAnswer),
          numericRangeMin: parseFiniteNumber(question.numericRangeMin),
          numericRangeMax: parseFiniteNumber(question.numericRangeMax),
          unit: normalizeString(question.unit),
          incorrectFeedback: normalizeString(question.incorrectFeedback),
          incorrectFeedbackEnabled: Boolean(normalizeString(question.incorrectFeedback)),
        },
      };
    })
    .filter((question) => Boolean(question.prompt));
}

function normalizePoints(value: number | string | null | undefined, fallback: number) {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

// Lesson passing threshold: percent of checkpoint questions a student must get
// correct to pass the lesson. Clamped to 0–100, defaults to the schema default.

export function normalizePassingPercent(value: number | string | null | undefined) {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return DEFAULT_PASSING_PERCENT;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

// Prisma-ready authored assessment policy stored on the Badge. An omitted field
// stays out of the write entirely (keeping the column at its existing value).
export type BadgePolicy = {
  reassessmentLimit?: number;
  cooldownDays?: number;
  reassessmentRequired?: boolean;
};

// Authored assessment-policy defaults stored on the Badge. Mirrors the clamps the
// per-student override route applies (reassessmentLimit >= 0, cooldownDays 0–14).
export function normalizeBadgePolicy(payload: {
  reassessmentLimit?: number | string | null;
  cooldownDays?: number | string | null;
  reassessmentRequired?: boolean | null;
}): BadgePolicy {
  const data: BadgePolicy = {};

  const limit = parseFiniteNumber(payload.reassessmentLimit);
  if (limit !== null) {
    data.reassessmentLimit = Math.max(0, Math.round(limit));
  }

  const cooldown = parseFiniteNumber(payload.cooldownDays);
  if (cooldown !== null) {
    data.cooldownDays = Math.min(14, Math.max(0, Math.round(cooldown)));
  }

  if (typeof payload.reassessmentRequired === 'boolean') {
    data.reassessmentRequired = payload.reassessmentRequired;
  }

  return data;
}

// The rubric is one goal (named after the badge) with subgoals, each holding
// point-weighted tasks. A subgoal's passThreshold is clamped to the sum of its
// task weights and defaults to that full sum (every task required) when omitted.
// Tasks with no text are dropped; a subgoal survives if it has a title or any task.
export function normalizeRubricGoal(goal?: RubricGoalPayload | null) {
  const name = normalizeString(goal?.name);
  const instructions = normalizeRichText(goal?.taInstructions);
  const subgoals = (goal?.subgoals ?? [])
    .map((subgoal) => {
      const tasks = (subgoal.tasks ?? [])
        .map((task) => ({
          text: normalizeString(task.text),
          points: normalizePoints(task.points, 1),
        }))
        .filter((task): task is { text: string; points: number } => Boolean(task.text))
        .map((task, index) => ({ ...task, sortOrder: index }));
      const taskPointsTotal = tasks.reduce((sum, task) => sum + task.points, 0);
      return {
        text: normalizeString(subgoal.text),
        passThreshold: Math.min(taskPointsTotal, normalizePoints(subgoal.passThreshold, taskPointsTotal)),
        tasks,
      };
    })
    .filter((subgoal) => Boolean(subgoal.text) || subgoal.tasks.length > 0)
    .map((subgoal, index) => ({
      text: subgoal.text ?? 'Subgoal',
      passThreshold: subgoal.passThreshold,
      sortOrder: index,
      tasks: subgoal.tasks,
    }));

  if (!name && subgoals.length === 0 && !instructions) {
    return null;
  }

  return {
    name: name ?? 'Rubric goal',
    instructions,
    subgoals,
  };
}

type NormalizedRubricGoal = ReturnType<typeof normalizeRubricGoal>;

// Make a badge's rubric rows match `goal` (create, replace subgoals, or remove
// entirely). Used for the source badge, its course copies, and family sync.
async function syncBadgeRubricGoal(tx: Prisma.TransactionClient, badgeId: string, goal: NormalizedRubricGoal) {
  if (!goal) {
    await tx.rubricGoal.deleteMany({ where: { badgeId } });
    return;
  }

  const savedGoal = await tx.rubricGoal.upsert({
    where: { badgeId },
    create: {
      badgeId,
      name: goal.name,
      instructions: goal.instructions,
    },
    update: {
      name: goal.name,
      instructions: goal.instructions,
    },
    select: { id: true },
  });

  // Replace all subgoals + tasks. Deleting subgoals cascades to their tasks;
  // past assessment responses keep their snapshots (AssessmentTaskResponse.taskId
  // is SetNull), so recreating these rows is safe for attempt history.
  await tx.rubricSubgoal.deleteMany({ where: { goalId: savedGoal.id } });

  for (const subgoal of goal.subgoals) {
    await tx.rubricSubgoal.create({
      data: {
        goalId: savedGoal.id,
        text: subgoal.text,
        passThreshold: subgoal.passThreshold,
        sortOrder: subgoal.sortOrder,
        tasks: {
          create: subgoal.tasks.map((task) => ({
            text: task.text,
            points: task.points,
            sortOrder: task.sortOrder,
          })),
        },
      },
    });
  }
}

function buildRequirementSummary({
  badgeName,
  lessonTitle,
  skills,
  checkpoints,
  youtubeUrl,
  videoTitle,
  videoLength,
  passingPercent,
}: {
  badgeName: string;
  lessonTitle?: string | null;
  skills: string[];
  checkpoints: CheckpointPayload[];
  youtubeUrl?: string | null;
  videoTitle?: string | null;
  videoLength?: string | null;
  passingPercent?: number | null;
}) {
  // The rubric lives in the RubricGoal/RubricSubgoal/RubricTask tables;
  // the summary only carries the non-rubric payload.
  return JSON.stringify({
    version: 3,
    badgeName,
    lessonTitle: lessonTitle ?? null,
    skills,
    // The lesson video and passing threshold round-trip through the summary JSON so
    // the editor (which only ever loads the source badge — whose requirement has no
    // lesson row) can rehydrate them, and so importing into a course carries them
    // forward. See badgeToDraft, the import route, and the PATCH segment propagation.
    youtubeUrl: youtubeUrl ?? null,
    videoTitle: videoTitle ?? null,
    videoLength: videoLength ?? null,
    passingPercent: passingPercent ?? null,
    checkpoints: checkpoints
      .map((checkpoint, index) => {
        const questions = buildCheckpointQuestionsWithSummary(checkpoint).map((question) => question.summary);
        const firstQuestion = questions[0];
        return {
          number: index + 1,
          title: normalizeString(checkpoint.title) ?? `Checkpoint ${index + 1}`,
          time: normalizeString(checkpoint.time),
          points: Number(checkpoint.points) || 0,
          question: firstQuestion?.question ?? null,
          questionType: firstQuestion?.questionType ?? 'multipleChoice',
          segmentLabel: normalizeString(checkpoint.segmentLabel),
          options: firstQuestion?.options ?? [],
          correctIndices: firstQuestion?.correctIndices ?? [],
          numericAnswer: firstQuestion?.numericAnswer ?? null,
          numericRangeMin: firstQuestion?.numericRangeMin ?? null,
          numericRangeMax: firstQuestion?.numericRangeMax ?? null,
          unit: firstQuestion?.unit ?? null,
          incorrectFeedback: firstQuestion?.incorrectFeedback ?? null,
          incorrectFeedbackEnabled: Boolean(firstQuestion?.incorrectFeedback),
          questions,
        };
      })
      .filter((checkpoint) => checkpoint.questions.length > 0),
  });
}
export { parseRequirementSummary } from '@/lib/badges/requirement-summary';

// --Get Badge Args--
export interface FetchBadgesArgs {
  creatorId: string;
  requestedBadgeId: string | null;
}

// --Get Badges--

export async function executeFetchBadges(args: FetchBadgesArgs) {
  const { creatorId, requestedBadgeId } = args;

  const badges = await prisma.badge.findMany({
    where: requestedBadgeId
      ? { id: requestedBadgeId, createdById: creatorId }
      : { sourceBadgeId: null, OR: [{ createdById: creatorId }, { createdById: null }] },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      availableOn: true,
      closesOn: true,
      neverCloses: true,
      // Authored assessment policy — the editor rehydrates these; omitting them
      // made the form fall back to defaults (0/0/false) and overwrite the DB on save.
      reassessmentLimit: true,
      cooldownDays: true,
      reassessmentRequired: true,
      createdAt: true,
      rubricGoal: {
        select: {
          id: true,
          name: true,
          instructions: true,
          subgoals: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              text: true,
              passThreshold: true,
              sortOrder: true,
              tasks: {
                orderBy: { sortOrder: 'asc' },
                select: { id: true, text: true, points: true, sortOrder: true },
              },
            },
          },
        },
      },
      requirements: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          summary: true,
          lesson: {
            select: {
              id: true,
              title: true,
              description: true,
              dueDate: true,
              estimatedMinutes: true,
              passingPercent: true,
              segments: {
                orderBy: { sortOrder: 'asc' },
                take: 1,
                select: {
                  title: true,
                  duration: true,
                  videoUrl: true,
                },
              },
              course: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
        },
      },
      _count: {
        select: {
          studentProgress: true,
        },
      },
    },
  });

  return badges;
}
// --Badge Creation Args--

export interface CreateBadgeArgs {
  creatorId: string;
  courseId: string | null;
  badgeName: string;
  badgeDescription: string | null;
  videoTitle: string | null;
  youtubeVideoUrl: string | null;
  checkpoints: CheckpointPayload[];
  skills: string[];
  rubricGoal: NormalizedRubricGoal;
  passingPercentage: number;
  neverCloses: boolean | null;
  availableOn: Date | null;
  closesOn: Date | null;
  videoDurationSeconds: number | null;
  videoLength?: string | null;
  // Authored assessment policy that flows to students via inheritance.
  badgePolicy?: BadgePolicy;
}

// --Badge Creation--

export async function executeBadgeCreationTx(args: CreateBadgeArgs) {
  const {
    creatorId,
    courseId,
    badgeName,
    badgeDescription,
    videoTitle,
    youtubeVideoUrl,
    checkpoints,
    skills,
    rubricGoal,
    passingPercentage,
    neverCloses,
    availableOn,
    closesOn,
    videoDurationSeconds,
    videoLength,
    badgePolicy = {},
  } = args;

  const dueDate = closesOn;
  const videoId = extractYouTubeId(youtubeVideoUrl);
  const thumbnailUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
  const slugSuffix = randomUUID().slice(0, 8);

  return await prisma.$transaction(
    async (tx) => {
      let course = null;
      if (courseId) {
        course = await tx.course.findFirst({
          where: { id: courseId, createdById: creatorId },
          select: {
            id: true,
            lessons: { select: { sortOrder: true }, orderBy: { sortOrder: 'desc' }, take: 1 },
            enrollments: { where: { role: CourseRole.STUDENT }, select: { studentId: true } },
          },
        });
        if (!course)
          return { error: 'Course not found or you do not have permission to create badges for it.', status: 404 };
      }

      const sourceBadgeSlug = `${slugify(badgeName)}-${slugSuffix}`;
      const sourceSummary = buildRequirementSummary({
        badgeName,
        lessonTitle: badgeName,
        skills,
        checkpoints,
        youtubeUrl: youtubeVideoUrl,
        videoTitle,
        videoLength: videoLength,
        passingPercent: passingPercentage,
      });

      const sourceBadge = await tx.badge.create({
        data: {
          slug: sourceBadgeSlug,
          name: badgeName,
          description: badgeDescription,
          availableOn,
          closesOn,
          neverCloses,
          createdById: creatorId,
          ...badgePolicy,
        },
        select: { id: true, slug: true, name: true, description: true },
      });

      const sourceRequirement = await tx.badgeRequirement.create({
        data: { badgeId: sourceBadge.id, lessonId: null, summary: sourceSummary },
        select: { id: true },
      });

      await syncBadgeRubricGoal(tx, sourceBadge.id, rubricGoal);

      let courseBadge: typeof sourceBadge | null = null;
      let lesson: { id: string; slug: string; title: string } | null = null;
      let courseRequirement: { id: string } | null = null;

      if (course) {
        const courseBadgeSlug = `${slugify(badgeName)}-course-${randomUUID().slice(0, 8)}`;
        const lessonSlug = `${courseBadgeSlug}-lesson`;

        courseBadge = await tx.badge.create({
          data: {
            slug: courseBadgeSlug,
            name: badgeName,
            description: badgeDescription,
            availableOn,
            closesOn,
            neverCloses,
            createdById: creatorId,
            sourceBadgeId: sourceBadge.id,
            ...badgePolicy,
          },
          select: { id: true, slug: true, name: true, description: true },
        });

        lesson = await tx.lesson.create({
          data: {
            courseId: course.id,
            slug: lessonSlug,
            title: badgeName,
            summary: badgeDescription ?? `Lesson for ${badgeName}`,
            description: badgeDescription,
            thumbnailUrl,
            dueDate,
            passingPercent: passingPercentage,
            estimatedMinutes: videoDurationSeconds ? Math.max(1, Math.round(videoDurationSeconds / 60)) : null,
            sortOrder: (course.lessons[0]?.sortOrder ?? -1) + 1,
          },
          select: { id: true, slug: true, title: true },
        });
        const lessonId = lesson.id;

        const segment = await tx.lessonSegment.create({
          data: {
            lessonId: lessonId,
            sortOrder: 0,
            title: videoTitle ?? badgeName,
            summary: badgeDescription,
            duration: videoDurationSeconds || null,
            videoUrl: youtubeVideoUrl,
            thumbnailUrl,
          },
          select: { id: true },
        });

        if (skills.length > 0) {
          await tx.lessonSkill.createMany({
            data: skills.map((skill, skillIndex) => ({ lessonId: lessonId, sortOrder: skillIndex, text: skill })),
          });
        }

        const checkpointPlans = checkpoints.map((checkpoint, checkpointIndex) => {
          const title = normalizeString(checkpoint.title) ?? `Checkpoint ${checkpointIndex + 1}`;
          const questions = buildCheckpointQuestionsWithSummary(checkpoint);
          return {
            sortOrder: checkpointIndex,
            questions,
            data: {
              lessonId: lessonId,
              segmentId: segment.id,
              sortOrder: checkpointIndex,
              title,
              label: 'Checkpoint',
              meta: formatQuestionCount(questions.length),
              questionCount: questions.length,
              timeOffsetSeconds: parseTimeToSeconds(checkpoint.time),
            },
          };
        });

        if (checkpointPlans.length > 0) {
          await tx.lessonCheckpoint.createMany({ data: checkpointPlans.map((plan) => plan.data) });
          const createdCheckpoints = await tx.lessonCheckpoint.findMany({
            where: { lessonId: lesson.id },
            select: { id: true, sortOrder: true },
          });
          const checkpointIdByOrder = new Map(createdCheckpoints.map((c) => [c.sortOrder, c.id]));
          const questionData = checkpointPlans.flatMap((plan) =>
            plan.questions.map((question) => ({
              checkpointId: checkpointIdByOrder.get(plan.sortOrder)!,
              sortOrder: question.sortOrder,
              prompt: question.prompt!,
              options: question.questionOptions.options,
              correctIndex: question.questionOptions.correctIndex,
            }))
          );
          if (questionData.length > 0) await tx.checkpointQuestion.createMany({ data: questionData });
        }

        courseRequirement = await tx.badgeRequirement.create({
          data: { badgeId: courseBadge.id, lessonId: lesson.id, summary: sourceSummary },
          select: { id: true },
        });

        await syncBadgeRubricGoal(tx, courseBadge.id, rubricGoal);
      }

      await tx.surveyPrompt.create({
        data: {
          context: SurveyContext.BADGE,
          badgeId: courseBadge?.id ?? sourceBadge.id,
          question: `How satisfied are you with the assessment process for ${sourceBadge.name}?`,
        },
      });

      if (course && course.enrollments.length > 0) {
        await tx.studentBadge.createMany({
          data: course.enrollments.map((enrollment) => ({
            studentId: enrollment.studentId,
            badgeId: courseBadge?.id ?? sourceBadge.id,
            status: BadgeStatus.LEARNING,
          })),
          skipDuplicates: true,
        });
      }

      return {
        badge: sourceBadge,
        courseBadge,
        lesson,
        requirement: courseRequirement ?? sourceRequirement,
        sourceBadgeId: sourceBadge.id,
        assignedToCourseId: course?.id ?? null,
        studentBadgeCount: course?.enrollments.length ?? 0,
      };
    },
    { timeout: 15000 }
  );
}

// --Badge Update Args--

interface PatchBadgeArgs {
  badgeId: string;
  badgeName: string;
  badgeDescription: string | null;
  editorId: string;
  skills: string[];
  rubricGoal: NormalizedRubricGoal;
  checkpoints: CheckpointPayload[];
  neverCloses?: boolean | null;
  availableOn?: Date | null;
  closesOn?: Date | null;
  youtubeVideoUrl?: string | null;
  videoId?: string | null;
  videoTitle?: string | null;
  videoLength: string | null;
  videoSeconds: number | null;
  thumbnailUrl?: string | null;
  passingPercentage: number | null;
  // Authored assessment policy that flows to students via inheritance.
  badgePolicy?: BadgePolicy;
}

export async function executeBadgePatchTx(args: PatchBadgeArgs) {
  const {
    editorId,
    badgeId,
    badgeName,
    badgeDescription,
    skills,
    rubricGoal,
    checkpoints,
    neverCloses,
    availableOn,
    closesOn,
    youtubeVideoUrl,
    videoTitle,
    videoLength,
    videoSeconds,
    passingPercentage,
    badgePolicy = {},
  } = args;

  const videoId = extractYouTubeId(youtubeVideoUrl);
  const thumbnailUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;

  return await prisma.$transaction(async (tx) => {
    const badge = await tx.badge.update({
      where: { id: badgeId, createdById: editorId },
      data: { name: badgeName, description: badgeDescription, availableOn, closesOn, neverCloses, ...badgePolicy },
      select: { id: true, slug: true, name: true, description: true, sourceBadgeId: true },
    });

    const familyRootId = badge.sourceBadgeId ?? badge.id;
    await tx.badge.updateMany({
      where: { OR: [{ id: familyRootId }, { sourceBadgeId: familyRootId }], NOT: { id: badge.id } },
      data: { name: badgeName, description: badgeDescription, availableOn, closesOn, neverCloses, ...badgePolicy },
    });

    const firstRequirement = await tx.badgeRequirement.findFirst({
      where: { badgeId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, lesson: { select: { title: true } } },
    });

    const requirementSummary = buildRequirementSummary({
      badgeName,
      lessonTitle: badgeName,
      skills,
      checkpoints,
      youtubeUrl: youtubeVideoUrl,
      videoTitle,
      videoLength: videoLength,
      passingPercent: passingPercentage,
    });

    if (firstRequirement) {
      await tx.badgeRequirement.update({ where: { id: firstRequirement.id }, data: { summary: requirementSummary } });
    } else {
      await tx.badgeRequirement.create({ data: { badgeId, summary: requirementSummary } });
    }

    const otherFamilyBadges = await tx.badge.findMany({
      where: { OR: [{ id: familyRootId }, { sourceBadgeId: familyRootId }], NOT: { id: badge.id } },
      select: { id: true },
    });

    if (otherFamilyBadges.length > 0) {
      await tx.badgeRequirement.updateMany({
        where: { badgeId: { in: otherFamilyBadges.map((b) => b.id) } },
        data: { summary: requirementSummary },
      });
    }

    for (const familyBadgeId of [badge.id, ...otherFamilyBadges.map((b) => b.id)]) {
      await syncBadgeRubricGoal(tx, familyBadgeId, rubricGoal);
    }

    if (badgeName) {
      const familyBadgeIds = [badge.id, ...otherFamilyBadges.map((b) => b.id)];
      const requirementsWithLessons = await tx.badgeRequirement.findMany({
        where: { badgeId: { in: familyBadgeIds }, lessonId: { not: null } },
        select: { lessonId: true },
      });
      const lessonIds = Array.from(
        new Set(requirementsWithLessons.map((r) => r.lessonId).filter((id): id is string => Boolean(id)))
      );

      if (lessonIds.length > 0) {
        await tx.lesson.updateMany({
          where: { id: { in: lessonIds } },
          data: {
            title: badgeName,
            passingPercent: passingPercentage ?? undefined,
            estimatedMinutes: videoSeconds ? Math.max(1, Math.round(videoSeconds / 60)) : undefined,
          },
        });

        await tx.lessonSkill.deleteMany({ where: { lessonId: { in: lessonIds } } });

        if (skills.length > 0) {
          await tx.lessonSkill.createMany({
            data: lessonIds.flatMap((lessonId) =>
              skills.map((skill, skillIndex) => ({ lessonId, sortOrder: skillIndex, text: skill }))
            ),
          });
        }

        const segments = await tx.lessonSegment.findMany({
          where: { lessonId: { in: lessonIds } },
          orderBy: [{ lessonId: 'asc' }, { sortOrder: 'asc' }],
          select: { id: true, lessonId: true },
        });
        const firstSegmentIdByLesson = new Map<string, string>();
        for (const segment of segments) {
          if (!firstSegmentIdByLesson.has(segment.lessonId)) firstSegmentIdByLesson.set(segment.lessonId, segment.id);
        }
        const firstSegmentIds = Array.from(firstSegmentIdByLesson.values());

        if (firstSegmentIds.length > 0 && (youtubeVideoUrl || videoTitle || videoSeconds || thumbnailUrl)) {
          await tx.lessonSegment.updateMany({
            where: { id: { in: firstSegmentIds } },
            data: {
              videoUrl: youtubeVideoUrl ?? undefined,
              title: videoTitle ?? undefined,
              duration: videoSeconds || undefined,
              thumbnailUrl: thumbnailUrl ?? undefined,
            },
          });
        }

        if (checkpoints.length > 0) {
          for (const lessonId of lessonIds) {
            const firstSegmentId = firstSegmentIdByLesson.get(lessonId) ?? null;
            for (const [checkpointIndex, checkpoint] of checkpoints.entries()) {
              const title = normalizeString(checkpoint.title) ?? `Checkpoint ${checkpointIndex + 1}`;
              const questions = buildCheckpointQuestionsWithSummary(checkpoint);
              const lessonCheckpoint = await tx.lessonCheckpoint.upsert({
                where: { lessonId_sortOrder: { lessonId, sortOrder: checkpointIndex } },
                create: {
                  lessonId,
                  segmentId: firstSegmentId,
                  sortOrder: checkpointIndex,
                  title,
                  label: 'Checkpoint',
                  meta: formatQuestionCount(questions.length),
                  questionCount: questions.length,
                  timeOffsetSeconds: parseTimeToSeconds(checkpoint.time),
                },
                update: {
                  segmentId: firstSegmentId,
                  title,
                  label: 'Checkpoint',
                  meta: formatQuestionCount(questions.length),
                  questionCount: questions.length,
                  timeOffsetSeconds: parseTimeToSeconds(checkpoint.time),
                },
                select: { id: true },
              });

              for (const question of questions) {
                await tx.checkpointQuestion.upsert({
                  where: {
                    checkpointId_sortOrder: { checkpointId: lessonCheckpoint.id, sortOrder: question.sortOrder },
                  },
                  create: {
                    checkpointId: lessonCheckpoint.id,
                    sortOrder: question.sortOrder,
                    prompt: question.prompt!,
                    options: question.questionOptions.options,
                    correctIndex: question.questionOptions.correctIndex,
                  },
                  update: {
                    prompt: question.prompt!,
                    options: question.questionOptions.options,
                    correctIndex: question.questionOptions.correctIndex,
                  },
                });
              }
            }
          }
        }
      }
    }
    return badge;
  });
}
