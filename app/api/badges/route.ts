import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { BadgeCategory, BadgeStatus, CourseRole, Prisma, SurveyContext } from '@prisma/client';
import { randomUUID } from 'crypto';

import prisma from '@/lib/prisma';

type CheckpointQuestionPayload = {
  id?: string | null;
  prompt?: string | null;
  question?: string | null;
  questionType?: 'multipleChoice' | 'shortAnswer' | string | null;
  options?: string[] | null;
  correctIndex?: number | null;
  correctIndices?: number[] | null;
  numericAnswer?: string | number | null;
  numericRangeMin?: string | number | null;
  numericRangeMax?: string | number | null;
  unit?: string | null;
  incorrectFeedback?: string | null;
  incorrectFeedbackEnabled?: boolean | null;
};

type CheckpointPayload = CheckpointQuestionPayload & {
  title?: string | null;
  time?: string | null;
  points?: number | string | null;
  segmentLabel?: string | null;
  questions?: CheckpointQuestionPayload[] | null;
};

type RubricCriterionPayload = {
  id?: string;
  prompt?: string | null;
  options?: string[] | null;
  optionFeedback?: string[] | null;
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
  skills?: string[] | null;
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
  skills?: string[] | null;
  availableOn?: string | null;
  closesOn?: string | null;
  neverCloses?: boolean | null;
  rubricOverview?: string | null;
  rubricItems?: RubricItemPayload[] | null;
  rubricCriteria?: RubricCriterionPayload[] | null;
  gradingCriteria?: RubricCriterionPayload[] | null;
  checkpoints?: CheckpointPayload[] | null;
  youtubeUrl?: string | null;
  videoTitle?: string | null;
  videoLength?: string | null;
};

function normalizeString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeCategory(value?: string | null) {
  return value && Object.values(BadgeCategory).includes(value as BadgeCategory) ? (value as BadgeCategory) : null;
}

// Trim, drop empties, case-insensitive de-dupe, cap at 5. The API is the
// authoritative gate even though the client also limits to 5.
function normalizeSkills(skills?: string[] | null) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of skills ?? []) {
    const value = normalizeString(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= 5) break;
  }
  return result;
}

function formatQuestionCount(count: number) {
  return `${count} question${count === 1 ? '' : 's'}`;
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

    const shortsIndex = parts.indexOf('shorts');
    if (shortsIndex >= 0) {
      return parts[shortsIndex + 1] ?? null;
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

  const capped = normalized.slice(0, 4);
  while (capped.length < 2) {
    capped.push(capped.length === 0 ? 'Yes' : 'No');
  }
  return capped;
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

function normalizeCorrectIndices(question: CheckpointQuestionPayload, optionCount: number) {
  const rawIndices =
    Array.isArray(question.correctIndices) && question.correctIndices.length > 0
      ? question.correctIndices
      : question.correctIndex != null
        ? [question.correctIndex]
        : [];

  return Array.from(
    new Set(rawIndices.filter((index) => Number.isInteger(index) && index >= 0 && index < optionCount))
  ).sort((left, right) => left - right);
}

function buildQuestionOptions(question: CheckpointQuestionPayload) {
  const questionType = question.questionType === 'shortAnswer' ? 'shortAnswer' : 'multipleChoice';

  // Stored only when populated, so badges without a unit / feedback keep the
  // exact prior shape (blank unit => no unit assigned, per the design note).
  const unit = normalizeString(question.unit);
  const incorrectFeedback = normalizeString(question.incorrectFeedback);
  const feedbackEntry = incorrectFeedback ? { incorrectFeedback } : {};

  if (questionType === 'shortAnswer') {
    const expectedAnswer = parseFiniteNumber(question.numericAnswer);
    const rawMin = parseFiniteNumber(question.numericRangeMin);
    const rawMax = parseFiniteNumber(question.numericRangeMax);
    const baseRange =
      rawMin != null && rawMax != null
        ? {
            min: Math.min(rawMin, rawMax),
            max: Math.max(rawMin, rawMax),
          }
        : null;
    const acceptedRange = baseRange ? (unit ? { ...baseRange, unit } : baseRange) : unit ? { unit } : null;

    return {
      options: {
        type: 'shortAnswer',
        expectedAnswer,
        acceptedRange,
        ...feedbackEntry,
      },
      correctIndex: null,
    };
  }

  const options = normalizeOptions(question.options);
  const correctIndices = normalizeCorrectIndices(question, options.length);

  return {
    options: {
      type: 'multipleChoice',
      options,
      correctIndices: correctIndices.length > 0 ? correctIndices : [0],
      ...feedbackEntry,
    },
    correctIndex: correctIndices[0] ?? 0,
  };
}

function getQuestionPrompt(question: CheckpointQuestionPayload) {
  return normalizeString(question.question) ?? normalizeString(question.prompt);
}

function normalizeCheckpointQuestions(checkpoint: CheckpointPayload) {
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

// Pair each option with its prewritten feedback (same index), then drop pairs
// whose option is blank so options/optionFeedback stay aligned.
function pairOptionsWithFeedback(options?: string[] | null, optionFeedback?: string[] | null) {
  const rawFeedback = optionFeedback ?? [];
  const pairs = (options ?? [])
    .map((option, optionIndex) => ({
      option: normalizeString(option),
      feedback: normalizeString(rawFeedback[optionIndex]),
    }))
    .filter((pair): pair is { option: string; feedback: string | null } => Boolean(pair.option));

  return {
    options: pairs.map((pair) => pair.option),
    optionFeedback: pairs.map((pair) => pair.feedback ?? ''),
  };
}

function normalizeGradingCriteria(criteria?: RubricCriterionPayload[] | null) {
  return (criteria ?? [])
    .map((criterion, index) => ({
      number: index + 1,
      criterion: normalizeString(criterion.prompt),
      ...pairOptionsWithFeedback(criterion.options, criterion.optionFeedback),
    }))
    .filter((criterion) => Boolean(criterion.criterion) || criterion.options.length > 0);
}

function buildRequirementSummary({
  badgeName,
  lessonTitle,
  skills,
  rubricItems,
  gradingCriteria,
  checkpoints,
  youtubeUrl,
  videoTitle,
  videoLength,
}: {
  badgeName: string;
  lessonTitle?: string | null;
  skills: string[];
  rubricItems: Array<{ number: number; text: string }>;
  gradingCriteria: Array<{ number: number; criterion: string | null; options: string[]; optionFeedback: string[] }>;
  checkpoints: CheckpointPayload[];
  youtubeUrl?: string | null;
  videoTitle?: string | null;
  videoLength?: string | null;
}) {
  return JSON.stringify({
    version: 2,
    badgeName,
    lessonTitle: lessonTitle ?? null,
    skills,
    rubricItems,
    gradingCriteria,
    // The lesson video round-trips through the summary JSON so the editor (which
    // only ever loads the source badge — whose requirement has no lesson row)
    // can rehydrate it. See badgeToDraft + the PATCH segment propagation.
    youtubeUrl: youtubeUrl ?? null,
    videoTitle: videoTitle ?? null,
    videoLength: videoLength ?? null,
    checkpoints: checkpoints
      .map((checkpoint, index) => {
        const questions = normalizeCheckpointQuestions(checkpoint).map((question) => question.summary);
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

function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, details: details ?? null }, { status: 400 });
}

function parseRequirementSummary(summary?: string | null) {
  if (!summary) {
    return {
      displayText: 'Independent badge requirement',
      skills: [] as string[],
      rubricItems: [] as Array<{ number: number; text: string }>,
      gradingCriteria: [] as Array<{ number: number; criterion: string | null; options: string[] }>,
      checkpoints: [] as CheckpointPayload[],
      youtubeUrl: null as string | null,
      videoTitle: null as string | null,
      videoLength: null as string | null,
    };
  }

  try {
    const parsed = JSON.parse(summary) as {
      skills?: string[];
      rubricItems?: Array<{ number?: number; text?: string | null }>;
      gradingCriteria?: Array<{
        number?: number;
        criterion?: string | null;
        options?: string[];
        optionFeedback?: string[];
      }>;
      checkpoints?: CheckpointPayload[];
      youtubeUrl?: string | null;
      videoTitle?: string | null;
      videoLength?: string | null;
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
      ...pairOptionsWithFeedback(criterion.options, criterion.optionFeedback),
    }));

    return {
      displayText: rubricItems[0]?.text ?? gradingCriteria[0]?.criterion ?? 'Independent badge requirement',
      skills: Array.isArray(parsed.skills) ? parsed.skills.filter((skill): skill is string => Boolean(skill)) : [],
      rubricItems,
      gradingCriteria,
      checkpoints: parsed.checkpoints ?? [],
      youtubeUrl: normalizeString(parsed.youtubeUrl),
      videoTitle: normalizeString(parsed.videoTitle),
      videoLength: normalizeString(parsed.videoLength),
    };
  } catch {
    return {
      displayText: summary,
      skills: [] as string[],
      rubricItems: [] as Array<{ number: number; text: string }>,
      gradingCriteria: [] as Array<{ number: number; criterion: string | null; options: string[] }>,
      checkpoints: [] as CheckpointPayload[],
      youtubeUrl: null as string | null,
      videoTitle: null as string | null,
      videoLength: null as string | null,
    };
  }
}

export async function GET(req: NextRequest) {
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

    // When a specific badgeId is requested (e.g. editing a course's imported badge
    // copy), return that owned badge regardless of sourceBadgeId. Otherwise return
    // the library list (source badges the user owns + global badges).
    const requestedBadgeId = normalizeString(req.nextUrl.searchParams.get('badgeId'));
    const badges = await prisma.badge.findMany({
      where: requestedBadgeId
        ? { id: requestedBadgeId, createdById: creator.id }
        : { sourceBadgeId: null, OR: [{ createdById: creator.id }, { createdById: null }] },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        category: true,
        availableOn: true,
        closesOn: true,
        neverCloses: true,
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
          availableOn: badge.availableOn?.toISOString() ?? null,
          closesOn: badge.closesOn?.toISOString() ?? null,
          neverCloses: badge.neverCloses ?? null,
          createdAt: badge.createdAt.toISOString(),
          assignedStudentCount: badge._count.studentProgress,
          requirements: badge.requirements.map((requirement) => {
            const parsedSummary = parseRequirementSummary(requirement.summary);

            return {
              id: requirement.id,
              summary: requirement.summary,
              displayText: parsedSummary.displayText,
              skills: parsedSummary.skills,
              rubricItems: parsedSummary.rubricItems,
              gradingCriteria: parsedSummary.gradingCriteria,
              checkpoints: parsedSummary.checkpoints,
              // Video lives in the summary JSON (the source badge has no lesson row);
              // expose it so badgeToDraft can rehydrate the editor's video field.
              youtubeUrl: parsedSummary.youtubeUrl,
              videoTitle: parsedSummary.videoTitle,
              videoLength: parsedSummary.videoLength,
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

    const editorEmail = clerkUser.emailAddresses[0].emailAddress.trim().toLowerCase();
    const editor = await prisma.user.findUnique({ where: { email: editorEmail }, select: { id: true } });

    if (!editor) {
      return NextResponse.json({ error: 'Creator user record was not found in the database.' }, { status: 404 });
    }

    const body = (await req.json()) as UpdateBadgePayload;
    const badgeId = normalizeString(body.id);
    const badgeName = normalizeString(body.badgeName);
    const badgeDescription = normalizeString(body.badgeDescription);
    const category = normalizeCategory(body.category);
    const skills = normalizeSkills(body.skills);
    const rubricOverview = normalizeString(body.rubricOverview);
    const rubricItems = normalizeRubricItems(body.rubricItems, rubricOverview);
    const gradingCriteria = normalizeGradingCriteria(body.gradingCriteria ?? body.rubricCriteria);
    const checkpoints = body.checkpoints ?? [];
    const neverCloses = body.neverCloses ?? null;
    const availableOn = parseDate(body.availableOn);
    const closesOn = body.neverCloses ? null : parseDate(body.closesOn);
    const youtubeUrl = normalizeString(body.youtubeUrl);
    const videoTitle = normalizeString(body.videoTitle);
    const videoLength = normalizeString(body.videoLength);
    const videoDurationSeconds = parseTimeToSeconds(videoLength);
    const videoId = extractYouTubeId(youtubeUrl);
    const thumbnailUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;

    if (!badgeId) {
      return badRequest('Badge id is required.');
    }

    if (!badgeName) {
      return badRequest('Badge name is required.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Ownership filter: only the badge's creator may edit it. A non-owner (or
      // unknown id) matches no row and Prisma throws P2025 -> 404 below.
      const badge = await tx.badge.update({
        where: { id: badgeId, createdById: editor.id },
        data: {
          name: badgeName,
          description: badgeDescription,
          category,
          availableOn,
          closesOn,
          neverCloses,
        },
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          category: true,
          sourceBadgeId: true,
        },
      });

      // Keep the per-badge content window consistent across the source badge
      // and all its course copies (availability is shared, not per-copy).
      const familyRootId = badge.sourceBadgeId ?? badge.id;
      await tx.badge.updateMany({
        where: {
          OR: [{ id: familyRootId }, { sourceBadgeId: familyRootId }],
          NOT: { id: badge.id },
          createdById: editor.id,
        },
        data: { availableOn, closesOn, neverCloses },
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

      const requirementSummary = buildRequirementSummary({
        badgeName,
        lessonTitle: badgeName,
        skills,
        rubricItems,
        gradingCriteria,
        checkpoints,
        youtubeUrl,
        videoTitle,
        videoLength,
      });

      if (firstRequirement) {
        await tx.badgeRequirement.update({
          where: { id: firstRequirement.id },
          data: { summary: requirementSummary },
        });
      } else {
        await tx.badgeRequirement.create({
          data: {
            badgeId,
            summary: requirementSummary,
          },
        });
      }

      // Sync the rest of the badge family's requirement summaries so course
      // copies don't keep a stale rubric/skills after a source-badge edit.
      const otherFamilyBadges = await tx.badge.findMany({
        where: {
          OR: [{ id: familyRootId }, { sourceBadgeId: familyRootId }],
          NOT: { id: badge.id },
          createdById: editor.id,
        },
        select: { id: true },
      });

      if (otherFamilyBadges.length > 0) {
        await tx.badgeRequirement.updateMany({
          where: { badgeId: { in: otherFamilyBadges.map((familyBadge) => familyBadge.id) } },
          data: { summary: requirementSummary },
        });
      }

      // Keep course-copy lessons aligned with the badge title students see,
      // while the first segment stores the video-specific metadata.
      if (badgeName) {
        const familyBadgeIds = [badge.id, ...otherFamilyBadges.map((familyBadge) => familyBadge.id)];
        const requirementsWithLessons = await tx.badgeRequirement.findMany({
          where: { badgeId: { in: familyBadgeIds }, lessonId: { not: null } },
          select: { lessonId: true },
        });
        const lessonIds = Array.from(
          new Set(
            requirementsWithLessons.map((requirement) => requirement.lessonId).filter((id): id is string => Boolean(id))
          )
        );

        if (lessonIds.length > 0) {
          await tx.lesson.updateMany({
            where: { id: { in: lessonIds } },
            data: {
              title: badgeName,
              estimatedMinutes: videoDurationSeconds ? Math.max(1, Math.round(videoDurationSeconds / 60)) : undefined,
            },
          });

          await tx.lessonSkill.deleteMany({
            where: { lessonId: { in: lessonIds } },
          });

          if (skills.length > 0) {
            await tx.lessonSkill.createMany({
              data: lessonIds.flatMap((lessonId) =>
                skills.map((skill, skillIndex) => ({
                  lessonId,
                  sortOrder: skillIndex,
                  text: skill,
                }))
              ),
            });
          }

          // Update only the first segment (lowest sortOrder) of each lesson — the
          // one POST/import seeds with the video. Prisma can't do distinct-on, so
          // fetch ordered and keep the first id seen per lesson.
          const segments = await tx.lessonSegment.findMany({
            where: { lessonId: { in: lessonIds } },
            orderBy: [{ lessonId: 'asc' }, { sortOrder: 'asc' }],
            select: { id: true, lessonId: true },
          });
          const firstSegmentIdByLesson = new Map<string, string>();
          for (const segment of segments) {
            if (!firstSegmentIdByLesson.has(segment.lessonId)) {
              firstSegmentIdByLesson.set(segment.lessonId, segment.id);
            }
          }
          const firstSegmentIds = Array.from(firstSegmentIdByLesson.values());

          if (firstSegmentIds.length > 0 && (youtubeUrl || videoTitle || videoDurationSeconds || thumbnailUrl)) {
            await tx.lessonSegment.updateMany({
              where: { id: { in: firstSegmentIds } },
              data: {
                videoUrl: youtubeUrl ?? undefined,
                title: videoTitle ?? undefined,
                duration: videoDurationSeconds || undefined,
                thumbnailUrl: thumbnailUrl ?? undefined,
              },
            });
          }

          if (checkpoints.length > 0) {
            for (const lessonId of lessonIds) {
              const firstSegmentId = firstSegmentIdByLesson.get(lessonId) ?? null;

              for (const [checkpointIndex, checkpoint] of checkpoints.entries()) {
                const title = normalizeString(checkpoint.title) ?? `Checkpoint ${checkpointIndex + 1}`;
                const questions = normalizeCheckpointQuestions(checkpoint);
                const lessonCheckpoint = await tx.lessonCheckpoint.upsert({
                  where: {
                    lessonId_sortOrder: {
                      lessonId,
                      sortOrder: checkpointIndex,
                    },
                  },
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
                      checkpointId_sortOrder: {
                        checkpointId: lessonCheckpoint.id,
                        sortOrder: question.sortOrder,
                      },
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
    const videoTitle = normalizeString(body.videoTitle);
    const youtubeUrl = normalizeString(body.youtubeUrl);
    const category = normalizeCategory(body.category);
    const checkpoints = body.checkpoints ?? [];
    const skills = normalizeSkills(body.skills);
    const rubricOverview = normalizeString(body.rubricOverview);
    const rubricItems = normalizeRubricItems(body.rubricItems, rubricOverview);
    const gradingCriteria = normalizeGradingCriteria(body.gradingCriteria ?? body.rubricCriteria);
    // Per-badge content window (shared across students). neverCloses === true
    // means the badge never closes; closesOn is ignored and dueDate is null.
    const neverCloses = body.neverCloses ?? null;
    const availableOn = parseDate(body.availableOn);
    const closesOn = body.neverCloses ? null : parseDate(body.closesOn);
    const dueDate = closesOn;
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
          lessonTitle: badgeName,
          skills,
          rubricItems,
          gradingCriteria,
          checkpoints,
          youtubeUrl,
          videoTitle,
          videoLength: normalizeString(body.videoLength),
        });

        const sourceBadge = await tx.badge.create({
          data: {
            slug: sourceBadgeSlug,
            name: badgeName,
            description: badgeDescription,
            category,
            availableOn,
            closesOn,
            neverCloses,
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
              availableOn,
              closesOn,
              neverCloses,
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
              title: badgeName,
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

          const lessonId = lesson.id;

          if (skills.length > 0) {
            await tx.lessonSkill.createMany({
              data: skills.map((skill, skillIndex) => ({
                lessonId,
                sortOrder: skillIndex,
                text: skill,
              })),
            });
          }

          // Precompute each checkpoint's normalized data once, keyed by its sortOrder
          // (== checkpointIndex). We batch-create checkpoints, read their generated ids
          // back via the (lessonId, sortOrder) unique key, then batch-create questions.
          // Capture lesson in a non-null local so the map closure narrows correctly.
          const checkpointPlans = checkpoints.map((checkpoint, checkpointIndex) => {
            const title = normalizeString(checkpoint.title) ?? `Checkpoint ${checkpointIndex + 1}`;
            const questions = normalizeCheckpointQuestions(checkpoint);

            return {
              sortOrder: checkpointIndex,
              questions,
              data: {
                lessonId,
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
