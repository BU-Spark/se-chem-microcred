'use client';

import BadgeImage from '@/app/components/BadgeImage/BadgeImage';

import styles from './BadgeOverviewCard.module.css';

export default function BadgeOverviewCard({
  badgeName,
  badgeDescription,
  badgeImageUrl,
  badgeImagePositionX,
  badgeImagePositionY,
  skills,
}: {
  badgeName: string | null;
  badgeDescription: string | null;
  badgeImageUrl?: string | null;
  badgeImagePositionX?: number | null;
  badgeImagePositionY?: number | null;
  skills: string[];
}) {
  const hasBadge = Boolean(badgeName);
  if (!hasBadge && skills.length === 0) return null;

  return (
    <>
      {hasBadge ? (
        <section className={styles.section} aria-label="Badge you will earn">
          <p className={styles.eyebrow}>Badge you&rsquo;ll earn</p>
          <div className={styles.badgeRow}>
            {badgeImageUrl ? (
              <span className={styles.badgeArt}>
                <BadgeImage
                  imageUrl={badgeImageUrl}
                  imagePositionX={badgeImagePositionX}
                  imagePositionY={badgeImagePositionY}
                  imageScale={badgeImagePositionY}
                  alt={badgeName ?? 'Badge'}
                  className={styles.badgeArtImg}
                />
              </span>
            ) : null}
            <span className={styles.badgeText}>
              <span className={styles.badgeName}>{badgeName}</span>
              {badgeDescription ? <span className={styles.badgeDescription}>{badgeDescription}</span> : null}
            </span>
          </div>
        </section>
      ) : null}

      {skills.length > 0 ? (
        <section className={styles.section} aria-label="Skills you will learn">
          <p className={styles.eyebrow}>Skills you&rsquo;ll learn</p>
          <ul className={styles.skillList}>
            {skills.map((skill) => (
              <li key={skill} className={styles.skillChip}>
                {skill}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
