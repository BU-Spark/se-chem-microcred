'use client';

import type { ReactNode } from 'react';

import styles from './PageHeading.module.css';
import useFitTextToOneLine from './useFitTextToOneLine';

// Upper bound matches the global `.page-heading` size; the floor keeps even a
// very long title readable rather than letting it shrink to nothing.
const FIT_MAX_PX = 40;
const FIT_MIN_PX = 20;

export default function PageHeading({
  title,
  eyebrow,
  subtitle,
  actions,
  id,
  bare = false,
  fitTitle = false,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  id?: string;
  bare?: boolean;
  fitTitle?: boolean;
}) {
  const titleRef = useFitTextToOneLine<HTMLHeadingElement>(fitTitle && typeof title === 'string' ? title : '', {
    maxPx: FIT_MAX_PX,
    minPx: FIT_MIN_PX,
  });

  return (
    <header className={bare ? `${styles.header} ${styles.bare}` : styles.header}>
      <div className={styles.headingGroup}>
        {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
        <h1
          id={id}
          ref={fitTitle ? titleRef : undefined}
          className={fitTitle ? `page-heading ${styles.oneLineTitle}` : 'page-heading'}
        >
          {title}
        </h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
