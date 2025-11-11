'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useStudentData } from '../hooks/useStudentData';

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
  const { isLoaded, isSignedIn, user, signOut } = useAuth();
  const { data: studentData } = useStudentData(user?.email);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  const displayName = studentData?.student.name || user?.name || 'Student';

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
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Grades</h1>
        <p style={{ color: '#4b5563' }}>Gradebook coming soon.</p>
      </main>
    </div>
  );
}
