import { currentUser } from '@clerk/nextjs/server';

import prisma from '@/lib/prisma';

/**
 * True when the signed-in user still owes us the onboarding flow.
 *
 * Deliberately read-only: it must not provision a row, because a missing row is
 * itself the "brand new, never onboarded" signal. Returns false when there is no
 * authenticated user -- signed-out visitors are the auth pages' problem, not this
 * gate's.
 *
 * A user who exists but has onboardedAt = NULL is treated as not onboarded. That
 * covers the rows ensureCurrentUser() lazily provisioned for people whose sign-up
 * redirect never fired, which is the whole point of the flag.
 */
export async function needsOnboarding(): Promise<boolean> {
  const clerk = await currentUser();
  // Match the rest of the app, which keys off the first email address.
  const email = clerk?.emailAddresses?.[0]?.emailAddress?.trim().toLowerCase() ?? null;

  if (!clerk || !email) {
    return false;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { onboardedAt: true },
  });

  return user?.onboardedAt == null;
}
