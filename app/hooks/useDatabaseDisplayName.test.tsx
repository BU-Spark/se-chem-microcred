import { act, renderHook, waitFor } from '@testing-library/react';

import { SWRTestProvider } from './test-utils';
import { useDatabaseDisplayName } from './useDatabaseDisplayName';

describe('useDatabaseDisplayName', () => {
  beforeEach(() => {
    window.localStorage.clear();
    global.fetch = jest.fn();
  });

  it('paints stored profile data and then revalidates it', async () => {
    window.localStorage.setItem(
      'checkd:profile:stored@example.edu',
      JSON.stringify({ displayName: 'Stored Name', avatarBase: 'gem' })
    );
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ user: { name: 'Current Name', avatarBase: 'star' } }),
    } as unknown as Response);

    const { result } = renderHook(() => useDatabaseDisplayName('STORED@example.edu'), {
      wrapper: SWRTestProvider,
    });

    await waitFor(() => expect(result.current.displayName).toBe('Current Name'));
    expect(result.current.avatarBase).toBe('star');
    expect(JSON.parse(window.localStorage.getItem('checkd:profile:stored@example.edu') ?? '')).toEqual({
      displayName: 'Current Name',
      avatarBase: 'star',
    });
  });

  it('updates the avatar immediately without making another request', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ user: { name: 'Student', avatarBase: 'gem' } }),
    } as unknown as Response);

    const { result } = renderHook(() => useDatabaseDisplayName('avatar@example.edu'), {
      wrapper: SWRTestProvider,
    });
    await waitFor(() => expect(result.current.displayName).toBe('Student'));

    act(() => result.current.setAvatarBase('rocket'));

    expect(result.current.avatarBase).toBe('rocket');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps cached data when revalidation fails', async () => {
    window.localStorage.setItem(
      'checkd:profile:offline@example.edu',
      JSON.stringify({ displayName: 'Offline Name', avatarBase: 'gem' })
    );
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: false,
      status: 503,
      json: jest.fn().mockResolvedValue({ error: 'Unavailable' }),
    } as unknown as Response);

    const { result } = renderHook(() => useDatabaseDisplayName('offline@example.edu'), {
      wrapper: SWRTestProvider,
    });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(result.current.displayName).toBe('Offline Name');
    expect(result.current.avatarBase).toBe('gem');
  });
});
