import { NextResponse } from 'next/server';
import { LessonStatus, SurveyContext } from '@prisma/client';
import prisma from '../../../../../lib/prisma';
import { isValidRating } from '../../../../../lib/surveyRatings';

type RouteContext = {
  params: Promise<{
    lessonId: string;
  }>;
};

interface LessonSurveyPayload {
  email?: string;
  rating?: number;
  comment?: string | null;
}

// The QEV rating: after a student passes a lesson they rate the experience 1–5.
// Lesson surveys were removed in fc90199 when "Finish lesson" replaced the old
// end-of-video survey; this route brings back only the rating, and no longer
// finalizes anything — POST /api/lessons/[lessonId]/grade still owns completion.
//
// Only passing students may rate, so the aggregate on the badge page needs no
// filtering: everything stored here already counts.
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

  if (!isValidRating(payload.rating)) {
    return NextResponse.json({ error: 'A rating from 1 to 5 is required.' }, { status: 400 });
  }

  const email = payload.email.trim().toLowerCase();
  const rating = payload.rating;

  const [user, lesson] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true, title: true } }),
  ]);

  if (!user) {
    return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  }

  if (!lesson) {
    return NextResponse.json({ error: 'Lesson not found.' }, { status: 404 });
  }

  const progress = await prisma.lessonProgress.findUnique({
    where: { studentId_lessonId: { studentId: user.id, lessonId } },
    select: { status: true, lastGradePassed: true },
  });

  // Mirrors the QEV bar in lib/badgeReadiness.ts: completed *and* passed.
  const passed = progress?.status === LessonStatus.COMPLETED && progress.lastGradePassed === true;

  if (!passed) {
    return NextResponse.json({ error: 'Finish and pass this lesson before rating it.' }, { status: 409 });
  }

  // Prompts are created lazily: lessons that predate the QEV rating have none,
  // and creating one per lesson up front would leave rows for lessons nobody
  // ever finishes.
  const prompt =
    (await prisma.surveyPrompt.findFirst({
      where: { lessonId, context: SurveyContext.LESSON },
      select: { id: true },
    })) ??
    (await prisma.surveyPrompt.create({
      data: {
        context: SurveyContext.LESSON,
        lessonId,
        question: `How was the lesson "${lesson.title}"?`,
      },
      select: { id: true },
    }));

  // Re-rating overwrites: a student who redoes the lesson is rating the same
  // material, and the latest opinion is the one worth aggregating. SurveyResponse
  // has no unique key on (promptId, studentId), so this is find-then-write rather
  // than an upsert; a concurrent double-submit could still create two rows.
  const existing = await prisma.surveyResponse.findFirst({
    where: { promptId: prompt.id, studentId: user.id },
    select: { id: true },
  });

  if (existing) {
    await prisma.surveyResponse.update({
      where: { id: existing.id },
      data: { rating, comment: payload.comment ?? null },
    });
  } else {
    await prisma.surveyResponse.create({
      data: {
        promptId: prompt.id,
        studentId: user.id,
        rating,
        comment: payload.comment ?? null,
      },
    });
  }

  return NextResponse.json({ rating }, { status: 200 });
}
