import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { AvatarAccessory, AvatarBase, AvatarFace } from '@prisma/client';

import prisma from '@/lib/prisma';

type AvatarPayload = {
  base?: string | null;
};

/**
 * Persists the signed-in user's chosen avatar base. Face and accessory are not
 * user-customizable for now (issue #98), so new settings default to SMILE / NONE
 * and existing rows keep whatever they already have.
 */
export async function POST(request: Request) {
  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress?.toLowerCase();

  if (!email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: AvatarPayload;
  try {
    payload = (await request.json()) as AvatarPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const base = Object.values(AvatarBase).includes(payload.base as AvatarBase) ? (payload.base as AvatarBase) : null;

  if (!base) {
    return NextResponse.json({ error: 'A valid avatar base is required.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  }

  const avatar = await prisma.avatarSetting.upsert({
    where: { studentId: user.id },
    update: { base },
    create: {
      studentId: user.id,
      base,
      face: AvatarFace.SMILE,
      accessory: AvatarAccessory.NONE,
    },
    select: { base: true },
  });

  return NextResponse.json({ avatar });
}
