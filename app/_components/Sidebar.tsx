'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useDatabaseDisplayNameContext } from './DatabaseDisplayNameProvider';
import { useCanCreateContent } from '@/app/hooks/useCanCreateContent';
import sapphire from '../../public/edit_avatar/sapphire.svg';
import ruby from '../../public/edit_avatar/ruby.svg';
import emerald from '../../public/edit_avatar/emerald.svg';
import amethyst from '../../public/edit_avatar/amethyst.svg';
import styles from '../page.module.css';

const AVATAR_SRC: Record<string, typeof sapphire> = {
  SAPPHIRE: sapphire,
  RUBY: ruby,
  EMERALD: emerald,
  AMETHYST: amethyst,
};

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

// Messages is a work-in-progress feature: show it only when explicitly enabled
// via env (set NEXT_PUBLIC_CURRENT_ENVIRONMENT_DEV=true in .env.local for dev).
// Unset in prod, so it stays hidden there. Must be NEXT_PUBLIC_* to be readable
// in this client component.
const CUR_ENV = (process.env.NEXT_PUBLIC_CURRENT_ENVIRONMENT_DEV ?? '').toLowerCase() === 'true';

export const SIDEBAR_NAV: NavItem[] = [
  { label: 'Courses', href: '/' },
  { label: 'Created Badges', href: '/my_badges' },
  { label: 'Badge Passport', href: '/badges' },
  ...(CUR_ENV ? [{ label: 'My Messages', href: '/messages' }] : []),
  { label: 'My Analytics', href: '/analytics' },
  { label: 'My Profile', href: '/profile' }, // In this combine the setting and profile features.
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

// Persist the collapsed state so it stays consistent as the user navigates
// between pages (each page renders its own Sidebar instance).
const COLLAPSED_STORAGE_KEY = 'sidebarCollapsed';

export default function Sidebar({ navItems, displayName, onSignOut, isSigningOut }: SidebarProps) {
  const pathname = usePathname();
  const { isAdmin } = useCanCreateContent();
  // Default to closed so the sidebar renders collapsed on every page load
  // (server render matches, avoiding a hydration mismatch). Only open if a
  // prior preference explicitly said so.
  const [collapsed, setCollapsed] = useState(true);
  // Transitions stay disabled until after the first paint so applying the saved
  // state on mount/navigation doesn't animate — it just appears in place.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const stored = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    setCollapsed(stored !== 'false');
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  };
  // My Badges is an admin-only surface (independent of ALPHA_MODE): hide it from
  // non-admins. Hidden by default while access loads.
  const visibleNavItems = isAdmin ? navItems : navItems.filter((item) => item.href !== '/my_badges');
  const { displayName: contextDisplayName, avatarBase } = useDatabaseDisplayNameContext();
  const resolvedDisplayName =
    contextDisplayName !== undefined ? (contextDisplayName?.trim() ?? '') : displayName.trim();
  const avatarSrc = (avatarBase && AVATAR_SRC[avatarBase]) || sapphire;

  // A single DOM tree that animates between widths (rather than swapping trees)
  // so the collapse/expand is a smooth transition.
  const sidebarClass = `sidebar ${styles.sidebar} ${ready ? styles.ready : ''} ${
    collapsed ? styles.sidebarCollapsed : ''
  }`
    .replace(/\s+/g, ' ')
    .trim();

  return (
    <aside className={sidebarClass}>
      {/* Collapse toggle: a chevron tab on the sidebar's edge. */}
      <button
        type="button"
        onClick={toggleCollapsed}
        className={styles.collapseToggle}
        aria-label={collapsed ? 'Open sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        title={collapsed ? 'Open sidebar' : 'Collapse sidebar'}
      >
        <span className={styles.chevron} aria-hidden="true" />
      </button>

      {/* Inner scroll container: clips content during the width animation and
          scrolls when the nav is taller than the viewport, while the aside
          itself keeps visible overflow so the toggle tab can sit on its edge. */}
      <div className={styles.sidebarInner}>
        {/* Avatar + Name. The avatar also reopens the sidebar when collapsed. */}
        <div className={styles.profile}>
          <button
            type="button"
            onClick={collapsed ? toggleCollapsed : undefined}
            className={styles.avatar}
            aria-label={collapsed ? 'Open sidebar' : undefined}
            aria-hidden={!collapsed}
            tabIndex={collapsed ? 0 : -1}
          >
            <Image src={avatarSrc} alt="" className={styles.avatarImage} width={140} height={140} priority />
          </button>
          <div className={styles.name}>{resolvedDisplayName}</div>
        </div>

        {/* Nav Links */}
        <nav className={styles.navList}>
          {visibleNavItems.map((item) => {
            const isCourseWorkspace =
              pathname === '/course_dashboard' ||
              pathname === '/courses' ||
              pathname === '/courses/new' ||
              pathname.startsWith('/courses/');
            const isActive =
              item.href === '/'
                ? pathname === item.href || isCourseWorkspace
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
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
      </div>
    </aside>
  );
}
