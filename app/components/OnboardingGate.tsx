import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { needsOnboarding } from '@/lib/onboarding';
import { PATHNAME_HEADER, isOnboardingExemptPath } from '@/lib/onboardingPaths';

/**
 * Server-side enforcement of the onboarding flow.
 *
 * Onboarding used to be reachable only via `forceRedirectUrl="/onboarding"` on
 * Clerk's <SignUp>. That is a client-side prop on a mounted component, so it fires
 * only when sign-up completes in that exact tab. Email/password sign-up on this
 * instance is multi-step (form -> emailed code -> session), so anything that broke
 * the chain -- opening the code on a phone, closing the tab, an interrupted
 * sign-up -- produced an active session that landed on "/" instead. Google OAuth
 * is a single hop and almost never broke, which is why the bug looked
 * password-specific.
 *
 * The skip was also permanent: DatabaseDisplayNameProvider fetches
 * /api/profile/display-name on every page, which calls ensureCurrentUser() and
 * provisions the row, leaving nothing to distinguish "skipped" from "completed".
 *
 * Rendered from the root layout so it covers every page-level route regardless of
 * how the session was established. It intentionally does not guard API routes --
 * this is a UX gate, not authorization; the API routes do their own auth.
 */
export default async function OnboardingGate() {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get(PATHNAME_HEADER);

  // No header means the request bypassed middleware (it only matches page and API
  // routes). Nothing to gate on, and guessing would risk a redirect loop.
  if (!pathname || isOnboardingExemptPath(pathname)) {
    return null;
  }

  if (await needsOnboarding()) {
    redirect('/onboarding');
  }

  return null;
}
