'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import styles from '../../auth.module.css';

interface SignUpFormState {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export default function SignUpPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, signUp, error, clearError } = useAuth();

  const [formState, setFormState] = useState<SignUpFormState>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
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

  const handleChange = (event: FormEvent<HTMLInputElement>) => {
    const { name, value } = event.currentTarget;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();
    setFormError(undefined);
    setSuccessMessage(undefined);

    if (!formState.name || !formState.email || !formState.password) {
      setFormError('Please complete all required fields.');
      return;
    }

    if (formState.password.length < 6) {
      setFormError('Password must be at least 6 characters long.');
      return;
    }

    if (formState.password !== formState.confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    const result = await signUp({
      name: formState.name,
      email: formState.email,
      password: formState.password,
    });
    setIsSubmitting(false);

    if (!result.success) {
      setFormError(result.message ?? 'Unable to create account at this time.');
      return;
    }

    setSuccessMessage('Account created! Redirecting to your dashboard...');
    setTimeout(() => {
      router.replace('/');
    }, 900);
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div>
          <h1 className={styles.title}>Create your account</h1>
          <p className={styles.subtitle}>Set up a profile to start collecting chemistry micro-credentials.</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">
              Full name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              className={styles.input}
              autoComplete="name"
              placeholder="Ada Lovelace"
              value={formState.name}
              onInput={handleChange}
              required
            />
          </div>

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
              autoComplete="new-password"
              placeholder="Choose a password"
              value={formState.password}
              onInput={handleChange}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="confirmPassword">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              className={styles.input}
              autoComplete="new-password"
              placeholder="Re-enter your password"
              value={formState.confirmPassword}
              onInput={handleChange}
              required
            />
          </div>

          {formError ? <div className={styles.error}>{formError}</div> : null}
          {successMessage ? <div className={styles.success}>{successMessage}</div> : null}

          <button type="submit" className={styles.button} disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Sign up'}
          </button>
        </form>

        <p className={styles.helperText}>
          Already have an account?{' '}
          <Link href="/sign-in" className={styles.htmlLink}>
            Sign in
          </Link>
        </p>

        <p className={styles.metaInfo}>
          Demo only: credentials are stored locally in your browser for this walkthrough.
        </p>
      </div>
    </div>
  );
}
