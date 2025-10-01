'use client';

import { useCallback, useEffect, useState } from 'react';

const ACCOUNT_KEY = 'chemSkillsDemoAccount';
const SESSION_KEY = 'chemSkillsDemoSession';

const DEFAULT_ACCOUNT: StoredAccount = {
  name: 'Student Demo',
  email: 'student@example.edu',
  password: 'demo123',
  createdAt: '2024-11-01T00:00:00.000Z',
};

export interface AuthUser {
  name: string;
  email: string;
  createdAt: string;
}

export interface SignInPayload {
  email: string;
  password: string;
}

export interface SignUpPayload {
  name: string;
  email: string;
  password: string;
}

interface StoredAccount extends AuthUser {
  password: string;
}

interface AuthResult {
  success: boolean;
  message?: string;
}

function readAccount(): StoredAccount | null {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_ACCOUNT };
  }

  try {
    const raw = window.localStorage.getItem(ACCOUNT_KEY);
    if (!raw) {
      return { ...DEFAULT_ACCOUNT };
    }
    return JSON.parse(raw) as StoredAccount;
  } catch (err) {
    console.warn('Failed to parse stored auth account', err);
    return { ...DEFAULT_ACCOUNT };
  }
}

function persistAccount(account: StoredAccount | null) {
  if (typeof window === 'undefined') {
    return;
  }

  if (!account) {
    window.localStorage.removeItem(ACCOUNT_KEY);
  } else {
    window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  }
}

function readSession(): AuthUser | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as AuthUser;
  } catch (err) {
    console.warn('Failed to parse stored auth session', err);
    return null;
  }
}

function persistSession(user: AuthUser | null) {
  if (typeof window === 'undefined') {
    return;
  }

  if (!user) {
    window.localStorage.removeItem(SESSION_KEY);
  } else {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  }
}

export interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  error?: string;
  signIn: (payload: SignInPayload) => Promise<AuthResult>;
  signUp: (payload: SignUpPayload) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string>();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const session = readSession();
    if (session) {
      setUser(session);
    }
    setIsLoaded(true);
  }, []);

  const signIn = useCallback(async ({ email, password }: SignInPayload): Promise<AuthResult> => {
    const account = readAccount();
    if (!account || account.email.toLowerCase() !== email.toLowerCase()) {
      setError('No account found for that email. Try signing up first.');
      return { success: false, message: 'No account found for that email.' };
    }

    if (account.password !== password) {
      setError('Incorrect password.');
      return { success: false, message: 'Incorrect password.' };
    }

    const session: AuthUser = { name: account.name, email: account.email, createdAt: account.createdAt };
    persistSession(session);
    setUser(session);
    setError(undefined);
    return { success: true };
  }, []);

  const signUp = useCallback(async ({ name, email, password }: SignUpPayload): Promise<AuthResult> => {
    const account = readAccount();
    if (account && account.email.toLowerCase() === email.toLowerCase()) {
      setError('An account already exists for that email.');
      return { success: false, message: 'An account already exists for that email.' };
    }

    const record: StoredAccount = {
      name,
      email,
      password,
      createdAt: new Date().toISOString(),
    };

    persistAccount(record);
    const session: AuthUser = { name: record.name, email: record.email, createdAt: record.createdAt };
    persistSession(session);
    setUser(session);
    setError(undefined);
    return { success: true };
  }, []);

  const signOut = useCallback(async () => {
    persistSession(null);
    setUser(null);
    setError(undefined);
  }, []);

  const clearError = useCallback(() => {
    setError(undefined);
  }, []);

  return {
    isLoaded,
    isSignedIn: Boolean(user),
    user,
    error,
    signIn,
    signUp,
    signOut,
    clearError,
  };
}
