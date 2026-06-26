import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { BadgeStatus, CourseRole, Prisma, SurveyContext } from '@prisma/client';
import { randomUUID } from 'crypto';

import prisma from '@/lib/prisma';

type CheckpointPayload = {
  title?: string | null;
  time?: string | null;
  points?: number | string | null;
  question?: string | null;
  questionType?: 'multipleChoice' | 'shortAnswer' | string | null;
  options?: string[] | null;
  correctIndex?: number | null;
  correctIndices?: number[] | null;
  numericAnswer?: string | number | null;
  numericRangeMin?: string | number | null;
  numericRangeMax?: string | number | null;
  segmentLabel?: string | null;
};

type RequirementSummary = {
  lessonTitle?: string | null;
  checkpoints?: CheckpointPayload[];
};

type ImportBadgePayload = {
  badgeId?: string | null;
};

function normalizeString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeEmail(email?: string | null) {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

function parseTimeToSeconds(value?: string | null) {
  const trimmed = normalizeString(value);
  if (!trimmed) return 0;

  const parts = trimmed.split(':').map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part) || part < 0)) return 0;

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }

  return parts[0] ?? 0;
}

function parseFiniteNumber(value?: string | number | null) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const trimmed = normalizeString(value);
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOptions(options?: string[] | null) {
  const normalized = (options ?? [])
    .map((option) => normalizeString(option))
    .filter((option): option is string => Boolean(option));

  return normalized.length > 0 ? normalized : ['Yes', 'No'];
}

function normalizeCorrectIndices(checkpoint: CheckpointPayload, optionCount: number) {
  const rawIndices =
    Array.isArray(checkpoint.correctIndices) && checkpoint.correctIndices.length > 0
      ? checkpoint.correctIndices
      : checkpoint.correctIndex != null
        ? [checkpoint.correctIndex]
        : [];

  return Array.from(
    new Set(rawIndices.filter((index) => Number.isInteger(index) && index >= 0 && index < optionCount))
  ).sort((left, right) => left - right);
}

function buildQuestionOptions(checkpoint: CheckpointPayload) {
  const questionType = checkpoint.questionType === 'shortAnswer' ? 'shortAnswer' : 'multipleChoice';

  if (questionType === 'shortAnswer') {
    const expectedAnswer = parseFiniteNumber(checkpoint.numericAnswer);
    const rawMin = parseFiniteNumber(checkpoint.numericRangeMin);
    const rawMax = parseFiniteNumber(checkpoint.numericRangeMax);
    const acceptedRange =
      rawMin != null && rawMax != null
        ? {
            min: Math.min(rawMin, rawMax),
            max: Math.max(rawMin, rawMax),
          }
        : null;

    return {
      options: {
        type: 'shortAnswer',
        expectedAnswer,
        acceptedRange,
      },
      correctIndex: null,
    };
  }

  const options = normalizeOptions(checkpoint.options);
  const correctIndices = normalizeCorrectIndices(checkpoint, options.length);

  return {
    options: {
      type: 'multipleChoice',
      options,
      correctIndices: correctIndices.length > 0 ? correctIndices : [0],
    },
    correctIndex: correctIndices[0] ?? 0,
  };
}

function parseRequirementSummary(summary?: string | null): RequirementSummary {
  if (!summary) return {};

  try {
    const parsed = JSON.parse(summary) as RequirementSummary;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function secondsToTimestamp(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return [hours, minutes, remainingSeconds].map((part) => String(part).padStart(2, '0')).join(':');
}

export async function POST(req: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  try {
    const clerkUser = await currentUser();
    const email = normalizeEmail(clerkUser?.emailAddresses?.[0]?.emailAddress);
    const { courseId: rawCourseId } = await context.params;
    const courseId = normalizeString(rawCourseId);

    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!courseId) {
      return NextResponse.json({ error: 'Course id is required.' }, { status: 400 });
    }

    const creator = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!creator) {
      return NextResponse.json({ error: 'Creator user record was not found in the database.' }, { status: 404 });
    }

    const body = (await req.json()) as ImportBadgePayload;
    const sourceBadgeId = normalizeString(body.badgeId);

    if (!sourceBadgeId) {
      return NextResponse.json({ error: 'Badge id is required.' }, { status: 400 });
    }

    const imported = await prisma.$transaction(
      async (tx) => {
        const course = await tx.course.findFirst({
          where: {
            id: courseId,
            createdById: creator.id,
          },
          select: {
            id: true,
            lessons: {
              select: {
                sortOrder: true,
              },
              orderBy: {
                sortOrder: 'desc',
              },
              take: 1,
            },
            enrollments: {
              where: {
                role: CourseRole.STUDENT,
              },
              select: {
                studentId: true,
              },
            },
          },
        });

        if (!course) {
          return {
            error: NextResponse.json(
              { error: 'Course not found or you do not have permission to import badges into it.' },
              { status: 404 }
            ),
          };
        }

        const sourceBadge = await tx.badge.findFirst({
          where: {
            id: sourceBadgeId,
            OR: [{ createdById: creator.id }, { createdById: null }],
          },
          select: {
            id: true,
            sourceBadgeId: true,
            slug: true,
            name: true,
            description: true,
            category: true,
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
          return {
            error: NextResponse.json(
              { error: 'Badge not found or you do not have permission to import it.' },
              { status: 404 }
            ),
          };
        }

        const sourceRequirement = sourceBadge.requirements[0] ?? null;
        const sourceLesson = sourceRequirement?.lesson ?? null;
        const summary = parseRequirementSummary(sourceRequirement?.summary);
        const slugSuffix = randomUUID().slice(0, 8);
        const badgeSlug = `${slugify(sourceBadge.name)}-${slugSuffix}`;
        const lessonSlug = `${badgeSlug}-lesson`;
        const rootSourceBadgeId = sourceBadge.sourceBadgeId ?? sourceBadge.id;

        const badge = await tx.badge.create({
          data: {
            slug: badgeSlug,
            name: sourceBadge.name,
            description: sourceBadge.description,
            category: sourceBadge.category,
            createdById: creator.id,
            sourceBadgeId: rootSourceBadgeId,
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
            thumbnailUrl: sourceLesson?.thumbnailUrl ?? null,
            dueDate: null,
            estimatedMinutes: sourceLesson?.estimatedMinutes ?? null,
            passingPercent: sourceLesson?.passingPercent ?? 70,
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
          const copiedSegment = await tx.lessonSegment.create({
            data: {
              lessonId: lesson.id,
              sortOrder: 0,
              title: lesson.title,
              summary: sourceBadge.description,
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
            const prompt = normalizeString(checkpoint.question);
            const title = normalizeString(checkpoint.title) ?? `Checkpoint ${checkpointIndex + 1}`;
            const points = Number(checkpoint.points) || 0;
            const questionOptions = buildQuestionOptions(checkpoint);

            return {
              sortOrder: checkpointIndex,
              prompt,
              questionOptions,
              data: {
                lessonId: lesson.id,
                segmentId: fallbackSegmentId,
                sortOrder: checkpointIndex,
                title,
                label: title,
                meta: JSON.stringify({
                  points,
                  segmentLabel: normalizeString(checkpoint.segmentLabel),
                }),
                questionCount: prompt ? 1 : 0,
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

            const questionData = checkpointPlans
              .filter((plan) => plan.prompt)
              .map((plan) => ({
                checkpointId: checkpointIdByOrder.get(plan.sortOrder)!,
                sortOrder: 0,
                prompt: plan.prompt!,
                options: plan.questionOptions.options,
                correctIndex: plan.questionOptions.correctIndex,
              }));

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
                version: 1,
                badgeName: sourceBadge.name,
                lessonTitle: lesson.title,
                rubricItems: [],
                gradingCriteria: [],
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
      {
        timeout: 15000,
      }
    );

    if ('error' in imported) {
      return imported.error;
    }

    return NextResponse.json(
      {
        message: 'Badge imported successfully.',
        ...imported,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/courses/[courseId]/badges/import failed:', error);

    return NextResponse.json({ error: 'Failed to import badge.' }, { status: 500 });
  }
}
