'use client';

import { createContext, useContext } from 'react';
import { useUser } from '@clerk/nextjs';

import { useDatabaseDisplayName } from '../hooks/useDatabaseDisplayName';

type ProfileContextValue = {
  displayName: string | null | undefined;
  avatarBase: string | null;
  setAvatarBase: (base: string) => void;
};

const DatabaseDisplayNameContext = createContext<ProfileContextValue>({
  displayName: undefined,
  avatarBase: null,
  setAvatarBase: () => {},
});

export function DatabaseDisplayNameProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const { displayName, avatarBase, setAvatarBase } = useDatabaseDisplayName(user?.primaryEmailAddress?.emailAddress);

  return (
    <DatabaseDisplayNameContext.Provider value={{ displayName: displayName ?? null, avatarBase, setAvatarBase }}>
      {children}
    </DatabaseDisplayNameContext.Provider>
  );
}

export function useDatabaseDisplayNameContext() {
  return useContext(DatabaseDisplayNameContext);
}
