'use client';

import YoutubeThumbnail from '@/app/_components/YoutubeThumbnail';
import styles from './BadgeGrid.module.css';

export type BadgeGridItem = { id: string; name: string; youtubeUrl?: string | null };

export default function BadgeGrid({
  badges,
  tone = 'progress',
  onSelectBadge,
}: {
  badges: BadgeGridItem[];
  tone?: 'progress' | 'pending' | 'completed';
  onSelectBadge?: (badgeId: string) => void;
}) {
  if (badges.length === 0) return <p className={styles.emptyState}>No badges in this section.</p>;
  const isInteractive = tone !== 'pending' && typeof onSelectBadge === 'function';
  return (
    <div className={styles.badgeGrid}>
      {badges.map((badge) => {
        const bubbleClass = [
          styles.badgeBubble,
          tone === 'completed' ? styles.badgeBubbleCompleted : '',
          isInteractive ? styles.badgeBubbleInteractive : '',
        ]
          .filter(Boolean)
          .join(' ');
        const content = (
          <>
            <div className={bubbleClass}>
              <YoutubeThumbnail
                videoUrl={badge.youtubeUrl}
                alt={`${badge.name} thumbnail`}
                className={styles.badgeBubbleImage}
              />
            </div>
            <p className={styles.badgeName}>{badge.name}</p>
          </>
        );
        return (
          <div key={badge.id} className={styles.badgeItem}>
            {isInteractive ? (
              <button type="button" className={styles.badgeTokenButton} onClick={() => onSelectBadge?.(badge.id)}>
                {content}
              </button>
            ) : (
              <div className={styles.badgeTokenStatic}>{content}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
