import { useEffect, useState } from 'react';

const displayNameCache = new Map<string, string | null>();

type DisplayNameResponse = {
  user?: {
    name?: string | null;
  };
  error?: string;
};

export function useDatabaseDisplayName(email?: string | null, enabled = true) {
  const normalizedEmail = email?.trim().toLowerCase() ?? null;
  const [displayName, setDisplayName] = useState<string | null>(() =>
    normalizedEmail ? (displayNameCache.get(normalizedEmail) ?? null) : null
  );

  useEffect(() => {
    if (!enabled || !normalizedEmail) {
      return;
    }

    const cached = displayNameCache.get(normalizedEmail);
    if (cached !== undefined) {
      setDisplayName(cached);
      return;
    }

    let isCancelled = false;

    const fetchDisplayName = async () => {
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

        const resolvedName = payload.user?.name?.trim() || null;
        displayNameCache.set(normalizedEmail, resolvedName);

        if (!isCancelled) {
          setDisplayName(resolvedName);
        }
      } catch {
        if (!isCancelled) {
          setDisplayName(null);
        }
      }
    };

    void fetchDisplayName();

    return () => {
      isCancelled = true;
    };
  }, [enabled, normalizedEmail]);

  return { displayName };
}
