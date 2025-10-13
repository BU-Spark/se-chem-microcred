'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';
import { useStudentData, type BadgeRecord } from '../hooks/useStudentData';
import styles from './page.module.css';

type BadgeStatus = 'completed' | 'assessment' | 'learning';

type SectionConfig = {
  status: BadgeStatus;
  title: string;
  subtitle: string;
  collapsedByDefault?: boolean;
};

const SECTION_CONFIG: SectionConfig[] = [
  {
    status: 'completed',
    title: 'Completed Badges',
    subtitle: "You've completed these skills!",
  },
  {
    status: 'assessment',
    title: 'Ready to be Assessed',
    subtitle: "You'll earn these badges after an in-person assessment.",
    collapsedByDefault: true,
  },
  {
    status: 'learning',
    title: 'Still Learning',
    subtitle: "You'll earn these badges after you review feedback and complete in-person reassessment.",
    collapsedByDefault: false,
  },
];

function initialsFromName(name?: string | null) {
  if (!name) {
    return 'ST';
  }
  const parts = name.trim().split(/\s+/);
  const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase());
  return initials.join('') || 'ST';
}

function ChevronIcon({ direction = 'down' }: { direction?: 'down' | 'up' }) {
  const rotate = direction === 'down' ? '0' : '180';
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" style={{ transform: `rotate(${rotate}deg)` }}>
      <path
        d="M6.5 9l5.5 6 5.5-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function isBadgeInSection(badge: BadgeRecord | null, sectionStatus: BadgeStatus) {
  if (!badge) {
    return false;
  }
  switch (sectionStatus) {
    case 'completed':
      return badge.status === 'COMPLETED';
    case 'assessment':
      return badge.status === 'READY_FOR_ASSESSMENT';
    case 'learning':
      return badge.status === 'LEARNING';
    default:
      return false;
  }
}

function formatBadgeStatus(status: BadgeRecord['status']) {
  switch (status) {
    case 'COMPLETED':
      return 'Completed';
    case 'READY_FOR_ASSESSMENT':
      return 'Ready for assessment';
    case 'LEARNING':
      return 'Still learning';
    default:
      return status.replace(/_/g, ' ').toLowerCase();
  }
}

export default function BadgeWalletPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user, signOut } = useAuth();
  const { data: studentData } = useStudentData(user?.email);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [activeBadgeId, setActiveBadgeId] = useState<string | null>(null);
  const initialOpenSection = useMemo(() => {
    const firstOpen = SECTION_CONFIG.find((section) => !section.collapsedByDefault);
    return (firstOpen ?? SECTION_CONFIG[0]).status;
  }, []);
  const [openSection, setOpenSection] = useState<BadgeStatus | null>(initialOpenSection);
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!activeBadgeId) {
      return undefined;
    }

    const handleClickAway = (event: MouseEvent) => {
      if (!modalRef.current) {
        setActiveBadgeId(null);
        return;
      }
      if (event.target instanceof Node && modalRef.current.contains(event.target)) {
        return;
      }
      setActiveBadgeId(null);
    };

    window.addEventListener('mousedown', handleClickAway);
    return () => {
      window.removeEventListener('mousedown', handleClickAway);
    };
  }, [activeBadgeId]);

  const navItems = [
    { label: 'Home', href: '/' },
    { label: 'Profile', href: '/profile' },
    { label: 'My Analytics', href: '/analytics' },
    { label: 'Badge Wallet', href: '/badges' },
    { label: 'Grades', href: '/grades' },
    { label: 'Settings', href: '/settings' },
  ];

  const displayName = studentData?.student.name || user?.name || 'Lastname, Student';

  const badgesByStatus = useMemo(
    () =>
      ({
        completed: studentData?.badges.completed ?? [],
        assessment: studentData?.badges.readyForAssessment ?? [],
        learning: studentData?.badges.learning ?? [],
      }) satisfies Record<BadgeStatus, BadgeRecord[]>,
    [studentData]
  );

  const allBadges: BadgeRecord[] = useMemo(
    () => [...badgesByStatus.completed, ...badgesByStatus.assessment, ...badgesByStatus.learning],
    [badgesByStatus]
  );

  const activeBadge = allBadges.find((badge) => badge.id === activeBadgeId) ?? null;

  if (!isLoaded || !isSignedIn) {
    return null;
  }

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

  const toggleSection = (status: BadgeStatus) => {
    setOpenSection((prev) => {
      if (prev === status) {
        return null;
      }
      return status;
    });
    setActiveBadgeId(null);
  };

  const renderBadgeTokens = (badges: BadgeRecord[]) => {
    if (!badges.length) {
      return (
        <div style={{ color: 'rgba(248, 251, 255, 0.75)', fontSize: '0.95rem' }}>No badges in this section yet.</div>
      );
    }

    return badges.map((badge) => {
      const isActive = activeBadgeId === badge.id;
      const tokenClassName = [styles.badgeToken, isActive ? styles.badgeTokenActive : ''].filter(Boolean).join(' ');

      return (
        <button
          type="button"
          key={badge.id}
          className={tokenClassName}
          onClick={() => setActiveBadgeId(badge.id)}
          aria-pressed={isActive}
        >
          <span className={styles.badgeName}>{badge.name.replace(/ Badge$/i, '')}</span>
        </button>
      );
    });
  };

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.profileSummary}>
          <div className={styles.profileSummaryAvatar}>{initialsFromName(displayName)}</div>
          <div className={styles.profileSummaryName}>{displayName}</div>
        </div>
        <nav className={styles.navList}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const navItemClass = `${styles.navItem} ${isActive ? styles.navItemActive : ''}`.trim();
            return (
              <Link key={item.href} href={item.href} className={navItemClass}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className={styles.sidebarFooter}>
          <button type="button" onClick={handleSignOut} className={styles.signOffButton} disabled={isSigningOut}>
            {isSigningOut ? 'Signing off…' : 'Sign off'}
          </button>
          <div className={styles.brandFooter}>checkd.</div>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.headerRow}>
          <h1 className={styles.pageTitle}>Badge Wallet</h1>
          <div className={styles.brandMark}>checkd.</div>
        </header>

        <div className={styles.walletSections}>
          {SECTION_CONFIG.map((section, index) => {
            const badges = badgesByStatus[section.status];
            const isExpanded = openSection === section.status;
            const sectionClassName = [
              styles.walletSection,
              !isExpanded ? styles.walletSectionCollapsed : '',
              isExpanded && isBadgeInSection(activeBadge, section.status) ? styles.walletSectionElevated : '',
            ]
              .filter(Boolean)
              .join(' ');
            const baseZ = index + 1;
            const elevatedBoost = isExpanded && isBadgeInSection(activeBadge, section.status) ? 6 : 0;

            return (
              <section key={section.status} className={sectionClassName} style={{ zIndex: baseZ + elevatedBoost }}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionTitle}>
                    <h2>{section.title}</h2>
                    <p>{section.subtitle}</p>
                  </div>
                  <button
                    type="button"
                    className={[styles.toggleButton, isExpanded ? styles.toggleButtonOpen : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => toggleSection(section.status)}
                    aria-expanded={isExpanded}
                    aria-controls={`${section.status}-badges`}
                  >
                    <ChevronIcon direction={isExpanded ? 'up' : 'down'} />
                  </button>
                </div>

                {isExpanded && (
                  <div id={`${section.status}-badges`} className={styles.badgeGrid}>
                    {renderBadgeTokens(badges)}
                  </div>
                )}

                {isExpanded && activeBadge && isBadgeInSection(activeBadge, section.status) && (
                  <article ref={modalRef} className={[styles.badgeModal, styles.badgeModalVisible].join(' ')}>
                    <h3>{activeBadge.name}</h3>
                    <div>
                      <span className={styles.badgeStatus}>Status: </span>
                      <span>{formatBadgeStatus(activeBadge.status)}</span>
                    </div>
                    <p>{activeBadge.description}</p>
                    <div className={styles.modalActions}>
                      <button type="button" className={styles.modalActionSecondary}>
                        Review Skill
                      </button>
                      <button type="button" className={styles.modalActionPrimary}>
                        Show Code
                      </button>
                    </div>
                  </article>
                )}
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
