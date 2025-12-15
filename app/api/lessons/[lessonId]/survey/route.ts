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

  const { readyForAssessment } = await prisma.$transaction(async (tx) => {
    let surveyPromptRecord =
      (await tx.surveyPrompt.findFirst({
        where: {
          lessonId,
          context: SurveyContext.LESSON,
        },
        select: { id: true, question: true },
      })) ?? null;

    if (!surveyPromptRecord) {
      const question = lesson?.title ? `How was the lesson "${lesson.title}"?` : 'How was this lesson?';
      surveyPromptRecord = await tx.surveyPrompt.create({
        data: {
          context: SurveyContext.LESSON,
          lessonId,
          question,
        },
        select: { id: true, question: true },
      });
    }

    let lessonProgressRecord =
      (await tx.lessonProgress.findFirst({
        where: {
          studentId: user.id,
          lessonId,
        },
      })) ?? null;

    if (!lessonProgressRecord) {
      lessonProgressRecord = await tx.lessonProgress.create({
        data: {
          studentId: user.id,
          lessonId,
          status: LessonStatus.IN_PROGRESS,
          percentComplete: 0,
        },
      });
    }

    if (payload.videoCompleted) {
      lessonProgressRecord = await tx.lessonProgress.update({
        where: { id: lessonProgressRecord.id },
        data: {
          status: LessonStatus.COMPLETED,
          completedAt: lessonProgressRecord.completedAt ?? new Date(),
          percentComplete: 100,
        },
      });
    }

    const existingResponse = await tx.surveyResponse.findFirst({
      where: {
        promptId: surveyPromptRecord.id,
        studentId: user.id,
      },
    });

    if (existingResponse) {
      await tx.surveyResponse.update({
        where: { id: existingResponse.id },
        data: {
          rating: payload.rating ?? existingResponse.rating,
          comment: payload.comment ?? existingResponse.comment,
        },
      });
    } else {
      await tx.surveyResponse.create({
        data: {
          promptId: surveyPromptRecord.id,
          studentId: user.id,
          rating: payload.rating ?? 3,
          comment: payload.comment ?? null,
        },
      });
    }

    const [lessonCheckpoints, passedAttempts] = await Promise.all([
      tx.lessonCheckpoint.findMany({
        where: { lessonId },
        select: { id: true },
      }),
      tx.checkpointAttempt.findMany({
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
    const allCheckpointsPassed =
      lessonCheckpoints.length === 0 || lessonCheckpoints.every((checkpoint) => passedCheckpointIds.has(checkpoint.id));
    const videoCompleted =
      lessonProgressRecord.status === LessonStatus.COMPLETED ||
      lessonProgressRecord.percentComplete === 100 ||
      payload.videoCompleted;

    let readyForAssessment = false;

    if (allCheckpointsPassed && videoCompleted) {
      const badgeRequirement = await tx.badgeRequirement.findFirst({
        where: { lessonId },
        select: { badgeId: true },
      });

      if (badgeRequirement) {
        const studentBadge = await tx.studentBadge.findUnique({
          where: {
            studentId_badgeId: {
              studentId: user.id,
              badgeId: badgeRequirement.badgeId,
            },
          },
        });

        if (studentBadge && studentBadge.status === BadgeStatus.LEARNING) {
          await tx.studentBadge.update({
            where: { id: studentBadge.id },
            data: {
              status: BadgeStatus.READY_FOR_ASSESSMENT,
            },
          });
          readyForAssessment = true;
        }
      }
    }

    return { surveyPrompt: surveyPromptRecord, lessonProgress: lessonProgressRecord, readyForAssessment };
  });

  return NextResponse.json({
    surveyCompleted: true,
    readyForAssessment,
  });
}
