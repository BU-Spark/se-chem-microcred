'use client';

import useSWR from 'swr';

import type { BadgeSnapshotResponse } from '@/app/api/courses/[courseId]/badge-snapshot/route';
import { fetcher } from '@/app/hooks/lib/fetcher';

const SNAPSHOT_DEDUPE_MS = 60_000;
const EMPTY_COMPLETED: Record<string, number> = {};

/**
 * Badges completed per student for the roster's Progress column, one request per
 * course + section. SWR caches each section's result, so switching back to a
 * section never refetches.
 */
export function useRosterBadgeSnapshot(
  courseId: string | null | undefined,
  section: string | null | undefined,
  enabled: boolean
) {
  const params = section ? `?${new URLSearchParams({ section }).toString()}` : '';
  const key = enabled && courseId ? `/api/courses/${encodeURIComponent(courseId)}/badge-snapshot${params}` : null;

  const { data, error, isLoading } = useSWR<BadgeSnapshotResponse>(key, fetcher<BadgeSnapshotResponse>, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: SNAPSHOT_DEDUPE_MS,
  });

  return {
    badgeCount: data?.badgeCount ?? 0,
    completedByStudent: data?.completed ?? EMPTY_COMPLETED,
    isLoading,
    error,
  };
}
