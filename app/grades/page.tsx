'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { useStudentData } from '../hooks/useStudentData';
import shellStyles from '../page.module.css';

const navItems = [
  { label: 'Home', href: '/' },
  { label: 'Profile', href: '/profile' },
  { label: 'My Analytics', href: '/analytics' },
  { label: 'Badge Wallet', href: '/badges' },
  { label: 'Grades', href: '/grades' },
  { label: 'Settings', href: '/settings' },
];

export default function GradesPage() {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();
  const { data: studentData } = useStudentData(user?.primaryEmailAddress?.emailAddress);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  const displayName = studentData?.student.name || user?.fullName || 'Student';

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/sign-in');
    } catch (error) {
      console.error('Failed to sign out', error);
      setIsSigningOut(false);
    }
  };

  return (
    <div className={shellStyles.page}>
      <aside className={shellStyles.sidebar}>
        <div className={shellStyles.profile}>
          <div className={shellStyles.avatar}>{displayName.slice(0, 2).toUpperCase()}</div>
          <div className={shellStyles.name}>{displayName}</div>
        </div>
        <nav className={shellStyles.navList}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const className = `${shellStyles.navItem}${isActive ? ` ${shellStyles.navItemActive}` : ''}`;
            return (
              <Link key={item.href} href={item.href} className={className}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className={shellStyles.sidebarFooter}>
          <button type="button" className={shellStyles.signOffButton} onClick={handleSignOut} disabled={isSigningOut}>
            {isSigningOut ? 'Signing off…' : 'Sign off'}
          </button>
          <div className={shellStyles.brandFooter}>checkd.</div>
        </div>
      </aside>

      <main className={shellStyles.main}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Grades</h1>
        <p style={{ color: '#4b5563' }}>Gradebook coming soon.</p>
      </main>
    </div>
  );
}
