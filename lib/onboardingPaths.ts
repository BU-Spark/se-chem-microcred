/**
 * Pure, dependency-free half of the onboarding gate, so the edge-runtime
 * middleware can import it without dragging Prisma into its bundle. The half that
 * touches the database lives in lib/onboarding.ts.
 */

/** Header the middleware uses to carry the request path down to server components. */
export const PATHNAME_HEADER = 'x-pathname';

/**
 * Paths that must stay reachable without having onboarded, so the gate can never
 * strand anyone in a redirect loop:
 *  - /onboarding itself, and the API route that clears the flag
 *  - the Clerk auth pages and the marketing splash (signed-out surfaces)
 *  - /qr, which assessors hit from a scanned code
 */
const EXEMPT_PREFIXES = ['/onboarding', '/api/onboarding', '/sign-in', '/sign-up', '/splash', '/qr'];

export function isOnboardingExemptPath(pathname: string) {
  // Strip query/hash defensively -- callers pass a raw header value.
  const path = pathname.split(/[?#]/)[0];
  return EXEMPT_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
