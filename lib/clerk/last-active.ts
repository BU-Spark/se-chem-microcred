// Issue #328: look up Clerk's lastActiveAt for a batch of roster emails.
import { clerkClient } from '@clerk/nextjs/server';

import { normalizeEmail } from '@/lib/text/email';

export const CLERK_EMAIL_CHUNK_SIZE = 100;
const CLERK_PAGE_LIMIT = 500;

export async function fetchClerkLastActiveByEmail(emails: Array<string | null | undefined>) {
  const unique = Array.from(new Set(emails.map(normalizeEmail).filter((email): email is string => Boolean(email))));
  const byEmail = new Map<string, number | null>();
  if (unique.length === 0) return byEmail;

  const client = await clerkClient();
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += CLERK_EMAIL_CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + CLERK_EMAIL_CHUNK_SIZE));
  }

  const pages = await Promise.all(
    chunks.map((chunk) => client.users.getUserList({ emailAddress: chunk, limit: CLERK_PAGE_LIMIT }))
  );

  for (const page of pages) {
    for (const user of page.data) {
      for (const address of user.emailAddresses) {
        const email = normalizeEmail(address.emailAddress);
        if (email) byEmail.set(email, user.lastActiveAt ?? null);
      }
    }
  }

  return byEmail;
}
