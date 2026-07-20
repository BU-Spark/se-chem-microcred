import { renderHook } from '@testing-library/react';
import { useAuth } from '@clerk/nextjs';

import { useSignOut } from './useSignOut';

jest.mock('@clerk/nextjs', () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

describe('useSignOut', () => {
  it('calls Clerk signOut', async () => {
    const clerkSignOut = jest.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({ signOut: clerkSignOut } as unknown as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useSignOut());
    await result.current();

    expect(clerkSignOut).toHaveBeenCalledTimes(1);
  });
});
