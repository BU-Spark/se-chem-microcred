'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

export default function Sidebar({ navItems, displayName, onSignOut, isSigningOut }: SidebarProps) {
  const pathname = usePathname();
  const { isAdmin } = useCanCreateContent();
  // My Badges is an admin-only surface (independent of ALPHA_MODE): hide it from
  // non-admins. Hidden by default while access loads.
  const visibleNavItems = isAdmin ? navItems : navItems.filter((item) => item.href !== '/my_badges');
  const { displayName: contextDisplayName, avatarBase } = useDatabaseDisplayNameContext();
  const resolvedDisplayName =
    contextDisplayName !== undefined ? (contextDisplayName?.trim() ?? '') : displayName.trim();
  const avatarSrc = (avatarBase && AVATAR_SRC[avatarBase]) || sapphire;

  return (
    <aside className={`sidebar ${styles.sidebar}`}>
      {/* Avatar + Name */}
      <div className={styles.profile}>
        <div className={styles.avatar}>
          <Image src={avatarSrc} alt="" className={styles.avatarImage} width={140} height={140} priority />
        </div>
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
    </aside>
  );
}
