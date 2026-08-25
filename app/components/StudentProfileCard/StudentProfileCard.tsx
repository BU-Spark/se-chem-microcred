import type { ImageProps } from 'next/image';
import Image from 'next/image';
import type { ReactNode } from 'react';

import styles from './StudentProfileCard.module.css';

type StudentProfileCardProps = {
  kicker: string;
  headlineTop: string;
  headlineBottom?: string;
  roleLabel?: string;
  createdAt?: string;
  email?: string | null;
  externalId?: string | null;
  avatarSrc?: ImageProps['src'] | null;
  avatarAlt: string;
  avatarFallback: string;
  sideTop?: ReactNode;
  courseTitle: string;
  courseSectionsLabel: string;
  contactTitle: string;
  contactName?: ReactNode;
  contactEmail?: string | null;
  contactAvatarSrc?: ImageProps['src'] | null;
  contactAvatarAlt?: string;
  contactFallback?: string;
  emptyContactMessage: string;
};

export default function StudentProfileCard({
  kicker,
  headlineTop,
  headlineBottom,
  roleLabel,
  createdAt,
  email,
  externalId,
  avatarSrc,
  avatarAlt,
  avatarFallback,
  sideTop,
  courseTitle,
  courseSectionsLabel,
  contactTitle,
  contactName,
  contactEmail,
  contactAvatarSrc,
  contactAvatarAlt,
  contactFallback,
  emptyContactMessage,
}: StudentProfileCardProps) {
  const hasContact = Boolean(contactName || contactEmail);

  return (
    <section className={styles.profileCard}>
      <div className={styles.profileMain}>
        <div className={styles.infoColumn}>
          <p className={styles.sectionKicker}>{kicker}</p>
          <div className={styles.nameBlock}>
            <h2 className={styles.studentName}>
              <span>{headlineTop}</span>
              {headlineBottom ? <span>{headlineBottom}</span> : null}
            </h2>
            {roleLabel || createdAt ? (
              <div className={styles.metaBlock}>
                {roleLabel ? <p className={styles.roleLabel}>{roleLabel}</p> : null}
                {createdAt ? <p className={styles.createdAt}>{createdAt}</p> : null}
              </div>
            ) : null}
          </div>
          <div className={styles.detailGrid}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Email:</span>
              <span className={styles.detailValue}>{email || 'Not provided'}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>ID:</span>
              <span className={styles.detailValue}>{externalId || 'Not provided'}</span>
            </div>
          </div>
        </div>
        <div className={styles.avatarColumn}>
          <div className={styles.avatarFrame}>
            {avatarSrc ? (
              <Image src={avatarSrc} alt={avatarAlt} width={196} height={196} className={styles.avatarImage} />
            ) : (
              <div className={styles.avatarFallback}>{avatarFallback}</div>
            )}
          </div>
        </div>
      </div>

      <aside className={styles.profileSide}>
        {sideTop}
        <section className={styles.sideSection}>
          <p className={styles.sideTitle}>Course Info:</p>
          <p className={styles.sideMeta}>
            {courseTitle}
            <br />
            {courseSectionsLabel}
          </p>
        </section>
        <section className={styles.sideSection}>
          <p className={styles.sideTitle}>{contactTitle}</p>
          {hasContact ? (
            <div className={styles.contactCard}>
              <div className={styles.contactAvatarShell}>
                {contactAvatarSrc ? (
                  <Image
                    src={contactAvatarSrc}
                    alt={contactAvatarAlt ?? ''}
                    width={86}
                    height={86}
                    className={styles.contactAvatarImage}
                  />
                ) : (
                  <div className={styles.contactAvatarFallback}>{contactFallback}</div>
                )}
              </div>
              <div className={styles.contactInfo}>
                <div className={styles.contactName}>{contactName}</div>
                <p className={styles.contactEmail}>{contactEmail || 'Not provided'}</p>
              </div>
            </div>
          ) : (
            <p className={styles.emptyState}>{emptyContactMessage}</p>
          )}
        </section>
      </aside>
    </section>
  );
}
