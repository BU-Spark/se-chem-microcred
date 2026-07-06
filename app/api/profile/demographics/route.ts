import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import prisma from '../../../../lib/prisma';

type DemographicsPayload = {
  email?: string;
  name?: string | null;
  gender?: string | null;
  raceEthnicity?: string | null;
  parentalEducation?: string | null;
  pellGrantQualified?: boolean | null;
};

export async function POST(request: Request) {
  const clerkUser = await currentUser();
  if (!clerkUser?.emailAddresses?.[0]) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: DemographicsPayload;
  try {
    payload = (await request.json()) as DemographicsPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const email = payload.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  }

  // Only allow updates for the signed-in user
  const signedInEmail = clerkUser.emailAddresses[0].emailAddress.toLowerCase();
  if (email !== signedInEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  }

  // Name is optional in the payload; only touch it when the client sends it.
  // Guard against clearing the name to an empty string (it would fall back to
  // the generic "Student" label everywhere).
  const name = typeof payload.name === 'string' ? payload.name.trim() : undefined;
  if (name !== undefined && name.length === 0) {
    return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      gender: payload.gender ?? null,
      raceEthnicity: payload.raceEthnicity ?? null,
      parentalEducation: payload.parentalEducation ?? null,
      pellGrantQualified: payload.pellGrantQualified,
    },
    select: {
      id: true,
      name: true,
      gender: true,
      raceEthnicity: true,
      parentalEducation: true,
      pellGrantQualified: true,
    },
  });

  return NextResponse.json({ student: updated });
}
