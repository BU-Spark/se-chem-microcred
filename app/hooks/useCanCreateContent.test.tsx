import { renderHook, waitFor } from '@testing-library/react';

import { SWRTestProvider } from './test-utils';
import { useCanCreateContent } from './useCanCreateContent';

describe('useCanCreateContent', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('returns safe defaults while disabled', () => {
    const { result } = renderHook(() => useCanCreateContent(false), { wrapper: SWRTestProvider });

    expect(result.current).toEqual({ canCreateContent: false, isAdmin: false, isLoading: false });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('loads the current access flags', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ canCreateContent: true, isAdmin: false }),
    } as unknown as Response);

    const { result } = renderHook(() => useCanCreateContent(true), { wrapper: SWRTestProvider });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toEqual({ canCreateContent: true, isAdmin: false, isLoading: false });
  });
});
