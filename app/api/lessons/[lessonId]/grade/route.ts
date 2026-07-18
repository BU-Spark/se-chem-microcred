import { NextResponse } from 'next/server';
import { BadgeStatus, LessonStatus, SegmentStatus, SurveyContext } from '@prisma/client';
import { currentUser } from '@clerk/nextjs/server';
import prisma from '../../../../../lib/prisma';
import { computeLessonGrade } from '../../../../../lib/lessonGrading';
import { syncLessonBadgesForStudent } from '../../../../../lib/badgeProgress';

type RouteContext = {
  params: Promise<{
    lessonId: string;
  }>;
};

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

export async function POST(_request: Request, context: RouteContext) {
  const { lessonId } = await context.params;

  if (!lessonId) {
    return NextResponse.json({ error: 'Missing lesson id.' }, { status: 400 });
  }

  const clerkUser = await currentUser();
  if (!clerkUser || !clerkUser.emailAddresses?.[0]) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = clerkUser.emailAddresses[0].emailAddress.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  }

  // The lesson lookup (for passingPercent + checkpoint ids) and the grade
  // computation both depend only on lessonId/userId, not on each other, so run
  // them concurrently instead of as two serial Accelerate round-trips.
  const [lesson, grade] = await Promise.all([
    prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        checkpoints: {
          select: { id: true },
        },
      },
    }),
    computeLessonGrade(prisma, { lessonId, userId: user.id }),
  ]);

  if (!lesson) {
    return NextResponse.json({ error: 'Lesson not found.' }, { status: 404 });
  }

  const passingPercent = lesson.passingPercent ?? 0;
  const passed = grade.percent >= passingPercent;
  const now = new Date();

  const checkpointIds = lesson.checkpoints.map((checkpoint) => checkpoint.id);

  await prisma.$transaction(async (tx) => {
    const lessonSurveyPrompts = await tx.surveyPrompt.findMany({
      where: { context: SurveyContext.LESSON, lessonId },
      select: { id: true },
    });

    const progress = await tx.lessonProgress.upsert({
      where: { studentId_lessonId: { studentId: user.id, lessonId } },
      update: {
        lastGradePercent: grade.percent,
        lastGradePassed: passed,
        lastGradedAt: now,
        status: passed ? LessonStatus.COMPLETED : LessonStatus.IN_PROGRESS,
        percentComplete: passed ? 100 : 0,
      },
      create: {
        studentId: user.id,
        lessonId,
        status: passed ? LessonStatus.COMPLETED : LessonStatus.IN_PROGRESS,
        percentComplete: passed ? 100 : 0,
        lastGradePercent: grade.percent,
        lastGradePassed: passed,
        lastGradedAt: now,
      },
    });

    if (!passed) {
      if (lessonSurveyPrompts.length > 0) {
        await tx.surveyResponse.deleteMany({
          where: { studentId: user.id, promptId: { in: lessonSurveyPrompts.map((p) => p.id) } },
        });
      }

      if (checkpointIds.length > 0) {
        await tx.checkpointResponse.deleteMany({
          where: { studentId: user.id, checkpointId: { in: checkpointIds } },
        });
        await tx.checkpointAttempt.deleteMany({
          where: { userId: user.id, checkpointId: { in: checkpointIds } },
        });
      }

      await tx.segmentProgress.updateMany({
        where: { lessonProgressId: progress.id },
        data: { status: SegmentStatus.NOT_STARTED, completedAt: null, startedAt: null },
      });

      await tx.lessonProgress.update({
        where: { id: progress.id },
        data: {
          status: LessonStatus.IN_PROGRESS,
          percentComplete: 0,
          startedAt: null,
          completedAt: null,
        },
      });

      // Failing a required lesson un-clears QEV: knock the badge back to LEARNING
      // and drop qevPassedAt so the milestone doesn't claim a pass the student no
      // longer has. Only badges still waiting to be assessed are affected — an
      // already-assessed badge (IN_REVIEW/COMPLETED/LOCKED) isn't reset here.
      await tx.studentBadge.updateMany({
        where: {
          studentId: user.id,
          status: BadgeStatus.READY_FOR_ASSESSMENT,
          badge: {
            requirements: {
              some: { lessonId },
            },
          },
        },
        data: { status: BadgeStatus.LEARNING, qevPassedAt: null, cooldownUntil: null },
      });
    }

    await syncLessonBadgesForStudent(tx, { studentId: user.id, lessonId });
  });

  return NextResponse.json({
    passed,
    gradePercent: roundPercent(grade.percent),
    passingPercent,
    correctAnswers: grade.correctAnswers,
    totalQuestions: grade.totalQuestions,
  });
}
