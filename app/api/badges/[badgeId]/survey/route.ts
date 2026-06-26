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

  // Record the survey response (if any) and finalize the badge atomically so a
  // double-submit can't apply one without the other. NOTE: SurveyResponse has
  // no unique key on (promptId, studentId), so this tx guarantees atomicity of
  // the two writes but not de-duplication of concurrent first-time creates —
  // that requires a unique-constraint migration (tracked separately).
  const updated = await prisma.$transaction(async (tx) => {
    if (surveyPrompt) {
      const existingResponse = await tx.surveyResponse.findFirst({
        where: {
          promptId: surveyPrompt.id,
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
            promptId: surveyPrompt.id,
            studentId: user.id,
            rating: payload.rating ?? 3,
            comment: payload.comment ?? null,
          },
        });
      }
    }

    return tx.studentBadge.update({
      where: { id: studentBadge.id },
      data: {
        status: BadgeStatus.COMPLETED,
        awardedAt: studentBadge.awardedAt ?? new Date(),
      },
    });
  });

  return NextResponse.json({ status: updated.status }, { status: 200 });
}
