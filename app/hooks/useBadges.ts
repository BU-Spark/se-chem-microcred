import { useEffect, useState } from 'react';
import type { Badge } from '../types/badge.types';

interface BadgeState {
  badges: Badge[];
  isLoading: boolean;
  error?: Error;
}

export function useBadges(): BadgeState {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const response = await fetch('/api/badges/mine');
        if (!response.ok) {
          throw new Error(`Failed to load badges: ${response.status}`);
        }
        const data = (await response.json()) as { badges?: Badge[] };
        if (!cancelled) {
          setBadges(data.badges ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Unknown error fetching badges.'));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return { badges, isLoading, error };
}
