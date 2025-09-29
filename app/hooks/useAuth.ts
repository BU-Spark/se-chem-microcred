export interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  return {
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    signOut: async () => {
      // No-op placeholder until Clerk is integrated.
    },
  };
}
