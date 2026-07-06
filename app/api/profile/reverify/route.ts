import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Session gate: keeps sensitive profile data behind lock and key by requiring a
// valid, active Clerk session (a live session cookie) before revealing it.
// The client calls this before unmasking; a 401/403 keeps the data hidden.
export async function POST() {
  // `auth.protect()` returns 401/404 if there is no signed-in user at all.
  await auth.protect();

  const { userId, sessionId } = await auth();

  // An authenticated user always resolves both from the session cookie; if
  // either is missing the session isn't active, so keep the data locked.
  if (!userId || !sessionId) {
    return NextResponse.json({ error: 'No active session' }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
