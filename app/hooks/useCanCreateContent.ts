'use client';

import useSWR from 'swr';

interface AccessResponse {
  canCreateContent: boolean;
  isAdmin: boolean;
}

async function fetcher(url: string): Promise<AccessResponse> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as AccessResponse;
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
  const { data, isLoading } = useSWR<AccessResponse>(enabled ? '/api/me/access' : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });

  return {
    canCreateContent: data?.canCreateContent ?? false,
    isAdmin: data?.isAdmin ?? false,
    isLoading,
  };
}
