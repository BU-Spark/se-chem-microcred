import { act, renderHook, waitFor } from '@testing-library/react';

import { SWRTestProvider } from './test-utils';
import { useBadgesCatalog } from './useBadgesCatalog';

const response = { count: 1, badges: [{ id: 'badge-1', name: 'Safety' }] };

describe('useBadgesCatalog', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('preserves the disabled return values', () => {
    const { result } = renderHook(() => useBadgesCatalog(false), { wrapper: SWRTestProvider });

    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('loads and refreshes the badge catalog', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(response),
    } as unknown as Response);

    const { result } = renderHook(() => useBadgesCatalog(true), { wrapper: SWRTestProvider });
    await waitFor(() => expect(result.current.data).toEqual(response));

    await act(async () => result.current.refresh());
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns a string error and clears data after failure', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({ error: 'Unable to load badges.' }),
    } as unknown as Response);

    const { result } = renderHook(() => useBadgesCatalog(true), { wrapper: SWRTestProvider });

    await waitFor(() => expect(result.current.error).toBe('Unable to load badges.'));
    expect(result.current.data).toBeNull();
  });
});
