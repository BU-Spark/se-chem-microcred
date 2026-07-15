import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { canCreateContent } from '@/lib/adminAccess';
import { normalizeRubricGoal, normalizePassingPercent } from '@/lib/badges/badge.service';
import { parseTimeToSeconds, parseDate } from '@/lib/utils';
import { normalizeString, normalizeSkills } from '@/lib/checkpoints/normalizeWrite';
import { CreateBadgePayload, UpdateBadgePayload } from '@/lib/badges/types';
import {
  executeBadgeCreationTx,
  executeBadgePatchTx,
  executeFetchBadges,
  parseRequirementSummary,
} from '@/lib/badges/badge.service';

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
    return NextResponse.json(
      {
        count: badges.length,
        badges: badges.map((badge) => ({
          id: badge.id,
          slug: badge.slug,
          name: badge.name,
          description: badge.description,
          availableOn: badge.availableOn?.toISOString() ?? null,
          closesOn: badge.closesOn?.toISOString() ?? null,
          neverCloses: badge.neverCloses ?? null,
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

    if (!badgeId) {
      return NextResponse.json({ error: 'Badge id is required.' }, { status: 400 });
    }

    if (!badgeName) {
      return NextResponse.json({ error: 'Badge name is required.' }, { status: 400 });
    }

    const updated = await executeBadgePatchTx({
      editorId: editor.id,
      badgeId,
      badgeName,
      badgeDescription,
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
    });

    if (!updated) {
      return NextResponse.json({ error: 'Badge not found.' }, { status: 404 });
    }
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

    // Alpha lock: creation is temporarily restricted to allowlisted accounts.
    // Reversible by clearing ALPHA_ADMIN_EMAILS (see lib/adminAccess.ts).
    if (!canCreateContent(creatorEmail)) {
      return NextResponse.json({ error: 'Badge creation is restricted during the alpha test.' }, { status: 403 });
    }

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
    const checkpoints = body.checkpoints ?? [];
    const skills = normalizeSkills(body.skills);
    const rubricGoal = normalizeRubricGoal(body.rubricGoal);
    const passingPercent = normalizePassingPercent(body.passingPercent);
    // Per-badge content window (shared across students). neverCloses === true
    // means the badge never closes; closesOn is ignored and dueDate is null.
    const neverCloses = body.neverCloses ?? null;
    const availableOn = parseDate(body.availableOn);
    const closesOn = body.neverCloses ? null : parseDate(body.closesOn);
    const videoDurationSeconds = parseTimeToSeconds(body.videoLength);

    if (!badgeName) {
      return NextResponse.json({ error: 'Badge name is required.' }, { status: 400 });
    }

    const created = await executeBadgeCreationTx({
      creatorId: creator.id,
      courseId,
      badgeName,
      badgeDescription,
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

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'A badge or lesson with this slug already exists.' }, { status: 409 });
    }

    return NextResponse.json({ error: 'Failed to create badge.' }, { status: 500 });
  }
}
