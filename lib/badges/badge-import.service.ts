import { BadgeStatus, CourseRole, Prisma, SurveyContext } from '@prisma/client';
import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { parseTimeToSeconds, slugify, formatQuestionCount } from '@/lib/utils';
import { CheckpointPayload, CheckpointQuestionPayload } from '@/lib/checkpoints/types';
import { buildQuestionOptions, normalizeString, normalizeSkills } from '../checkpoints/normalizeWrite';
import { parseRequirementSummary } from '@/lib/badges/requirement-summary';
import { buildYoutubeThumbnail } from '@/lib/video';

function getQuestionPrompt(question: CheckpointQuestionPayload) {
  return normalizeString(question.question) ?? normalizeString(question.prompt);
}

function buildCheckpointQuestionsForImport(checkpoint: CheckpointPayload) {
  const rawQuestions =
    Array.isArray(checkpoint.questions) && checkpoint.questions.length > 0 ? checkpoint.questions : [checkpoint];

  return rawQuestions
    .map((question, questionIndex) => ({
      sortOrder: questionIndex,
      prompt: getQuestionPrompt(question),
      questionOptions: buildQuestionOptions(question),
    }))
    .filter((question) => Boolean(question.prompt));
}

function secondsToTimestamp(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return [hours, minutes, remainingSeconds].map((part) => String(part).padStart(2, '0')).join(':');
}
// --Import Badge Args--
interface BadgeImportArgs {
  creatorId: string;
  courseId: string;
  sourceBadgeId: string;
  availableOn?: Date | null;
  closesOn?: Date | null;
  neverCloses?: boolean | null;
}

// --Import Badge--

export async function executeBadgeImportTx(args: BadgeImportArgs) {
  const { creatorId, courseId, sourceBadgeId, availableOn, closesOn, neverCloses } = args;

  return await prisma.$transaction(
    async (tx) => {
      const course = await tx.course.findFirst({
        where: { id: courseId, createdById: creatorId },
        select: {
          id: true,
          lessons: { select: { sortOrder: true }, orderBy: { sortOrder: 'desc' }, take: 1 },
          enrollments: { where: { role: CourseRole.STUDENT }, select: { studentId: true } },
        },
      });

      if (!course) {
        return { error: 'Course not found or you do not have permission to import badges into it.', status: 404 };
      }

      const sourceBadge = await tx.badge.findFirst({
        where: {
          id: sourceBadgeId,
          OR: [{ createdById: creatorId }, { createdById: null }],
        },
        select: {
          id: true,
          sourceBadgeId: true,
          slug: true,
          name: true,
          description: true,
          // Carry the authored assessment policy onto the course copy.
          reassessmentLimit: true,
          cooldownDays: true,
          reassessmentRequired: true,

          rubricGoal: {
            select: {
              name: true,
              instructions: true,
              subgoals: {
                orderBy: { sortOrder: 'asc' },
                select: {
                  text: true,
                  passThreshold: true,
                  sortOrder: true,
                  tasks: {
                    orderBy: { sortOrder: 'asc' },
                    select: { text: true, points: true, sortOrder: true },
                  },
                },
              },
            },
          },
          requirements: {
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: {
              summary: true,
              lesson: {
                select: {
                  title: true,
                  summary: true,
                  description: true,
                  thumbnailUrl: true,
                  estimatedMinutes: true,
                  passingPercent: true,
                  segments: {
                    orderBy: { sortOrder: 'asc' },
                    select: {
                      id: true,
                      sortOrder: true,
                      title: true,
                      summary: true,
                      duration: true,
                      videoUrl: true,
                      muxPlaybackId: true,
                      thumbnailUrl: true,
                    },
                  },
                  skills: {
                    orderBy: { sortOrder: 'asc' },
                    select: {
                      sortOrder: true,
                      text: true,
                    },
                  },
                  checkpoints: {
                    orderBy: { sortOrder: 'asc' },
                    select: {
                      id: true,
                      segmentId: true,
                      sortOrder: true,
                      title: true,
                      description: true,
                      label: true,
                      meta: true,
                      questionCount: true,
                      timeOffsetSeconds: true,
                      snapshotUrl: true,
                      questions: {
                        orderBy: { sortOrder: 'asc' },
                        select: {
                          sortOrder: true,
                          prompt: true,
                          options: true,
                          correctIndex: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!sourceBadge) {
        return { error: 'Badge not found or you do not have permission to import it.', status: 404 };
      }

      const sourceRequirement = sourceBadge.requirements[0] ?? null;
      const sourceLesson = sourceRequirement?.lesson ?? null;
      const summary = parseRequirementSummary(sourceRequirement?.summary);
      const lessonSkills =
        sourceLesson?.skills?.map((skill) => skill.text).filter((skill): skill is string => Boolean(skill)) ??
        normalizeSkills(summary.skills);
      const slugSuffix = randomUUID().slice(0, 8);
      const badgeSlug = `${slugify(sourceBadge.name)}-${slugSuffix}`;
      const lessonSlug = `${badgeSlug}-lesson`;
      const rootSourceBadgeId = sourceBadge.sourceBadgeId ?? sourceBadge.id;

      const badge = await tx.badge.create({
        data: {
          slug: badgeSlug,
          name: sourceBadge.name,
          description: sourceBadge.description,
          createdById: creatorId,
          sourceBadgeId: rootSourceBadgeId,
          availableOn: availableOn,
          closesOn: closesOn,
          neverCloses,
          reassessmentLimit: sourceBadge.reassessmentLimit,
          cooldownDays: sourceBadge.cooldownDays,
          reassessmentRequired: sourceBadge.reassessmentRequired,
        },
        select: {
          id: true,
          slug: true,
          name: true,
        },
      });

      const lesson = await tx.lesson.create({
        data: {
          courseId: course.id,
          slug: lessonSlug,
          title: sourceLesson?.title ?? summary.lessonTitle ?? sourceBadge.name,
          summary: sourceLesson?.summary ?? sourceBadge.description ?? `Lesson for ${sourceBadge.name}`,
          description: sourceLesson?.description ?? sourceBadge.description,
          thumbnailUrl: sourceLesson?.thumbnailUrl ?? buildYoutubeThumbnail(summary.youtubeUrl),
          dueDate: closesOn,
          estimatedMinutes: sourceLesson?.estimatedMinutes ?? null,
          passingPercent: sourceLesson?.passingPercent ?? summary.passingPercent ?? 70,
          sortOrder: (course.lessons[0]?.sortOrder ?? -1) + 1,
        },
        select: {
          id: true,
          slug: true,
          title: true,
        },
      });

      const segmentIdBySourceId = new Map<string, string>();
      const sourceSegments = sourceLesson?.segments ?? [];

      if (lessonSkills.length > 0) {
        await tx.lessonSkill.createMany({
          data: lessonSkills.map((skill, skillIndex) => ({
            lessonId: lesson.id,
            sortOrder: skillIndex,
            text: skill,
          })),
        });
      }

      if (sourceSegments.length > 0) {
        // Batch-create all segments, then read back generated ids via the
        // (lessonId, sortOrder) unique key to remap source segment ids → new ids.
        await tx.lessonSegment.createMany({
          data: sourceSegments.map((segment) => ({
            lessonId: lesson.id,
            sortOrder: segment.sortOrder,
            title: segment.title,
            summary: segment.summary,
            duration: segment.duration,
            videoUrl: segment.videoUrl,
            muxPlaybackId: segment.muxPlaybackId,
            thumbnailUrl: segment.thumbnailUrl,
          })),
        });

        const createdSegments = await tx.lessonSegment.findMany({
          where: { lessonId: lesson.id },
          select: { id: true, sortOrder: true },
        });
        const segmentIdByOrder = new Map(createdSegments.map((s) => [s.sortOrder, s.id]));
        for (const segment of sourceSegments) {
          const newId = segmentIdByOrder.get(segment.sortOrder);
          if (newId) segmentIdBySourceId.set(segment.id, newId);
        }
      } else {
        // No real Lesson/segment rows to copy — this source badge is "independent"
        // (its video lives only in the requirement summary JSON), so rehydrate the
        // segment from there instead of dropping the video.
        const copiedSegment = await tx.lessonSegment.create({
          data: {
            lessonId: lesson.id,
            sortOrder: 0,
            title: summary.videoTitle ?? lesson.title,
            summary: sourceBadge.description,
            duration: summary.videoLength ? parseTimeToSeconds(summary.videoLength) : null,
            videoUrl: summary.youtubeUrl,
            thumbnailUrl: buildYoutubeThumbnail(summary.youtubeUrl),
          },
          select: { id: true },
        });

        segmentIdBySourceId.set('fallback', copiedSegment.id);
      }

      if (sourceLesson?.checkpoints?.length) {
        // Batch checkpoints, read back ids via (lessonId, sortOrder), then batch questions.
        await tx.lessonCheckpoint.createMany({
          data: sourceLesson.checkpoints.map((checkpoint) => ({
            lessonId: lesson.id,
            segmentId: checkpoint.segmentId ? (segmentIdBySourceId.get(checkpoint.segmentId) ?? null) : null,
            sortOrder: checkpoint.sortOrder,
            title: checkpoint.title,
            description: checkpoint.description,
            label: checkpoint.label,
            meta: checkpoint.meta,
            questionCount: checkpoint.questionCount,
            timeOffsetSeconds: checkpoint.timeOffsetSeconds,
            snapshotUrl: checkpoint.snapshotUrl,
          })),
        });

        const createdCheckpoints = await tx.lessonCheckpoint.findMany({
          where: { lessonId: lesson.id },
          select: { id: true, sortOrder: true },
        });
        const checkpointIdByOrder = new Map(createdCheckpoints.map((c) => [c.sortOrder, c.id]));

        const questionData = sourceLesson.checkpoints.flatMap((checkpoint) => {
          const checkpointId = checkpointIdByOrder.get(checkpoint.sortOrder);
          if (!checkpointId) return [];
          return checkpoint.questions.map((question) => ({
            checkpointId,
            sortOrder: question.sortOrder,
            prompt: question.prompt,
            options: question.options as Prisma.InputJsonValue,
            correctIndex: question.correctIndex,
          }));
        });

        if (questionData.length > 0) {
          await tx.checkpointQuestion.createMany({ data: questionData });
        }
      } else {
        const fallbackSegmentId = segmentIdBySourceId.get('fallback') ?? Array.from(segmentIdBySourceId.values())[0];
        // Precompute each fallback checkpoint keyed by sortOrder (== index), batch-create,
        // read back ids via (lessonId, sortOrder), then batch questions.
        const checkpointPlans = (summary.checkpoints ?? []).map((checkpoint, checkpointIndex) => {
          const title = normalizeString(checkpoint.title) ?? `Checkpoint ${checkpointIndex + 1}`;
          const questions = buildCheckpointQuestionsForImport(checkpoint);

          return {
            sortOrder: checkpointIndex,
            questions,
            data: {
              lessonId: lesson.id,
              segmentId: fallbackSegmentId,
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
          await tx.lessonCheckpoint.createMany({
            data: checkpointPlans.map((plan) => plan.data),
          });

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

          if (questionData.length > 0) {
            await tx.checkpointQuestion.createMany({ data: questionData });
          }
        }
      }

      const requirement = await tx.badgeRequirement.create({
        data: {
          badgeId: badge.id,
          lessonId: lesson.id,
          summary:
            sourceRequirement?.summary ??
            JSON.stringify({
              version: 3,
              badgeName: sourceBadge.name,
              lessonTitle: lesson.title,
              checkpoints:
                sourceLesson?.checkpoints.map((checkpoint, index) => ({
                  number: index + 1,
                  title: checkpoint.title,
                  time: secondsToTimestamp(checkpoint.timeOffsetSeconds),
                  question: checkpoint.questions[0]?.prompt ?? null,
                })) ?? [],
            }),
        },
        select: { id: true },
      });

      // The course copy gets its own rubric rows so assessments reference
      // tasks on the badge being assessed, mirroring POST /api/badges.
      if (sourceBadge.rubricGoal) {
        await tx.rubricGoal.create({
          data: {
            badgeId: badge.id,
            name: sourceBadge.rubricGoal.name,
            instructions: sourceBadge.rubricGoal.instructions,
            subgoals: {
              create: sourceBadge.rubricGoal.subgoals.map((subgoal) => ({
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
              })),
            },
          },
        });
      }

      await tx.surveyPrompt.create({
        data: {
          context: SurveyContext.BADGE,
          badgeId: badge.id,
          question: `How satisfied are you with the assessment process for ${badge.name}?`,
        },
      });

      if (course.enrollments.length > 0) {
        await tx.studentBadge.createMany({
          data: course.enrollments.map((enrollment) => ({
            studentId: enrollment.studentId,
            badgeId: badge.id,
            status: BadgeStatus.LEARNING,
          })),
          skipDuplicates: true,
        });
      }
      return {
        badge,
        lesson,
        requirement,
        sourceBadgeId: rootSourceBadgeId,
        assignedToCourseId: course.id,
        studentBadgeCount: course.enrollments.length,
      };
    },
    { timeout: 15000 }
  );
}
