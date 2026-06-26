'use client';

import useSWR from 'swr';

/**
 * Response shape of the consolidated /api/courses/mine endpoint. The three
 * sections (created/enrolled/assessor) are drop-in equivalents of the bodies
 * returned by the old per-role endpoints.
 */
export interface MyCoursesResponse {
  user: {
    name: string | null;
    email: string;
  };
  created: {
    count: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    courses: any[];
  };
  enrolled: {
    count: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    enrollments: any[];
  };
  assessor: {
    count: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    enrollments: any[];
  };
}

async function fetcher(url: string): Promise<MyCoursesResponse> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });

  const payload = await response.json().catch(() => ({ error: `Request failed: ${response.status}` }));

  if (!response.ok) {
    throw new Error(payload.error ?? 'Unable to load courses.');
  }

  return payload as MyCoursesResponse;
}

/**
 * Stale-while-revalidate hook for the signed-in user's courses. Pass an
 * `enabled` gate (e.g. `isLoaded && isSignedIn`) so we never fetch before Clerk
 * reports an authenticated user — SWR treats a null key as "do not fetch".
 */
export function useMyCourses(enabled: boolean) {
  const { data, error, isLoading, mutate } = useSWR<MyCoursesResponse>(enabled ? '/api/courses/mine' : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
    keepPreviousData: true,
  });

  return {
    data,
    created: data?.created,
    enrolled: data?.enrolled,
    assessor: data?.assessor,
    isLoading,
    error,
    mutate,
  };
}
