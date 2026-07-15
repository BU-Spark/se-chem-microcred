'use client';

import { useCallback } from 'react';
import useSWR from 'swr';

import { fetcher } from './lib/fetcher';

export type BadgeCatalogItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  createdAt: string;
  assignedStudentCount: number;
  requirements: Array<{
    id: string;
    summary: string | null;
    displayText: string;
    youtubeUrl?: string | null;
    lesson: {
      id: string;
      title: string;
      course: {
        id: string;
        title: string;
      } | null;
    } | null;
  }>;
};

type BadgesResponse = {
  count: number;
  badges: BadgeCatalogItem[];
};

export function useBadgesCatalog(enabled: boolean) {
  const {
    data,
    error: swrError,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<BadgesResponse>(
    enabled ? '/api/badges' : null,
    (url: string) => fetcher<BadgesResponse>(url, undefined, false),
    { revalidateOnFocus: false }
  );

  const refresh = useCallback(async () => {
    try {
      await mutate();
    } catch {
      // The returned error field reports refresh failures to the page.
    }
  }, [mutate]);

  const error = swrError instanceof Error ? swrError.message : swrError ? 'Unable to load badges.' : null;

  return {
    data: error ? null : (data ?? null),
    isLoading: isLoading || isValidating,
    error,
    refresh,
  };
}
