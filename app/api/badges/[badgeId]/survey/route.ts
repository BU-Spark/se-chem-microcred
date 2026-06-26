import { NextResponse } from 'next/server';
import { BadgeStatus, SurveyContext } from '@prisma/client';
import prisma from '../../../../../lib/prisma';

type RouteContext = {
  params: Promise<{
    badgeId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { badgeId } = await context.params;

  if (!badgeId) {
    return NextResponse.json({ error: 'Missing badge id.' }, { status: 400 });
  }

  let payload: { email?: string; rating?: number; comment?: string | null };

  try {
    payload = (await request.json()) as { email?: string; rating?: number; comment?: string | null };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  if (!payload.email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  }

  const email = payload.email.trim().toLowerCase();

  // user.findUnique and studentBadge.findUnique are independent reads; the badge
  // lookup keys off email->id, but Clerk emails are the same identity, so we can
  // resolve the badge by email-derived studentId via a relation filter in
  // parallel instead of serializing the two round-trips.
  const [user, studentBadge, surveyPrompt] = await Promise.all([
    prisma.user.findUnique({
      where: { email },
      select: { id: true },
    }),
    prisma.studentBadge.findFirst({
      where: {
        badgeId,
        student: { email },
      },
    }),
    prisma.surveyPrompt.findFirst({
      where: {
        badgeId,
        context: SurveyContext.BADGE,
      },
      select: { id: true },
    }),
  ]);

  if (!user) {
    return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  }

  if (!studentBadge) {
    return NextResponse.json({ error: 'Badge enrollment not found.' }, { status: 404 });
  }

  if (studentBadge.status === BadgeStatus.COMPLETED) {
    return NextResponse.json({ status: studentBadge.status }, { status: 200 });
  }

  if (studentBadge.status !== BadgeStatus.READY_FOR_FINALIZATION) {
    return NextResponse.json({ error: 'Badge is not ready for finalization.' }, { status: 409 });
  }

  // SurveyResponse has no natural unique key (only @id), so it cannot be
  // upserted; keep find-then-create-or-update.
  if (surveyPrompt) {
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
  }

  const updated = await prisma.studentBadge.update({
    where: { id: studentBadge.id },
    data: {
      status: BadgeStatus.COMPLETED,
      awardedAt: studentBadge.awardedAt ?? new Date(),
    },
  });

  return NextResponse.json({ status: updated.status }, { status: 200 });
}
