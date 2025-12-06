import { NextResponse } from 'next/server';
import { BadgeStatus } from '@prisma/client';
import prisma from '../../../../../lib/prisma';

type RouteContext = {
  params: Promise<{
    badgeId: string;
  }>;
};

import { currentUser } from '@clerk/nextjs/server';

export async function POST(request: Request, context: RouteContext) {
  const { badgeId } = await context.params;

  if (!badgeId) {
    return NextResponse.json({ error: 'Missing badge id.' }, { status: 400 });
  }

  const clerkUser = await currentUser();
  if (!clerkUser || !clerkUser.emailAddresses?.[0]) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const email = clerkUser.emailAddresses[0].emailAddress.toLowerCase();

  // We still parse the body to ensure it's valid JSON, even if we ignore the email in it
  try {
    await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  }

  const studentBadge = await prisma.studentBadge.findUnique({
    where: {
      studentId_badgeId: {
        studentId: user.id,
        badgeId,
      },
    },
  });

  if (!studentBadge) {
    return NextResponse.json({ error: 'Badge enrollment not found.' }, { status: 404 });
  }

  if (studentBadge.status === BadgeStatus.READY_FOR_FINALIZATION || studentBadge.status === BadgeStatus.COMPLETED) {
    return NextResponse.json({ status: studentBadge.status }, { status: 200 });
  }

  if (studentBadge.status !== BadgeStatus.READY_FOR_ASSESSMENT) {
    return NextResponse.json({ error: 'Badge is not ready for assessment finalization.' }, { status: 409 });
  }

  const updated = await prisma.studentBadge.update({
    where: { id: studentBadge.id },
    data: {
      status: BadgeStatus.READY_FOR_FINALIZATION,
    },
  });

  return NextResponse.json({ status: updated.status }, { status: 200 });
}
