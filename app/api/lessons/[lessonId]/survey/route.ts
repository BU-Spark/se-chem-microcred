import { NextResponse } from 'next/server';
import { BadgeStatus, LessonStatus, SurveyContext } from '@prisma/client';
import prisma from '../../../../../lib/prisma';

type RouteContext = {
  params: Promise<{
    lessonId: string;
  }>;
};

interface LessonSurveyPayload {
  email?: string;
  rating?: number;
  comment?: string | null;
  videoCompleted?: boolean;
}

export async function POST(request: Request, context: RouteContext) {
  const { lessonId } = await context.params;

  if (!lessonId) {
    return NextResponse.json({ error: 'Missing lesson id.' }, { status: 400 });
  }

  let payload: LessonSurveyPayload;

  try {
    payload = (await request.json()) as LessonSurveyPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  if (!payload.email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  }

  const email = payload.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  }

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, title: true },
  });

  if (!lesson) {
    return NextResponse.json({ error: 'Lesson not found.' }, { status: 404 });
  }

  let surveyPrompt =
    (await prisma.surveyPrompt.findFirst({
      where: {
        lessonId,
        context: SurveyContext.LESSON,
      },
      select: { id: true },
    })) ?? null;

  if (!surveyPrompt) {
    const question = lesson?.title ? `How was the lesson "${lesson.title}"?` : 'How was this lesson?';
    surveyPrompt = await prisma.surveyPrompt.create({
      data: {
        context: SurveyContext.LESSON,
        lessonId,
        question,
      },
      select: { id: true },
    });
  }

  let lessonProgress =
    (await prisma.lessonProgress.findFirst({
      where: {
        studentId: user.id,
        lessonId,
      },
    })) ?? null;

  if (!lessonProgress) {
    lessonProgress = await prisma.lessonProgress.create({
      data: {
        studentId: user.id,
        lessonId,
        status: LessonStatus.IN_PROGRESS,
        percentComplete: 0,
      },
    });
  }

  if (payload.videoCompleted) {
    await prisma.lessonProgress.update({
      where: { id: lessonProgress.id },
      data: {
        status: LessonStatus.COMPLETED,
        completedAt: lessonProgress.completedAt ?? new Date(),
        percentComplete: 100,
      },
    });
  }

  const existingResponse = await prisma.surveyResponse.findFirst({
    where: {
      promptId: surveyPrompt.id,
      studentId: user.id,
    },
  });

  if (existingResponse) {
    await prisma.surveyResponse.update({
      where: { id: existingResponse.id },
      data: {
        rating: payload.rating ?? existingResponse.rating,
        comment: payload.comment ?? existingResponse.comment,
      },
    });
  } else {
    await prisma.surveyResponse.create({
      data: {
        promptId: surveyPrompt.id,
        studentId: user.id,
        rating: payload.rating ?? 3,
        comment: payload.comment ?? null,
      },
    });
  }

  const [lessonCheckpoints, passedAttempts] = await Promise.all([
    prisma.lessonCheckpoint.findMany({
      where: { lessonId },
      select: { id: true },
    }),
    prisma.checkpointAttempt.findMany({
      where: {
        userId: user.id,
        isPassing: true,
        checkpoint: {
          lessonId,
        },
      },
      select: { checkpointId: true },
    }),
  ]);

  const passedCheckpointIds = new Set(passedAttempts.map((entry) => entry.checkpointId));
  const allCheckpointsPassed = lessonCheckpoints.every((checkpoint) => passedCheckpointIds.has(checkpoint.id));
  const videoCompleted = Boolean(payload.videoCompleted);

  let readyForAssessment = false;

  if (allCheckpointsPassed && videoCompleted) {
    const badgeRequirement = await prisma.badgeRequirement.findFirst({
      where: { lessonId },
      select: { badgeId: true },
    });

    if (badgeRequirement) {
      const studentBadge = await prisma.studentBadge.findUnique({
        where: {
          studentId_badgeId: {
            studentId: user.id,
            badgeId: badgeRequirement.badgeId,
          },
        },
      });

      if (studentBadge && studentBadge.status === BadgeStatus.LEARNING) {
        await prisma.studentBadge.update({
          where: { id: studentBadge.id },
          data: {
            status: BadgeStatus.READY_FOR_ASSESSMENT,
          },
        });
        readyForAssessment = true;
      }
    }
  }

  return NextResponse.json({
    surveyCompleted: true,
    readyForAssessment,
  });
}
