import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

import { canCreateContent, isAdminEmail } from '@/lib/adminAccess';

/**
 * Reports the signed-in user's access flags so client components can hide gated UI:
 *   - canCreateContent: may create courses/badges (respects the ALPHA_MODE lock).
 *   - isAdmin: is an allowlisted admin account (independent of ALPHA_MODE).
 * The allowlist itself (ALPHA_ADMIN_EMAILS) is server-only and never leaves the
 * server — only the resolved booleans are returned.
 */
export async function GET() {
  const email = (await currentUser())?.emailAddresses?.[0]?.emailAddress ?? null;
  return NextResponse.json({
    canCreateContent: canCreateContent(email),
    isAdmin: isAdminEmail(email),
  });
}
