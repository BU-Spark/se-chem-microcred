'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { useStudentData } from '../hooks/useStudentData';

const navItems = [
  { label: 'Home', href: '/' },
  { label: 'Profile', href: '/profile' },
  { label: 'My Analytics', href: '/analytics' },
  { label: 'Badge Wallet', href: '/badges' },
<<<<<<< HEAD
=======
  { label: 'My Badges', href: '/my_badges' },
>>>>>>> badge-creation
  { label: 'Grades', href: '/grades' },
  { label: 'Settings', href: '/settings' },
];

export default function SettingsPage() {
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
    <div className="page">
      <aside className="sidebar">
        <div className="profile">
          <div className="avatar">{displayName.slice(0, 2).toUpperCase()}</div>
          <div className="name">{displayName}</div>
        </div>
        <nav className="navList">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const className = `navItem${isActive ? ' navItemActive' : ''}`;
            return (
              <Link key={item.href} href={item.href} className={className}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebarFooter">
          <button type="button" className="signOffButton" onClick={handleSignOut} disabled={isSigningOut}>
            {isSigningOut ? 'Signing off…' : 'Sign off'}
          </button>
          <div className="brandFooter">checkd.</div>
        </div>
      </aside>

      <main className="main">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Settings</h1>
        <p style={{ color: '#4b5563' }}>Settings content coming soon.</p>
      </main>
    </div>
  );
}
