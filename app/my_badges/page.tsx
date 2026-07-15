'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import { useCanCreateContent } from '@/app/hooks/useCanCreateContent';
import { useBadgesCatalog, type BadgeCatalogItem } from '@/app/hooks/useBadgesCatalog';
import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';
import YoutubeThumbnail from '@/app/_components/YoutubeThumbnail';
import styles from './page.module.css';

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
  const signOut = useSignOut();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { data, isLoading, error, refresh } = useBadgesCatalog(isLoaded && Boolean(isSignedIn));
  const { canCreateContent } = useCanCreateContent(isLoaded && Boolean(isSignedIn));
  const [badgePendingDelete, setBadgePendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const displayName = user?.fullName || 'Student';
  const sortedBadges = useMemo(
    () => [...(data?.badges ?? [])].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    [data?.badges]
  );

  useEffect(() => {
    if (isLoaded && !isSignedIn && !isSigningOut) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, isSigningOut, router]);

  if (!isLoaded || !isSignedIn) return null;

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/splash');
    } catch (error) {
      console.error('Sign out failed', error);
      setIsSigningOut(false);
    }
  };

  const requestDeleteBadge = (badge: { id: string; name: string }) => {
    if (isDeleting) return;
    setDeleteError(null);
    setBadgePendingDelete(badge);
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setBadgePendingDelete(null);
    setDeleteError(null);
  };

  const confirmDeleteBadge = async () => {
    if (!badgePendingDelete || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/badges/${encodeURIComponent(badgePendingDelete.id)}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Failed to delete badge.');
      setBadgePendingDelete(null);
      await refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete badge.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={`page ${styles.page}`}>
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={`main ${styles.main}`}>
        <h1 className={styles.pageTitle}>Badges</h1>

        {canCreateContent ? (
          <button type="button" onClick={() => router.push('/badge_creation')} className={styles.createButton}>
            Create New Badge
          </button>
        ) : null}

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
            {sortedBadges.map((badge) => {
              const videoUrl = badge.requirements.find((requirement) => requirement.youtubeUrl)?.youtubeUrl ?? null;
              return (
                <div key={badge.id} className={styles.badgeCardItem}>
                  <Link href={resolveBadgeHref(badge)} className={styles.badgeCard}>
                    <span className={styles.badgeToken}>
                      <YoutubeThumbnail
                        videoUrl={videoUrl}
                        alt={`${badge.name} thumbnail`}
                        className={styles.badgeTokenImage}
                      />
                    </span>
                    <span className={styles.badgeName}>{badge.name}</span>
                  </Link>
                  {canCreateContent ? (
                    <button
                      type="button"
                      className={styles.badgeDeleteButton}
                      onClick={() => requestDeleteBadge({ id: badge.id, name: badge.name })}
                      disabled={isDeleting}
                      aria-label={`Delete ${badge.name}`}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              );
            })}
          </section>
        ) : null}
      </main>

      {badgePendingDelete ? (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-badge-title"
          onClick={closeDeleteModal}
        >
          <div className={styles.editModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 id="delete-badge-title">Delete badge</h2>
              <button type="button" className={styles.closeButton} onClick={closeDeleteModal} aria-label="Close">
                ×
              </button>
            </div>
            <p className={styles.statusMessage}>
              Delete the badge &ldquo;{badgePendingDelete.name}&rdquo;? This removes it everywhere and cannot be undone.
            </p>
            {deleteError ? <p className={styles.errorText}>{deleteError}</p> : null}
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={closeDeleteModal} disabled={isDeleting}>
                Cancel
              </button>
              <button type="button" className={styles.dangerButton} onClick={confirmDeleteBadge} disabled={isDeleting}>
                {isDeleting ? 'Deleting…' : 'Delete badge'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
