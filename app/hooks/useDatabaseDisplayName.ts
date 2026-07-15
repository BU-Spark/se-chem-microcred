import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';

import { fetcher } from './lib/fetcher';

type ProfileSummary = {
  displayName: string | null;
  avatarBase: string | null;
};

// In-memory cache survives client-side route changes within a session.
const profileCache = new Map<string, ProfileSummary>();

// localStorage cache survives full page reloads, so the chosen avatar + name paint
// instantly on the next load instead of flashing the default gem for the several
// seconds the Prisma Accelerate fetch can take.
const STORAGE_PREFIX = 'checkd:profile:';

function readStored(email: string): ProfileSummary | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + email);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<ProfileSummary>;
    return {
      displayName: parsed.displayName ?? null,
      avatarBase: parsed.avatarBase ?? null,
    };
  } catch {
    return undefined;
  }
}

function writeStored(email: string, profile: ProfileSummary) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + email, JSON.stringify(profile));
  } catch {
    // Quota / private-mode failures are non-fatal — we just lose the fast path.
  }
}

type DisplayNameResponse = {
  user?: {
    name?: string | null;
    avatarBase?: string | null;
  };
  error?: string;
};

async function fetchProfile(url: string): Promise<ProfileSummary> {
  const payload = await fetcher<DisplayNameResponse>(url);
  return {
    displayName: payload.user?.name?.trim() || null,
    avatarBase: payload.user?.avatarBase ?? null,
  };
}

export function useDatabaseDisplayName(email?: string | null, enabled = true) {
  const normalizedEmail = email?.trim().toLowerCase() ?? null;
  // Seed from the in-memory cache only. localStorage is read in the effect (post-mount)
  // to avoid a server/client hydration mismatch.
  const [profile, setProfile] = useState<ProfileSummary>(() =>
    normalizedEmail
      ? (profileCache.get(normalizedEmail) ?? { displayName: null, avatarBase: null })
      : { displayName: null, avatarBase: null }
  );

  const updateProfile = useCallback(
    (resolved: ProfileSummary) => {
      if (!normalizedEmail) return;
      profileCache.set(normalizedEmail, resolved);
      writeStored(normalizedEmail, resolved);
      setProfile(resolved);
    },
    [normalizedEmail]
  );

  const { mutate } = useSWR<ProfileSummary>(
    enabled && normalizedEmail ? ['/api/profile/display-name', normalizedEmail] : null,
    ([url]: [string, string]) => fetchProfile(url),
    {
      revalidateOnFocus: false,
      onSuccess: updateProfile,
      // Failed revalidation must leave the already-painted cached profile intact.
      shouldRetryOnError: false,
    }
  );

  // Exposed so callers can repaint after saving a profile change. When the hook
  // is disabled, preserve the previous behavior by allowing an explicit refresh.
  const refresh = useCallback(async () => {
    if (!normalizedEmail) return;
    try {
      const resolved = enabled ? await mutate() : await fetchProfile('/api/profile/display-name');
      if (resolved) updateProfile(resolved);
    } catch {
      // Keep whatever we already painted from cache on failure.
    }
  }, [enabled, mutate, normalizedEmail, updateProfile]);

  useEffect(() => {
    if (!enabled || !normalizedEmail) {
      return;
    }

    // 1. Instant paint: prefer the in-memory cache, then the persisted one.
    const cached = profileCache.get(normalizedEmail);
    if (cached !== undefined) {
      setProfile(cached);
    } else {
      const stored = readStored(normalizedEmail);
      if (stored) {
        setProfile(stored);
        profileCache.set(normalizedEmail, stored);
      }
    }

    // SWR revalidates in the background after this cached value paints.
  }, [enabled, normalizedEmail]);

  // Optimistic update: paint a freshly-chosen avatar everywhere immediately and
  // keep the caches warm, so the change doesn't wait on the background refetch.
  const setAvatarBase = useCallback(
    (avatarBase: string) => {
      setProfile((prev) => {
        const next = { ...prev, avatarBase };
        if (normalizedEmail) {
          profileCache.set(normalizedEmail, next);
          writeStored(normalizedEmail, next);
          void mutate(next, { revalidate: false });
        }
        return next;
      });
    },
    [mutate, normalizedEmail]
  );

  return { displayName: profile.displayName, avatarBase: profile.avatarBase, setAvatarBase, refresh };
}
