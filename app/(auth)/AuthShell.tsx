import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import checkedLogo from '../../public/assets/checked_logo.png';
import styles from './auth.module.css';

/** Branded backdrop for the Clerk auth pages: splash gradient + centered checkd logo. */
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <Link href="/splash" aria-label="checkd home">
        <Image src={checkedLogo} alt="checkd" width={144} height={40} className={styles.logo} priority />
      </Link>
      {children}
    </div>
  );
}
