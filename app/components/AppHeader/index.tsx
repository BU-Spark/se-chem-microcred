'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import styles from './AppHeader.module.css';

const navLinks = [
  { href: '/skills', label: 'Skill Catalog' },
  { href: '/badges', label: 'My Badges' },
  { href: '/report', label: 'Progress Report' },
];

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoaded, isSignedIn, user, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const hideNavigation =
    !pathname || pathname === '/' || pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up');

  if (hideNavigation) {
    return null;
  }

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
    setIsSigningOut(false);
    router.push('/sign-in');
  };

  return (
    <header className={styles.header}>
      <div>
        <Link href="/skills" className={styles.brand}>
          ChemSkills Demo
        </Link>
        <div className={styles.tagline}>
          <strong>Student Experience</strong> · Learn, earn credentials, and track progress in one place
        </div>
      </div>
      <nav className={styles.nav}>
        {navLinks.map((link) => {
          const isActive = pathname?.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.link} ${isActive ? styles.linkActive : ''}`.trim()}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className={styles.authControls}>
        {isLoaded && isSignedIn && user ? (
          <>
            <div className={styles.userMeta}>
              <span>{user.name || user.email}</span>
              <span>{new Date(user.createdAt).toLocaleDateString()}</span>
            </div>
            <button type="button" className={styles.authButton} onClick={handleSignOut} disabled={isSigningOut}>
              {isSigningOut ? 'Signing out…' : 'Sign out'}
            </button>
          </>
        ) : (
          <Link href="/sign-in" className={`${styles.link} ${styles.authButton}`.trim()}>
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

export default AppHeader;
