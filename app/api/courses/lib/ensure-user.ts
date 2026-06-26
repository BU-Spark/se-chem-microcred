import { currentUser } from '@clerk/nextjs/server';

import prisma from '@/lib/prisma';

type EnsuredUser = {
  id: string;
  email: string | null;
  name: string | null;
  buid: string | null;
  avatar: { base: string } | null;
};

function clerkName(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>): string | null {
  const full = user.fullName?.trim() || [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return full || null;
}

/**
 * Ensures a DB User row exists for the currently-authenticated Clerk user, then
 * returns it. Signing IN (as opposed to the sign-up → /onboarding flow) never
 * creates a DB row, which left logged-in users as "User not found". Any read path
 * can call this to lazily provision the account from the Clerk identity.
 *
 * Idempotent and non-destructive: it never overwrites profile data the user has
 * already set; it only fills in a missing name and guarantees an analytics row.
 * Returns null when there is no authenticated user.
 */
export async function ensureCurrentUser(): Promise<EnsuredUser | null> {
  const clerk = await currentUser();
  // Match the rest of the app, which keys off the first email address.
  const email = clerk?.emailAddresses?.[0]?.emailAddress?.trim().toLowerCase() ?? null;

  if (!clerk || !email) {
    return null;
  }

  const name = clerkName(clerk);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name },
    select: {
      id: true,
      email: true,
      name: true,
      buid: true,
      avatar: { select: { base: true } },
    },
  });

  // Backfill a missing name from Clerk without clobbering an existing one.
  if (!user.name && name) {
    await prisma.user.update({ where: { id: user.id }, data: { name } });
    user.name = name;
  }

  // Guarantee an analytics row exists (other queries assume one may be present).
  await prisma.studentAnalytics.upsert({
    where: { studentId: user.id },
    update: {},
    create: { studentId: user.id },
  });

  return user;
}
