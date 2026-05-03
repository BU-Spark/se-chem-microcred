'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from '../page.module.css';

interface NavItem {
  label: string;
  href: string;
}

interface SidebarProps {
  navItems: NavItem[];
  displayName: string;
  onSignOut: () => void;
  isSigningOut: boolean;
}

export const SIDEBAR_NAV: NavItem[] = [
  { label: 'Home', href: '/' },
  // { label: 'Badges', href: '/badges_creation' },
  // { label: 'Student Roster', href: '/roster' },
  // { label: 'Messages', href: '/messages' },
  { label: 'Profile', href: '/profile' },
  { label: 'My Analytics', href: '/analytics' },
  { label: 'Badge Wallet', href: '/badges' },
  { label: 'Grades', href: '/grades' },
  { label: 'Settings', href: '/settings' },
];

export function initialsFromName(name?: string | null) {
  if (!name) return 'ST';
  const parts = name.trim().split(/\s+/);
  return (
    parts
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('') || 'ST'
  );
}

export default function Sidebar({ navItems, displayName, onSignOut, isSigningOut }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className={`sidebar ${styles.sidebar}`}>
      {/* Avatar + Name */}
      <div className={styles.profile}>
        <div className={styles.avatar}>{initialsFromName(displayName)}</div>
        <div className={styles.name}>{displayName}</div>
      </div>

      {/* Nav Links */}
      <nav className={styles.navList}>
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`));
          const navItemClass = `${styles.navItem} ${isActive ? styles.navItemActive : ''}`.trim();
          return (
            <Link key={item.href} href={item.href} className={navItemClass}>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={styles.sidebarFooter}>
        <button type="button" onClick={onSignOut} className={styles.signOffButton} disabled={isSigningOut}>
          {isSigningOut ? 'Signing off…' : 'Sign off'}
        </button>
      </div>
    </aside>
  );
}
