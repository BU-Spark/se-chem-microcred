'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';
import styles from './page.module.css';

type BadgeCatalogItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  createdAt: string;
  assignedStudentCount: number;
  requirements: Array<{
    id: string;
    summary: string | null;
    displayText: string;
    rubricItems: Array<{ number: number; text: string }>;
    gradingCriteria: Array<{ number: number; criterion: string | null; options: string[] }>;
    lesson: {
      id: string;
      title: string;
      course: {
        id: string;
        title: string;
      } | null;
    } | null;
  }>;
};

type BadgesResponse = {
  count: number;
  badges: BadgeCatalogItem[];
};

function useBadgesCatalog(enabled: boolean) {
  const [data, setData] = useState<BadgesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBadges = useCallback(async () => {
    if (!enabled) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/badges', {
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({ error: `Request failed: ${response.status}` }));

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to load badges.');
      }

      setData(payload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Unable to load badges.');
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void fetchBadges();
  }, [fetchBadges]);

  return { data, isLoading, error, refresh: fetchBadges };
}

// A badge's "main page" lives at /courses/[courseId]/[badgeId], so we need the course it's
// attached to (via any of its requirement lessons). Unassigned badges have no detail page,
// so we fall back to opening them in the editor.
function resolveBadgeHref(badge: BadgeCatalogItem) {
  const courseId = badge.requirements.find((requirement) => requirement.lesson?.course?.id)?.lesson?.course?.id;
  return courseId ? `/courses/${courseId}/${badge.id}` : `/badge_creation?badgeId=${badge.id}`;
}

export default function MyBadgesPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { data, isLoading, error, refresh } = useBadgesCatalog(isLoaded && Boolean(isSignedIn));
  const displayName = user?.fullName || 'Student';
  const sortedBadges = useMemo(
    () => [...(data?.badges ?? [])].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    [data?.badges]
  );

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) return null;

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/sign-in');
    } catch (error) {
      console.error('Sign out failed', error);
      setIsSigningOut(false);
    }
  };

  return (
    <div className={`page ${styles.page}`}>
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={`main ${styles.main}`}>
        <h1 className={styles.pageTitle}>Badges</h1>

        <button type="button" onClick={() => router.push('/badge_creation')} className={styles.createButton}>
          Create New Badge
        </button>

        {isLoading ? <p className={styles.statusMessage}>Loading badges...</p> : null}

        {!isLoading && error ? (
          <div className={styles.statusBlock}>
            <p className={styles.statusMessage}>{error}</p>
            <button type="button" className={styles.secondaryButton} onClick={() => refresh()}>
              Try again
            </button>
          </div>
        ) : null}

        {!isLoading && !error && sortedBadges.length === 0 ? (
          <section className={styles.emptyState}>
            <h2>No badges yet</h2>
            <p>Create a badge and it will appear here.</p>
          </section>
        ) : null}

        {!isLoading && !error && sortedBadges.length > 0 ? (
          <section className={styles.badgeGrid} aria-label="Badge catalog">
            {sortedBadges.map((badge) => (
              <Link key={badge.id} href={resolveBadgeHref(badge)} className={styles.badgeCard}>
                <span className={styles.badgeToken} aria-hidden="true" />
                <span className={styles.badgeName}>{badge.name}</span>
              </Link>
            ))}
          </section>
        ) : null}
      </main>
    </div>
  );
}
