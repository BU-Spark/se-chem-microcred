'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

import { useSignOut } from '@/app/hooks/useSignOut';
import { useStudentData } from '../hooks/useStudentData';
import { AnalyticsPanel } from '@/app/components/AnalyticsPanel/AnalyticsPanel';
import Sidebar, { SIDEBAR_NAV } from '@/app/components/Navigation/Sidebar';
import styles from './page.module.css';

export default function AnalyticsPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const signOut = useSignOut();
  const { data: studentData } = useStudentData(user?.primaryEmailAddress?.emailAddress);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn && !isSigningOut) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, isSigningOut, router]);

  const displayName = studentData?.student.name || '';

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/splash');
    } catch (error) {
      console.error('Failed to sign out', error);
      setIsSigningOut(false);
    }
  };

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <div className={`page ${styles.page}`}>
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={`main ${styles.main}`}>
        <header className={styles.headerRow}>
          <div className={styles.titleBlock}>
            <h1 className={styles.pageTitle}>Student&apos;s Analytics</h1>
            <p className={styles.pageSubtitle}>View your analytics and track learning progress.</p>
          </div>
        </header>

        <AnalyticsPanel />
      </main>
    </div>
  );
}
