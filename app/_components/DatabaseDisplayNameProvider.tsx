'use client';

import { createContext, useContext } from 'react';
import { useUser } from '@clerk/nextjs';

import { useDatabaseDisplayName } from '../hooks/useDatabaseDisplayName';

type ProfileContextValue = {
  displayName: string | null | undefined;
  avatarBase: string | null;
  // Re-fetches the name/avatar from the server; call after a profile edit so the
  // sidebar repaints without a full reload.
  refresh: () => Promise<void>;
};

const DatabaseDisplayNameContext = createContext<ProfileContextValue>({
  displayName: undefined,
  avatarBase: null,
  refresh: async () => {},
});

export function DatabaseDisplayNameProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const { displayName, avatarBase, refresh } = useDatabaseDisplayName(user?.primaryEmailAddress?.emailAddress);

  return (
    <DatabaseDisplayNameContext.Provider value={{ displayName: displayName ?? null, avatarBase, refresh }}>
      {children}
    </DatabaseDisplayNameContext.Provider>
  );
}

export function useDatabaseDisplayNameContext() {
  return useContext(DatabaseDisplayNameContext);
}
