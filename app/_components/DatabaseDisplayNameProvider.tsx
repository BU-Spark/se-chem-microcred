'use client';

import { createContext, useContext } from 'react';
import { useUser } from '@clerk/nextjs';

import { useDatabaseDisplayName } from '../hooks/useDatabaseDisplayName';

const DatabaseDisplayNameContext = createContext<string | null | undefined>(undefined);

export function DatabaseDisplayNameProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const { displayName } = useDatabaseDisplayName(user?.primaryEmailAddress?.emailAddress);

  return (
    <DatabaseDisplayNameContext.Provider value={displayName ?? null}>{children}</DatabaseDisplayNameContext.Provider>
  );
}

export function useDatabaseDisplayNameContext() {
  return useContext(DatabaseDisplayNameContext);
}
