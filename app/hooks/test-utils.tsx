import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';

export function SWRTestProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        provider: () => new Map(),
        dedupingInterval: 0,
      }}
    >
      {children}
    </SWRConfig>
  );
}
