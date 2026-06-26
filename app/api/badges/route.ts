import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { BadgeCategory, BadgeStatus, CourseRole, Prisma, SurveyContext } from '@prisma/client';
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

type RubricCriterionPayload = {
  id?: string;
  prompt?: string | null;
  options?: string[] | null;
};

type RubricItemPayload = {
  id?: string;
  text?: string | null;
};

type CreateBadgePayload = {
  courseId?: string | null;
  badgeName?: string | null;
  badgeDescription?: string | null;
  category?: BadgeCategory | null;
  availableOn?: string | null;
  closesOn?: string | null;
  neverCloses?: boolean | null;
  youtubeUrl?: string | null;
  videoTitle?: string | null;
  videoLength?: string | null;
  checkpoints?: CheckpointPayload[] | null;
  rubricOverview?: string | null;
  rubricItems?: RubricItemPayload[] | null;
  rubricCriteria?: RubricCriterionPayload[] | null;
  gradingCriteria?: RubricCriterionPayload[] | null;
};

type UpdateBadgePayload = {
  id?: string | null;
  badgeName?: string | null;
  badgeDescription?: string | null;
  category?: BadgeCategory | null;
  rubricOverview?: string | null;
  rubricItems?: RubricItemPayload[] | null;
  rubricCriteria?: RubricCriterionPayload[] | null;
  gradingCriteria?: RubricCriterionPayload[] | null;
  checkpoints?: CheckpointPayload[] | null;
};

function normalizeString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeCategory(value?: string | null) {
  return value && Object.values(BadgeCategory).includes(value as BadgeCategory) ? (value as BadgeCategory) : null;
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

  if (parts.length === 1) {
    return parts[0];
  }

  return 0;
}

function parseDate(value?: string | null) {
  const trimmed = normalizeString(value);
  if (!trimmed) return null;

  const date = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractYouTubeId(url?: string | null) {
  const trimmed = normalizeString(url);
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '') || null;
    }

    const queryId = parsed.searchParams.get('v');
    if (queryId) return queryId;

    const parts = parsed.pathname.split('/');
    const embedIndex = parts.indexOf('embed');
    if (embedIndex >= 0) {
      return parts[embedIndex + 1] ?? null;
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeOptions(options?: string[] | null) {
  const normalized = (options ?? [])
    .map((option) => normalizeString(option))
    .filter((option): option is string => Boolean(option));

  return normalized.length > 0 ? normalized : ['Yes', 'No'];
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

function normalizeRubricItems(items?: RubricItemPayload[] | null, overview?: string | null) {
  const normalized = (items ?? [])
    .map((item, index) => ({
      number: index + 1,
      text: normalizeString(item.text),
    }))
    .filter((item): item is { number: number; text: string } => Boolean(item.text));

  if (normalized.length > 0) {
    return normalized;
  }

  const fallback = normalizeString(overview);
  return fallback ? [{ number: 1, text: fallback }] : [];
}

function normalizeGradingCriteria(criteria?: RubricCriterionPayload[] | null) {
  return (criteria ?? [])
    .map((criterion, index) => ({
      number: index + 1,
      criterion: normalizeString(criterion.prompt),
      options: (criterion.options ?? [])
        .map((option) => normalizeString(option))
        .filter((option): option is string => Boolean(option)),
    }))
    .filter((criterion) => Boolean(criterion.criterion) || criterion.options.length > 0);
}

function buildRequirementSummary({
  badgeName,
  lessonTitle,
  rubricItems,
  gradingCriteria,
  checkpoints,
}: {
  badgeName: string;
  lessonTitle?: string | null;
  rubricItems: Array<{ number: number; text: string }>;
  gradingCriteria: Array<{ number: number; criterion: string | null; options: string[] }>;
  checkpoints: CheckpointPayload[];
}) {
  return JSON.stringify({
    version: 1,
    badgeName,
    lessonTitle: lessonTitle ?? null,
    rubricItems,
    gradingCriteria,
    checkpoints: checkpoints
      .map((checkpoint, index) => ({
        number: index + 1,
        title: normalizeString(checkpoint.title) ?? `Checkpoint ${index + 1}`,
        time: normalizeString(checkpoint.time),
        points: Number(checkpoint.points) || 0,
        question: normalizeString(checkpoint.question),
        questionType: checkpoint.questionType === 'shortAnswer' ? 'shortAnswer' : 'multipleChoice',
        segmentLabel: normalizeString(checkpoint.segmentLabel),
        options: (checkpoint.options ?? []).map((option) => normalizeString(option)).filter(Boolean),
        correctIndices: checkpoint.correctIndices ?? [],
        numericAnswer: parseFiniteNumber(checkpoint.numericAnswer),
        numericRangeMin: parseFiniteNumber(checkpoint.numericRangeMin),
        numericRangeMax: parseFiniteNumber(checkpoint.numericRangeMax),
      }))
      .filter((checkpoint) => Boolean(checkpoint.question)),
  });
}

function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, details: details ?? null }, { status: 400 });
}

function parseRequirementSummary(summary?: string | null) {
  if (!summary) {
    return {
      displayText: 'Independent badge requirement',
      rubricItems: [] as Array<{ number: number; text: string }>,
      gradingCriteria: [] as Array<{ number: number; criterion: string | null; options: string[] }>,
      checkpoints: [] as CheckpointPayload[],
    };
  }

  try {
    const parsed = JSON.parse(summary) as {
      rubricItems?: Array<{ number?: number; text?: string | null }>;
      gradingCriteria?: Array<{ number?: number; criterion?: string | null; options?: string[] }>;
      checkpoints?: CheckpointPayload[];
    };
    const rubricItems = (parsed.rubricItems ?? [])
      .map((item, index) => ({
        number: item.number ?? index + 1,
        text: normalizeString(item.text),
      }))
      .filter((item): item is { number: number; text: string } => Boolean(item.text));
    const gradingCriteria = (parsed.gradingCriteria ?? []).map((criterion, index) => ({
      number: criterion.number ?? index + 1,
      criterion: normalizeString(criterion.criterion),
      options: (criterion.options ?? [])
        .map((option) => normalizeString(option))
        .filter((option): option is string => Boolean(option)),
    }));

    return {
      displayText: rubricItems[0]?.text ?? gradingCriteria[0]?.criterion ?? 'Independent badge requirement',
      rubricItems,
      gradingCriteria,
      checkpoints: parsed.checkpoints ?? [],
    };
  } catch {
    return {
      displayText: summary,
      rubricItems: [] as Array<{ number: number; text: string }>,
      gradingCriteria: [] as Array<{ number: number; criterion: string | null; options: string[] }>,
      checkpoints: [] as CheckpointPayload[],
    };
  }
}

export async function GET() {
  try {
    const clerkUser = await currentUser();

    if (!clerkUser?.emailAddresses?.[0]?.emailAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const creatorEmail = clerkUser.emailAddresses[0].emailAddress.trim().toLowerCase();
    const creator = await prisma.user.findUnique({
      where: { email: creatorEmail },
      select: { id: true },
    });

    if (!creator) {
      return NextResponse.json({ error: 'Creator user record was not found in the database.' }, { status: 404 });
    }

    const badges = await prisma.badge.findMany({
      where: {
        sourceBadgeId: null,
        OR: [{ createdById: creator.id }, { createdById: null }],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        category: true,
        createdAt: true,
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

    return NextResponse.json(
      {
        count: badges.length,
        badges: badges.map((badge) => ({
          id: badge.id,
          slug: badge.slug,
          name: badge.name,
          description: badge.description,
          category: badge.category,
          createdAt: badge.createdAt.toISOString(),
          assignedStudentCount: badge._count.studentProgress,
          requirements: badge.requirements.map((requirement) => {
            const parsedSummary = parseRequirementSummary(requirement.summary);

            return {
              id: requirement.id,
              summary: requirement.summary,
              displayText: parsedSummary.displayText,
              rubricItems: parsedSummary.rubricItems,
              gradingCriteria: parsedSummary.gradingCriteria,
              checkpoints: parsedSummary.checkpoints,
              lesson: requirement.lesson
                ? {
                    id: requirement.lesson.id,
                    title: requirement.lesson.title,
                    description: requirement.lesson.description,
                    dueDate: requirement.lesson.dueDate?.toISOString() ?? null,
                    estimatedMinutes: requirement.lesson.estimatedMinutes,
                    segment: requirement.lesson.segments?.[0]
                      ? {
                          title: requirement.lesson.segments?.[0]?.title ?? '',
                          duration: requirement.lesson.segments?.[0]?.duration ?? null,
                          videoUrl: requirement.lesson.segments?.[0]?.videoUrl ?? null,
                        }
                      : null,
                    course: requirement.lesson.course
                      ? {
                          id: requirement.lesson.course.id,
                          title: requirement.lesson.course.title,
                        }
                      : null,
                  }
                : null,
            };
          }),
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET /api/badges failed:', error);

    return NextResponse.json({ error: 'Failed to fetch badges.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const clerkUser = await currentUser();

    if (!clerkUser?.emailAddresses?.[0]?.emailAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as UpdateBadgePayload;
    const badgeId = normalizeString(body.id);
    const badgeName = normalizeString(body.badgeName);
    const badgeDescription = normalizeString(body.badgeDescription);
    const category = normalizeCategory(body.category);
    const rubricOverview = normalizeString(body.rubricOverview);
    const rubricItems = normalizeRubricItems(body.rubricItems, rubricOverview);
    const gradingCriteria = normalizeGradingCriteria(body.gradingCriteria ?? body.rubricCriteria);
    const checkpoints = body.checkpoints ?? [];

    if (!badgeId) {
      return badRequest('Badge id is required.');
    }

    if (!badgeName) {
      return badRequest('Badge name is required.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const badge = await tx.badge.update({
        where: { id: badgeId },
        data: {
          name: badgeName,
          description: badgeDescription,
          category,
        },
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          category: true,
        },
      });

      const firstRequirement = await tx.badgeRequirement.findFirst({
        where: { badgeId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          lesson: {
            select: {
              title: true,
            },
          },
        },
      });

      if (firstRequirement) {
        await tx.badgeRequirement.update({
          where: { id: firstRequirement.id },
          data: {
            summary: buildRequirementSummary({
              badgeName,
              lessonTitle: firstRequirement.lesson?.title ?? badgeName,
              rubricItems,
              gradingCriteria,
              checkpoints,
            }),
          },
        });
      } else {
        await tx.badgeRequirement.create({
          data: {
            badgeId,
            summary: buildRequirementSummary({
              badgeName,
              lessonTitle: badgeName,
              rubricItems,
              gradingCriteria,
              checkpoints,
            }),
          },
        });
      }

      return badge;
    });

    return NextResponse.json(
      {
        message: 'Badge updated successfully.',
        badge: updated,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('PATCH /api/badges failed:', error);

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Badge not found.' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Failed to update badge.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const clerkUser = await currentUser();

    if (!clerkUser?.emailAddresses?.[0]?.emailAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const creatorEmail = clerkUser.emailAddresses[0].emailAddress.trim().toLowerCase();
    const creator = await prisma.user.findUnique({
      where: { email: creatorEmail },
      select: { id: true },
    });

    if (!creator) {
      return NextResponse.json({ error: 'Creator user record was not found in the database.' }, { status: 404 });
    }

    const body = (await req.json()) as CreateBadgePayload;
    const courseId = normalizeString(body.courseId);
    const badgeName = normalizeString(body.badgeName);
    const badgeDescription = normalizeString(body.badgeDescription);
    const videoTitle = normalizeString(body.videoTitle) ?? badgeName;
    const youtubeUrl = normalizeString(body.youtubeUrl);
    const category = normalizeCategory(body.category);
    const checkpoints = body.checkpoints ?? [];
    const rubricOverview = normalizeString(body.rubricOverview);
    const rubricItems = normalizeRubricItems(body.rubricItems, rubricOverview);
    const gradingCriteria = normalizeGradingCriteria(body.gradingCriteria ?? body.rubricCriteria);
    const dueDate = body.neverCloses ? null : parseDate(body.closesOn);
    const videoId = extractYouTubeId(youtubeUrl);
    const thumbnailUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
    const videoDurationSeconds = parseTimeToSeconds(body.videoLength);
    const slugSuffix = randomUUID().slice(0, 8);

    if (!badgeName) {
      return badRequest('Badge name is required.');
    }

    const saved = await prisma.$transaction(
      async (tx) => {
        const course = courseId
          ? await tx.course.findFirst({
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
            })
          : null;

        if (courseId && !course) {
          return {
            error: NextResponse.json(
              { error: 'Course not found or you do not have permission to create badges for it.' },
              { status: 404 }
            ),
          };
        }

        const sourceBadgeSlug = `${slugify(badgeName)}-${slugSuffix}`;
        const sourceSummary = buildRequirementSummary({
          badgeName,
          lessonTitle: videoTitle,
          rubricItems,
          gradingCriteria,
          checkpoints,
        });

        const sourceBadge = await tx.badge.create({
          data: {
            slug: sourceBadgeSlug,
            name: badgeName,
            description: badgeDescription,
            category,
            createdById: creator.id,
          },
          select: {
            id: true,
            slug: true,
            name: true,
            description: true,
            category: true,
          },
        });

        const sourceRequirement = await tx.badgeRequirement.create({
          data: {
            badgeId: sourceBadge.id,
            lessonId: null,
            summary: sourceSummary,
          },
          select: {
            id: true,
          },
        });

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
              category,
              createdById: creator.id,
              sourceBadgeId: sourceBadge.id,
            },
            select: {
              id: true,
              slug: true,
              name: true,
              description: true,
              category: true,
            },
          });

          lesson = await tx.lesson.create({
            data: {
              courseId: course.id,
              slug: lessonSlug,
              title: videoTitle ?? badgeName,
              summary: badgeDescription ?? `Lesson for ${badgeName}`,
              description: badgeDescription,
              thumbnailUrl,
              dueDate,
              estimatedMinutes: videoDurationSeconds ? Math.max(1, Math.round(videoDurationSeconds / 60)) : null,
              sortOrder: (course.lessons[0]?.sortOrder ?? -1) + 1,
            },
            select: {
              id: true,
              slug: true,
              title: true,
            },
          });

          const segment = await tx.lessonSegment.create({
            data: {
              lessonId: lesson.id,
              sortOrder: 0,
              title: videoTitle ?? badgeName,
              summary: badgeDescription,
              duration: videoDurationSeconds || null,
              videoUrl: youtubeUrl,
              thumbnailUrl,
            },
            select: {
              id: true,
            },
          });

          // Precompute each checkpoint's normalized data once, keyed by its sortOrder
          // (== checkpointIndex). We batch-create checkpoints, read their generated ids
          // back via the (lessonId, sortOrder) unique key, then batch-create questions.
          // Capture lesson in a non-null local so the map closure narrows correctly.
          const lessonId = lesson.id;
          const checkpointPlans = checkpoints.map((checkpoint, checkpointIndex) => {
            const prompt = normalizeString(checkpoint.question);
            const title = normalizeString(checkpoint.title) ?? `Checkpoint ${checkpointIndex + 1}`;
            const points = Number(checkpoint.points) || 0;
            const questionOptions = buildQuestionOptions(checkpoint);

            return {
              sortOrder: checkpointIndex,
              prompt,
              questionOptions,
              data: {
                lessonId,
                segmentId: segment.id,
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

        if (courseBadge) {
          courseRequirement = await tx.badgeRequirement.create({
            data: {
              badgeId: courseBadge.id,
              lessonId: lesson?.id ?? null,
              summary: sourceSummary,
            },
            select: {
              id: true,
            },
          });
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
      {
        timeout: 15000,
      }
    );

    if ('error' in saved) {
      return saved.error;
    }

    return NextResponse.json(
      {
        message: 'Badge created successfully.',
        ...saved,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/badges failed:', error);

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'A badge or lesson with this slug already exists.' }, { status: 409 });
    }

    return NextResponse.json({ error: 'Failed to create badge.' }, { status: 500 });
  }
}
