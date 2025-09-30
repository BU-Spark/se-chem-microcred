'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import styles from '../../auth.module.css';

interface SignInFormState {
  email: string;
  password: string;
}

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn, signIn, error, clearError } = useAuth();

  const [formState, setFormState] = useState<SignInFormState>({ email: '', password: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace('/');
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    setFormError(error);
  }, [error]);

  useEffect(() => {
    const emailFromQuery = searchParams.get('email');
    if (emailFromQuery) {
      setFormState((prev) => ({ ...prev, email: emailFromQuery }));
    }
  }, [searchParams]);

  const handleChange = (event: FormEvent<HTMLInputElement>) => {
    const { name, value } = event.currentTarget;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();
    setFormError(undefined);
    setSuccessMessage(undefined);

    if (!formState.email || !formState.password) {
      setFormError('Please provide both email and password.');
      return;
    }

    setIsSubmitting(true);
    const result = await signIn(formState);
    setIsSubmitting(false);

    if (!result.success) {
      setFormError(result.message ?? 'Unable to sign in.');
      return;
    }

    setSuccessMessage('Signed in successfully. Redirecting to your dashboard...');
    setTimeout(() => {
      router.replace('/');
    }, 900);
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div>
          <h1 className={styles.title}>Welcome back</h1>
          <p className={styles.subtitle}>Sign in to continue exploring your micro-credential journey.</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className={styles.input}
              autoComplete="email"
              placeholder="you@example.edu"
              value={formState.email}
              onInput={handleChange}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className={styles.input}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={formState.password}
              onInput={handleChange}
              required
            />
          </div>

          {formError ? <div className={styles.error}>{formError}</div> : null}
          {successMessage ? <div className={styles.success}>{successMessage}</div> : null}

          <button type="submit" className={styles.button} disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className={styles.helperText}>
          New to ChemSkills?{' '}
          <Link href="/sign-up" className={styles.htmlLink}>
            Create an account
          </Link>
        </p>

        <p className={styles.metaInfo}>Demo account available: student@example.edu / demo123</p>
      </div>
    </div>
  );
}
