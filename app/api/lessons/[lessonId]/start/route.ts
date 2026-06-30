import { LessonStatus } from '@prisma/client';
import { currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import { syncLessonBadgesForStudent } from '../../../../../lib/badgeProgress';

type RouteContext = {
  params: Promise<{
    lessonId: string;
  }>;
};

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
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (!user) {
    return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  }

  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true } });

  if (!lesson) {
    return NextResponse.json({ error: 'Lesson not found.' }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    const existingProgress = await tx.lessonProgress.findUnique({
      where: {
        studentId_lessonId: {
          studentId: user.id,
          lessonId,
        },
      },
    });

    if (!existingProgress) {
      await tx.lessonProgress.create({
        data: {
          studentId: user.id,
          lessonId,
          status: LessonStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
      });
    } else if (existingProgress.status !== LessonStatus.COMPLETED) {
      await tx.lessonProgress.update({
        where: { id: existingProgress.id },
        data: {
          status: LessonStatus.IN_PROGRESS,
          startedAt: existingProgress.startedAt ?? new Date(),
        },
      });
    }

    await syncLessonBadgesForStudent(tx, { studentId: user.id, lessonId });
  });

  return NextResponse.json({ status: LessonStatus.IN_PROGRESS });
}
