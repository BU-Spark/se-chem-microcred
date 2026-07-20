'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback } from 'react';

/**
 * Provides the application's single entry point to Clerk sign-out.
 * Redirects, loading state, and error messages remain with each caller.
 */
export function useSignOut() {
  const { signOut } = useAuth();

  return useCallback(() => signOut(), [signOut]);
}
