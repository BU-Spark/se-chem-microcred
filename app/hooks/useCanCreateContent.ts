'use client';

import useSWR from 'swr';

import { fetcher } from './lib/fetcher';

interface AccessResponse {
  canCreateContent: boolean;
  isAdmin: boolean;
}

/**
 * The signed-in user's access flags:
 *   - canCreateContent: may create courses/badges (respects the ALPHA_MODE lock).
 *   - isAdmin: is an allowlisted admin account (independent of ALPHA_MODE).
 * Pass an `enabled` gate (e.g. `isLoaded && isSignedIn`) so we never fetch before
 * Clerk reports an authenticated user. Both default to `false` while loading so
 * gated UI stays hidden until access is confirmed.
 */
export function useCanCreateContent(enabled: boolean = true) {
  const { data, isLoading } = useSWR<AccessResponse>(enabled ? '/api/me/access' : null, fetcher<AccessResponse>, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });

  return {
    canCreateContent: data?.canCreateContent ?? false,
    isAdmin: data?.isAdmin ?? false,
    isLoading,
  };
}
