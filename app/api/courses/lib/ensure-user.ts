import { currentUser } from '@clerk/nextjs/server';
import { Prisma } from '@prisma/client';

import prisma from '@/lib/prisma';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  externalId: true,
  avatar: { select: { base: true } },
} as const;

type EnsuredUser = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

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
 * Safe under the concurrent calls the home page makes (created/enrolled/assessor
 * fire in parallel): a losing INSERT race throws P2002, which we treat as "already
 * exists" and read back. Returns null when there is no authenticated user.
 */
export async function ensureCurrentUser(): Promise<EnsuredUser | null> {
  const clerk = await currentUser();
  // Match the rest of the app, which keys off the first email address.
  const email = clerk?.emailAddresses?.[0]?.emailAddress?.trim().toLowerCase() ?? null;

  if (!clerk || !email) {
    return null;
  }

  const name = clerkName(clerk);

  let user: EnsuredUser;
  try {
    user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name },
      select: USER_SELECT,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // A concurrent request inserted the row first — read it back.
    user = await prisma.user.findUniqueOrThrow({ where: { email }, select: USER_SELECT });
  }

  // The name-backfill and the analytics-row guarantee both only depend on
  // user.id and don't depend on each other, so run them concurrently to save a
  // network round-trip on this hot auth path.
  const backfillName = !user.name && name;

  await Promise.all([
    // Backfill a missing name from Clerk without clobbering an existing one.
    // updateMany with name:null is a no-op for concurrent callers that already set it.
    backfillName ? prisma.user.updateMany({ where: { id: user.id, name: null }, data: { name } }) : Promise.resolve(),
    // Guarantee an analytics row exists (other queries assume one may be present).
    prisma.studentAnalytics
      .upsert({
        where: { studentId: user.id },
        update: {},
        create: { studentId: user.id },
      })
      .catch((error) => {
        if (!isUniqueViolation(error)) throw error;
      }),
  ]);

  if (backfillName) {
    user = { ...user, name };
  }

  return user;
}
