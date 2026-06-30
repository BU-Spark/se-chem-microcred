import { NextResponse } from 'next/server';

import { ensureCurrentUser } from '@/app/api/courses/lib/ensure-user';

export async function GET() {
  // Provision the signed-in user on demand so the sidebar name/avatar resolve
  // even when they signed in without going through the onboarding flow.
  const user = await ensureCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarBase: user.avatar?.base ?? null,
    },
  });
}
