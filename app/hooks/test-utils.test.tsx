import { renderHook } from '@testing-library/react';
import { useSWRConfig } from 'swr';

import { SWRTestProvider } from './test-utils';

describe('SWRTestProvider', () => {
  it('uses a fresh cache with request deduplication disabled', () => {
    const first = renderHook(() => useSWRConfig(), { wrapper: SWRTestProvider });
    first.result.current.cache.set('example', { data: 'cached' });

    const second = renderHook(() => useSWRConfig(), { wrapper: SWRTestProvider });

    expect(first.result.current.dedupingInterval).toBe(0);
    expect(second.result.current.dedupingInterval).toBe(0);
    expect(second.result.current.cache.get('example')).toBeUndefined();
  });
});
