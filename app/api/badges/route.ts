// Issues: #247 badge image zoom
import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { BadgeRelationType, Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { normalizeRubricGoal, normalizePassingPercent, normalizeBadgePolicy } from '@/lib/badges/badge.service';
import { parseTimeToSeconds, parseDate } from '@/lib/utils';
import { normalizeString, normalizeSkills } from '@/lib/checkpoints/normalizeWrite';
import { CreateBadgePayload, UpdateBadgePayload } from '@/lib/badges/types';
import {
  BadgeImageValidationError,
  normalizeBadgeImagePosition,
  normalizeBadgeImageScale,
  normalizeBadgeImageUrl,
} from '@/lib/badges/badge-image';
import {
  BadgeRelationError,
  loadRelationEdges,
  loadRelationsByRoot,
  resolveFamilyRootId,
} from '@/lib/badges/badge-relations.service';
import { reconcileCoursesForFamilies } from '@/lib/badges/badge-satisfaction.service';
import {
  executeBadgeCreationTx,
  executeBadgePatchTx,
  executeFetchBadges,
  parseRequirementSummary,
} from '@/lib/badges/badge.service';

// undefined (field omitted) leaves relations untouched; null/[] clears them.
function normalizeRelationIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return value
    .map((id) => (typeof id === 'string' ? normalizeString(id) : null))
    .filter((id): id is string => Boolean(id));
}

// Rich-text (HTML) fields are stored verbatim, but an "empty" editor still
// serializes to markup like `<p><br></p>`. Treat markup with no visible text
// or embedded media as empty so it persists as null.

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

    const badges = await executeFetchBadges({
      creatorId: creator.id,
      requestedBadgeId: requestedBadgeId ?? null,
    });

    if (!badges) {
      return NextResponse.json({ error: 'No badges found.' }, { status: 404 });
    }

    // Prerequisites live on the family root, so an edited course copy shows its
    // template's. The full edge list lets the wizard hide choices that would loop.
    const rootIds = badges.map(resolveFamilyRootId);
    const [prerequisitesByRoot, satisfiesByRoot, relationEdges] = await Promise.all([
      loadRelationsByRoot(prisma, rootIds, BadgeRelationType.PREREQUISITE),
      loadRelationsByRoot(prisma, rootIds, BadgeRelationType.SATISFIES),
      loadRelationEdges(prisma),
    ]);

    return NextResponse.json(
      {
        count: badges.length,
        relationEdges,
        badges: badges.map((badge) => ({
          id: badge.id,
          slug: badge.slug,
          name: badge.name,
          description: badge.description,
          imageUrl: badge.imageUrl,
          imagePositionX: badge.imagePositionX,
          imagePositionY: badge.imagePositionY,
          imageScale: badge.imageScale,
          availableOn: badge.availableOn?.toISOString() ?? null,
          closesOn: badge.closesOn?.toISOString() ?? null,
          neverCloses: badge.neverCloses ?? null,
          // Authored assessment policy so the editor rehydrates the real values
          // instead of the draft defaults (which a save would then persist).
          reassessmentLimit: badge.reassessmentLimit ?? null,
          cooldownDays: badge.cooldownDays ?? null,
          reassessmentRequired: badge.reassessmentRequired ?? null,
          familyRootId: resolveFamilyRootId(badge),
          prerequisites: prerequisitesByRoot.get(resolveFamilyRootId(badge)) ?? [],
          satisfies: satisfiesByRoot.get(resolveFamilyRootId(badge)) ?? [],
          createdAt: badge.createdAt.toISOString(),
          assignedStudentCount: badge._count.studentProgress,
          rubricGoal: badge.rubricGoal,
          requirements: badge.requirements.map((requirement) => {
            const parsedSummary = parseRequirementSummary(requirement.summary);

            return {
              id: requirement.id,
              summary: requirement.summary,
              displayText: badge.rubricGoal?.name ?? parsedSummary.displayText,
              skills: parsedSummary.skills,
              checkpoints: parsedSummary.checkpoints,
              // Video lives in the summary JSON (the source badge has no lesson row);
              // expose it so badgeToDraft can rehydrate the editor's video field.
              youtubeUrl: parsedSummary.youtubeUrl,
              videoTitle: parsedSummary.videoTitle,
              videoLength: parsedSummary.videoLength,
              passingPercent: parsedSummary.passingPercent,
              lesson: requirement.lesson
                ? {
                    id: requirement.lesson.id,
                    title: requirement.lesson.title,
                    description: requirement.lesson.description,
                    dueDate: requirement.lesson.dueDate?.toISOString() ?? null,
                    estimatedMinutes: requirement.lesson.estimatedMinutes,
                    passingPercent: requirement.lesson.passingPercent,
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
    const imageUrl = normalizeBadgeImageUrl(body.imageUrl);
    const imagePositionX = normalizeBadgeImagePosition(body.imagePositionX);
    const imagePositionY = normalizeBadgeImagePosition(body.imagePositionY);
    // Issue #247: zoom, clamped separately from the pan coordinates.
    const imageScale = normalizeBadgeImageScale(body.imageScale);
    const skills = normalizeSkills(body.skills);
    const rubricGoal = normalizeRubricGoal(body.rubricGoal);
    const checkpoints = body.checkpoints ?? [];
    const neverCloses = body.neverCloses ?? null;
    const availableOn = parseDate(body.availableOn);
    const closesOn = body.neverCloses ? null : parseDate(body.closesOn);
    const youtubeUrl = normalizeString(body.youtubeUrl);
    const videoTitle = normalizeString(body.videoTitle);
    const videoLength = normalizeString(body.videoLength);
    const videoDurationSeconds = parseTimeToSeconds(videoLength);
    const passingPercent = normalizePassingPercent(body.passingPercent);
    const badgePolicy = normalizeBadgePolicy(body);
    const prerequisiteBadgeIds = normalizeRelationIds(body.prerequisiteBadgeIds);
    const satisfiesBadgeIds = normalizeRelationIds(body.satisfiesBadgeIds);

    if (!badgeId) {
      return NextResponse.json({ error: 'Badge id is required.' }, { status: 400 });
    }

    if (!badgeName) {
      return NextResponse.json({ error: 'Badge name is required.' }, { status: 400 });
    }

    if (availableOn && closesOn && closesOn <= availableOn) {
      return NextResponse.json({ error: 'Badge due date must be after its availability date.' }, { status: 400 });
    }

    const updated = await executeBadgePatchTx({
      editorId: editor.id,
      badgeId,
      badgeName,
      badgeDescription,
      imageUrl,
      imagePositionX,
      imagePositionY,
      imageScale,
      skills,
      rubricGoal,
      checkpoints,
      availableOn,
      closesOn,
      neverCloses,
      youtubeVideoUrl: youtubeUrl,
      videoTitle,
      videoLength,
      videoSeconds: videoDurationSeconds,
      passingPercentage: passingPercent,
      badgePolicy,
      prerequisiteBadgeIds,
      satisfiesBadgeIds,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Badge not found.' }, { status: 404 });
    }

    const { familyRootId, satisfiesChanged, ...badge } = updated;
    // Retroactive: students who already completed this badge earn (or lose) its
    // targets as soon as the edges change.
    const reconcile = satisfiesChanged ? await reconcileCoursesForFamilies([familyRootId]) : null;

    return NextResponse.json(
      {
        message: 'Badge updated successfully.',
        badge,
        ...(reconcile?.failedCourseIds.length
          ? {
              warning:
                'Saved, but some students could not be awarded the badges this one earns yet. They will be updated the next time their progress changes.',
            }
          : {}),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('PATCH /api/badges failed:', error);

    if (error instanceof BadgeRelationError) {
      return NextResponse.json({ error: error.message, ...error.details }, { status: error.status });
    }

    if (error instanceof BadgeImageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

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
    const imageUrl = normalizeBadgeImageUrl(body.imageUrl);
    const imagePositionX = normalizeBadgeImagePosition(body.imagePositionX);
    const imagePositionY = normalizeBadgeImagePosition(body.imagePositionY);
    // Issue #247: zoom, clamped separately from the pan coordinates.
    const imageScale = normalizeBadgeImageScale(body.imageScale);
    const videoTitle = normalizeString(body.videoTitle);
    const youtubeUrl = normalizeString(body.youtubeUrl);
    const checkpoints = body.checkpoints ?? [];
    const skills = normalizeSkills(body.skills);
    const rubricGoal = normalizeRubricGoal(body.rubricGoal);
    const passingPercent = normalizePassingPercent(body.passingPercent);
    // Authored assessment-policy defaults live on the Badge and flow to students
    // via inheritance (lib/badgePolicy).
    const badgePolicy = normalizeBadgePolicy(body);
    // Per-badge content window (shared across students). neverCloses === true
    // means the badge never closes; closesOn is ignored and dueDate is null.
    const neverCloses = body.neverCloses ?? null;
    const availableOn = parseDate(body.availableOn);
    const closesOn = body.neverCloses ? null : parseDate(body.closesOn);
    const videoDurationSeconds = parseTimeToSeconds(body.videoLength);
    const prerequisiteBadgeIds = normalizeRelationIds(body.prerequisiteBadgeIds);
    const satisfiesBadgeIds = normalizeRelationIds(body.satisfiesBadgeIds);

    if (!badgeName) {
      return NextResponse.json({ error: 'Badge name is required.' }, { status: 400 });
    }

    if (availableOn && closesOn && closesOn <= availableOn) {
      return NextResponse.json({ error: 'Badge due date must be after its availability date.' }, { status: 400 });
    }

    const created = await executeBadgeCreationTx({
      creatorId: creator.id,
      courseId,
      badgeName,
      badgeDescription,
      imageUrl,
      imagePositionX,
      imagePositionY,
      imageScale,
      skills,
      rubricGoal,
      checkpoints,
      availableOn,
      closesOn,
      neverCloses,
      youtubeVideoUrl: youtubeUrl,
      videoTitle,
      videoLength: body.videoLength,
      videoDurationSeconds: videoDurationSeconds,
      passingPercentage: passingPercent,
      badgePolicy,
      prerequisiteBadgeIds,
      satisfiesBadgeIds,
    });

    if ('error' in created) {
      return NextResponse.json({ error: created.error }, { status: created.status });
    }

    return NextResponse.json(
      {
        message: 'Badge created successfully.',
        ...created,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/badges failed:', error);

    if (error instanceof BadgeRelationError) {
      return NextResponse.json({ error: error.message, ...error.details }, { status: error.status });
    }

    if (error instanceof BadgeImageValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'A badge or lesson with this slug already exists.' }, { status: 409 });
    }

    return NextResponse.json({ error: 'Failed to create badge.' }, { status: 500 });
  }
}
