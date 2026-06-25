import { useEffect, useState } from 'react';

type ProfileSummary = {
  displayName: string | null;
  avatarBase: string | null;
};

const profileCache = new Map<string, ProfileSummary>();

type DisplayNameResponse = {
  user?: {
    name?: string | null;
    avatarBase?: string | null;
  };
  error?: string;
};

export function useDatabaseDisplayName(email?: string | null, enabled = true) {
  const normalizedEmail = email?.trim().toLowerCase() ?? null;
  const [profile, setProfile] = useState<ProfileSummary>(() =>
    normalizedEmail
      ? (profileCache.get(normalizedEmail) ?? { displayName: null, avatarBase: null })
      : { displayName: null, avatarBase: null }
  );

  useEffect(() => {
    if (!enabled || !normalizedEmail) {
      return;
    }

    const cached = profileCache.get(normalizedEmail);
    if (cached !== undefined) {
      setProfile(cached);
      return;
    }

    let isCancelled = false;

    const fetchProfile = async () => {
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

        if (!isCancelled) {
          setProfile(resolved);
        }
      } catch {
        if (!isCancelled) {
          setProfile({ displayName: null, avatarBase: null });
        }
      }
    };

    void fetchProfile();

    return () => {
      isCancelled = true;
    };
  }, [enabled, normalizedEmail]);

  return { displayName: profile.displayName, avatarBase: profile.avatarBase };
}
