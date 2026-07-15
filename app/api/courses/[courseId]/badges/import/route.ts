import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { normalizeEmail } from '@/lib/text/email';
import { ImportBadgePayload } from '@/lib/badges/types';
import { normalizeString } from '@/lib/checkpoints/normalizeWrite';
import prisma from '@/lib/prisma';

import { executeBadgeImportTx } from '@/lib/badges/badge-import.service';

export async function POST(req: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  try {
    const clerkUser = await currentUser();

    if (!clerkUser?.emailAddresses?.[0]?.emailAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const email = normalizeEmail(clerkUser?.emailAddresses?.[0]?.emailAddress);

    const { courseId: rawCourseId } = await context.params;
    const courseId = normalizeString(rawCourseId);

    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!courseId) {
      return NextResponse.json({ error: 'Course id is required.' }, { status: 400 });
    }

    const creator = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!creator) {
      return NextResponse.json({ error: 'Creator user record was not found in the database.' }, { status: 404 });
    }

    const body = (await req.json()) as ImportBadgePayload;
    const sourceBadgeId = normalizeString(body.badgeId);
    const neverCloses = body.neverCloses !== false;
    const availableOnDate = body.availableOn ? new Date(body.availableOn) : null;
    const closesOnDate = !neverCloses && body.closesOn ? new Date(body.closesOn) : null;

    if (!sourceBadgeId) {
      return NextResponse.json({ error: 'Badge id is required.' }, { status: 400 });
    }

    const imported = await executeBadgeImportTx({
      creatorId: creator.id,
      courseId,
      sourceBadgeId,
      availableOn: availableOnDate,
      closesOn: closesOnDate,
      neverCloses,
    });

    if ('error' in imported) {
      return NextResponse.json({ error: imported.error }, { status: imported.status || 400 });
    }

    return NextResponse.json(
      {
        message: 'Badge imported successfully.',
        ...imported,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/courses/[courseId]/badges/import failed:', error);
    return NextResponse.json({ error: 'Failed to import badge.' }, { status: 500 });
  }
}
