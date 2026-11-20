'use client';

import { useEffect } from 'react';
import useSWR from 'swr';

import type { CourseLastActiveResponse } from '@/app/api/courses/[courseId]/last-active/route';
import { fetcher } from '@/app/hooks/lib/fetcher';
import { useUserActivity } from '@/app/hooks/useUserActivity';

export const LAST_ACTIVE_REFRESH_MS = 60 * 60_000;

const EMPTY: Record<string, string | null> = {};

export function useRosterLastActive(courseId: string | null | undefined, enabled: boolean) {
  const active = useUserActivity();
  const key = enabled && courseId ? `/api/courses/${encodeURIComponent(courseId)}/last-active` : null;

  const { data, error, isLoading, mutate } = useSWR<CourseLastActiveResponse>(key, fetcher<CourseLastActiveResponse>, {
    refreshInterval: active ? LAST_ACTIVE_REFRESH_MS : 0,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: LAST_ACTIVE_REFRESH_MS - 60_000,
    keepPreviousData: true,
  });

  // On returning from idle, refetch only once the data is over an hour old,
  // so a quick tab switch never costs a request.
  const fetchedAt = data?.fetchedAt;
  useEffect(() => {
    if (!active || !key || !fetchedAt) return;
    if (Date.now() - Date.parse(fetchedAt) >= LAST_ACTIVE_REFRESH_MS) void mutate();
  }, [active, key, fetchedAt, mutate]);

  return { lastActiveById: data?.lastActive ?? EMPTY, isLoading, error };
}
