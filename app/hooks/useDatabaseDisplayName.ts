import { useCallback, useEffect, useRef, useState } from 'react';

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

export function useDatabaseDisplayName(email?: string | null, enabled = true) {
  const normalizedEmail = email?.trim().toLowerCase() ?? null;
  // Seed from the in-memory cache only. localStorage is read in the effect (post-mount)
  // to avoid a server/client hydration mismatch.
  const [profile, setProfile] = useState<ProfileSummary>(() =>
    normalizedEmail
      ? (profileCache.get(normalizedEmail) ?? { displayName: null, avatarBase: null })
      : { displayName: null, avatarBase: null }
  );

  // Tracks whether the consuming component is still mounted so a slow fetch
  // (mount revalidation or a manual refresh) can't setState after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetches the latest name/avatar from the server and updates every cache layer
  // plus local state. Exposed as `refresh` so callers (e.g. after saving a new
  // name) can force the sidebar to repaint without a full page reload.
  const refresh = useCallback(async () => {
    if (!normalizedEmail) {
      return;
    }
    try {
      const response = await fetch('/api/profile/display-name', {
        headers: {
          Accept: 'application/json',
        },
      });

      const payload = (await response.json().catch(() => ({}))) as DisplayNameResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? `Request failed with status ${response.status}`);
      }

      const resolved: ProfileSummary = {
        displayName: payload.user?.name?.trim() || null,
        avatarBase: payload.user?.avatarBase ?? null,
      };
      profileCache.set(normalizedEmail, resolved);
      writeStored(normalizedEmail, resolved);

      if (mountedRef.current) {
        setProfile(resolved);
      }
    } catch {
      // Keep whatever we already painted from cache on failure.
    }
  }, [normalizedEmail]);

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

    // 2. Always revalidate in the background so a freshly chosen avatar/name shows up.
    void refresh();
  }, [enabled, normalizedEmail, refresh]);

  return { displayName: profile.displayName, avatarBase: profile.avatarBase, refresh };
}
