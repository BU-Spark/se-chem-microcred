'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';

export default function MyBadgesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) return null;

  const navItems = [
    { label: 'Home', href: '/' },
    { label: 'Profile', href: '/profile' },
    { label: 'My Analytics', href: '/analytics' },
    { label: 'Badges', href: '/badge_creation' },
    { label: 'Badge Wallet', href: '/badges' },
    { label: 'My Badges', href: '/my_badges' },
    { label: 'Grades', href: '/grades' },
    { label: 'Settings', href: '/settings' },
  ];

  const displayName = user?.fullName || 'Student';

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/sign-in');
    } catch (error) {
      console.error('Sign out failed', error);
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

        <nav className="navList" aria-label="Main">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={`navItem${isActive ? ' navItemActive' : ''}`}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebarFooter">
          <button type="button" onClick={handleSignOut} className="signOffButton" disabled={isSigningOut}>
            {isSigningOut ? 'Signing off…' : 'Sign off'}
          </button>
        </div>
      </aside>

      <main className="main">
        <div style={{ padding: '2.5rem 3rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '1.5rem' }}>My Badges</h1>
          <button
            type="button"
            onClick={() => router.push('/badge_creation')}
            style={{
              background: '#1f5fab',
              color: '#ffffff',
              border: 'none',
              borderRadius: '999px',
              padding: '0.9rem 1.5rem',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Create Badge
          </button>
        </div>
      </main>
    </div>
  );
}
