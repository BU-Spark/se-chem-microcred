import { auth, reverificationErrorResponse } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Step-up auth gate: requires the user to have recently re-verified their
// credentials before sensitive profile data is revealed. The client calls this
// via Clerk's `useReverification` hook, which catches the reverification error
// response, shows the re-auth UI, and retries on success.
export async function POST() {
  // `auth.protect()` returns 401/404 if there is no signed-in user at all.
  await auth.protect();

  const { has } = await auth();

  // If the user has not reverified within the strict window, return the
  // reverification error so `useReverification` can prompt for step-up auth.
  if (!has({ reverification: 'strict' })) {
    return reverificationErrorResponse('strict');
  }

  return NextResponse.json({ ok: true });
}
