'use client';

import useSWR from 'swr';

import type { BadgeSnapshotResponse } from '@/app/api/courses/[courseId]/badge-snapshot/route';
import { fetcher } from '@/app/hooks/lib/fetcher';
import type { SnapshotBadge, SnapshotState } from '@/lib/roster/badgeSnapshot';

const SNAPSHOT_DEDUPE_MS = 60_000;
const EMPTY_BADGES: SnapshotBadge[] = [];
const EMPTY_STUDENTS: Record<string, SnapshotState[]> = {};

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
    badges: data?.badges ?? EMPTY_BADGES,
    statesByStudent: data?.students ?? EMPTY_STUDENTS,
    isLoading,
    error,
  };
}
