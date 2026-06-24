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

const CATEGORY_LABELS: Record<string, string> = {
  SAFETY: 'Safety',
  EQUIPMENT: 'Equipment',
  WASTE: 'Waste',
  OTHER: 'Other',
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

function formatCategory(category?: string | null) {
  return category ? (CATEGORY_LABELS[category] ?? category) : 'Uncategorized';
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function resolveAssignmentLabel(badge: BadgeCatalogItem) {
  const courseTitles = Array.from(
    new Set(
      badge.requirements
        .map((requirement) => requirement.lesson?.course?.title)
        .filter((title): title is string => Boolean(title))
    )
  );

  if (courseTitles.length === 0) {
    return 'Not assigned to a course';
  }

  if (courseTitles.length === 1) {
    return `Assigned to ${courseTitles[0]}`;
  }

  return `Assigned to ${courseTitles.length} courses`;
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

  const openEditBadge = (badge: BadgeCatalogItem) => {
    const courseId = badge.requirements.find((requirement) => requirement.lesson?.course?.id)?.lesson?.course?.id;
    const params = new URLSearchParams({ badgeId: badge.id });

    if (courseId) {
      params.set('courseId', courseId);
    }

    router.push(`/badge_creation?${params.toString()}`);
  };

  return (
    <div className={`page ${styles.page}`}>
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={`main ${styles.main}`}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.pageTitle}>Badges</h1>
            <p className={styles.pageSubtitle}>All badges available in the system.</p>
          </div>

          <button type="button" onClick={() => router.push('/badge_creation')} className={styles.createButton}>
            Create Badge
          </button>
        </header>

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
              <article key={badge.id} className={styles.badgeCard}>
                <div className={styles.badgeToken} aria-hidden="true" />
                <div className={styles.badgeBody}>
                  <div className={styles.badgeTopLine}>
                    <span className={styles.categoryPill}>{formatCategory(badge.category)}</span>
                    <span className={styles.dateText}>{formatDate(badge.createdAt)}</span>
                  </div>

                  <h2 className={styles.badgeName}>{badge.name}</h2>
                  <p className={styles.badgeDescription}>{badge.description || 'No description provided.'}</p>

                  <div className={styles.badgeMeta}>
                    <span>{resolveAssignmentLabel(badge)}</span>
                    <span>{badge.assignedStudentCount} students assigned</span>
                  </div>

                  {badge.requirements.length > 0 ? (
                    <ul className={styles.requirementList}>
                      {badge.requirements.slice(0, 2).map((requirement) => (
                        <li key={requirement.id}>{requirement.lesson?.title ?? requirement.displayText}</li>
                      ))}
                    </ul>
                  ) : null}

                  <div className={styles.cardActions}>
                    <button type="button" className={styles.secondaryButton} onClick={() => openEditBadge(badge)}>
                      Edit
                    </button>
                    {badge.requirements.some((requirement) => requirement.lesson?.course?.id)
                      ? Array.from(
                          new Map(
                            badge.requirements
                              .map((requirement) => requirement.lesson?.course)
                              .filter((course): course is { id: string; title: string } => Boolean(course))
                              .map((course) => [course.id, course])
                          ).values()
                        )
                          .slice(0, 1)
                          .map((course) => (
                            <Link key={course.id} href={`/courses/${course.id}`} className={styles.detailLink}>
                              View course
                            </Link>
                          ))
                      : null}
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : null}

      </main>
    </div>
  );
}
