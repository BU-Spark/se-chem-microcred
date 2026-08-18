'use client';

import { useEffect } from 'react';
import useSWR from 'swr';

import { fetcher } from './lib/fetcher';

const UNREAD_EVENT = 'messages:unread-changed';

interface UnreadResponse {
  count: number;
}

// Announce that mail was read, so any mounted sidebar can adjust its badge
// without a round trip. The sidebar and the inbox are separate trees on the
// same page, and this is the seam between them.
export function notifyMessagesRead(delta = -1) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(UNREAD_EVENT, { detail: { delta } }));
}

/**
 * How many messages the signed-in user has not opened, across every course.
 * Shared through SWR so the sidebar on each page reuses one cached count
 * instead of re-counting on every navigation.
 */
export function useUnreadMessages(enabled: boolean = true) {
  const { data, mutate } = useSWR<UnreadResponse>(enabled ? '/api/messages/unread' : null, fetcher<UnreadResponse>, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });

  useEffect(() => {
    const handleChange = (event: Event) => {
      const delta = (event as CustomEvent<{ delta?: number }>).detail?.delta ?? -1;
      // Adjust the cached count in place; the server already knows, so there is
      // nothing to revalidate against.
      void mutate((current) => ({ count: Math.max(0, (current?.count ?? 0) + delta) }), { revalidate: false });
    };
    window.addEventListener(UNREAD_EVENT, handleChange);
    return () => window.removeEventListener(UNREAD_EVENT, handleChange);
  }, [mutate]);

  return data?.count ?? 0;
}
