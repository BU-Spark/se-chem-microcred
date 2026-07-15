'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import { useStudentData } from '../hooks/useStudentData';
import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';

export default function SettingsPage() {
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

  if (!isLoaded || !isSignedIn) {
    return null;
  }

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

  return (
    <div className="page">
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className="main">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Settings</h1>
        <p style={{ color: '#4b5563' }}>Settings content coming soon.</p>
      </main>
    </div>
  );
}
