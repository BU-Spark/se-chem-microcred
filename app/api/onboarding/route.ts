import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { AvatarAccessory, AvatarBase, AvatarFace } from '@prisma/client';
import prisma from '@/lib/prisma';

type OnboardingPayload = {
  firstName?: string | null;
  lastName?: string | null;
  gender?: string | null;
  raceEthnicity?: string | null;
  parentalEducation?: string | null;
  pellGrantQualified?: boolean | null;
  avatarBase?: string | null;
};

function clean(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Completes account onboarding. Upserts the signed-in user into the DB (new Clerk
 * sign-ups don't exist here yet because the Clerk webhook is not wired up), saving
 * name + demographics, the chosen avatar base, and ensuring an analytics row exists.
 */
export async function POST(request: Request) {
  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress?.toLowerCase();

  if (!email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: OnboardingPayload;
  try {
    payload = (await request.json()) as OnboardingPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const firstName = clean(payload.firstName);
  const lastName = clean(payload.lastName);

  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'First and last name are required.' }, { status: 400 });
  }

  const name = `${firstName} ${lastName}`;
  const demographics = {
    gender: clean(payload.gender),
    raceEthnicity: clean(payload.raceEthnicity),
    parentalEducation: clean(payload.parentalEducation),
    pellGrantQualified: payload.pellGrantQualified ?? null,
  };

  const base = Object.values(AvatarBase).includes(payload.avatarBase as AvatarBase)
    ? (payload.avatarBase as AvatarBase)
    : null;

  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        ...demographics,
      },
      create: {
        email,
        name,
        ...demographics,
      },
      select: { id: true, name: true },
    });

    if (base) {
      await prisma.avatarSetting.upsert({
        where: { studentId: user.id },
        update: { base },
        create: {
          studentId: user.id,
          base,
          face: AvatarFace.SMILE,
          accessory: AvatarAccessory.NONE,
        },
      });
    }

    await prisma.studentAnalytics.createMany({
      data: [{ studentId: user.id }],
      skipDuplicates: true,
    });

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    console.error('POST /api/onboarding failed:', error);
    return NextResponse.json({ error: 'Failed to complete onboarding.' }, { status: 500 });
  }
}
