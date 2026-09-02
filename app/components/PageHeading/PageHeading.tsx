import type { ReactNode } from 'react';

import styles from './PageHeading.module.css';

export default function PageHeading({
  title,
  eyebrow,
  subtitle,
  actions,
  id,
  bare = false,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  id?: string;
  bare?: boolean;
}) {
  return (
    <header className={bare ? `${styles.header} ${styles.bare}` : styles.header}>
      <div className={styles.headingGroup}>
        {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
        <h1 id={id} className="page-heading">
          {title}
        </h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
