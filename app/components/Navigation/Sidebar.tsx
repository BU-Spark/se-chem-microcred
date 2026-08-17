'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { useDatabaseDisplayNameContext } from '@/app/components/Profile/DatabaseDisplayNameProvider';
import { useCanCreateContent } from '@/app/hooks/useCanCreateContent';
import sapphire from '@/public/edit_avatar/sapphire.svg';
import ruby from '@/public/edit_avatar/ruby.svg';
import emerald from '@/public/edit_avatar/emerald.svg';
import amethyst from '@/public/edit_avatar/amethyst.svg';
import styles from '@/app/page.module.css';

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

const NAV_ICONS: Record<string, string> = {
  '/': 'lucide:layout-dashboard',
  '/my_badges': 'lucide:badge-check',
  '/badges': 'lucide:wallet-cards',
  '/messages': 'lucide:message-circle',
  '/analytics': 'lucide:chart-no-axes-combined',
  '/profile': 'lucide:user-round',
};

export const SIDEBAR_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/' },
  { label: 'Created Badges', href: '/my_badges' },
  { label: 'Badge Passport', href: '/badges' },
  { label: 'My Messages', href: '/messages' },
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
  const [collapsed, setCollapsed] = useState(true);
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

  const sidebarClass = `sidebar ${styles.sidebar} ${ready ? styles.ready : ''} ${
    collapsed ? styles.sidebarCollapsed : ''
  }`
    .replace(/\s+/g, ' ')
    .trim();

  return (
    <aside className={sidebarClass}>
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
            <span className={styles.avatarFrame}>
              <Image src={avatarSrc} alt="" className={styles.avatarImage} width={88} height={88} priority />
            </span>
          </button>
          <div className={styles.profileCopy}>
            <span className={styles.profileLabel}>Signed in as</span>
            <div className={styles.name}>{resolvedDisplayName || 'Student'}</div>
          </div>
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
                <Icon icon={NAV_ICONS[item.href] ?? 'lucide:circle'} className={styles.navIcon} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className={styles.sidebarFooter}>
          <button type="button" onClick={onSignOut} className={styles.signOffButton} disabled={isSigningOut}>
            <Icon icon="lucide:log-out" className={styles.signOffIcon} aria-hidden="true" />
            {isSigningOut ? 'Signing off…' : 'Sign off'}
          </button>
        </div>
      </div>
    </aside>
  );
}
