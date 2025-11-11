'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';
import { useStudentData, type BadgeRecord } from '../hooks/useStudentData';
import styles from './page.module.css';

type BadgeStatus = 'completed' | 'assessment' | 'finalization' | 'learning';

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
    status: 'finalization',
    title: 'Ready to be Finalized',
    subtitle: 'Complete the feedback survey to finalize your badge.',
  },
  {
    status: 'learning',
    title: 'Still Learning',
    subtitle: "You'll earn these badges after you review feedback and complete in-person reassessment.",
  },
];

const BADGE_STATUS_LABEL: Record<BadgeRecord['status'], string> = {
  COMPLETED: 'Completed',
  READY_FOR_ASSESSMENT: 'Ready for assessment',
  READY_FOR_FINALIZATION: 'Ready to be finalized',
  LEARNING: 'Still learning',
};

function initialsFromName(name?: string | null) {
  if (!name) return 'ST';
  const parts = name.trim().split(/\s+/);
  const initials = parts.slice(0, 2).map((p) => p.charAt(0).toUpperCase());
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
  if (!badge) return false;
  switch (sectionStatus) {
    case 'completed':
      return badge.status === 'COMPLETED';
    case 'assessment':
      return badge.status === 'READY_FOR_ASSESSMENT';
    case 'finalization':
      return badge.status === 'READY_FOR_FINALIZATION';
    case 'learning':
      return badge.status === 'LEARNING';
    default:
      return false;
  }
}

function formatBadgeStatus(status: BadgeRecord['status']) {
  return BADGE_STATUS_LABEL[status];
}

export default function BadgeWalletPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user, signOut } = useAuth();
  const { data: studentData, refresh } = useStudentData(user?.email);

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [activeBadgeId, setActiveBadgeId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const initialOpenSection = useMemo(() => {
    const firstOpen = SECTION_CONFIG.find((s) => !s.collapsedByDefault);
    return (firstOpen ?? SECTION_CONFIG[0]).status;
  }, []);
  const [openSection, setOpenSection] = useState<BadgeStatus | null>(initialOpenSection);
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/sign-in');
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!activeBadgeId) return;
    const handleClickAway = (event: MouseEvent) => {
      if (!modalRef.current) return setActiveBadgeId(null);
      if (event.target instanceof Node && modalRef.current.contains(event.target)) return;
      setActiveBadgeId(null);
    };
    window.addEventListener('mousedown', handleClickAway);
    return () => window.removeEventListener('mousedown', handleClickAway);
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
        completed: studentData?.badges?.completed ?? [],
        assessment: studentData?.badges?.readyForAssessment ?? [],
        finalization: studentData?.badges?.readyForFinalization ?? [],
        learning: studentData?.badges?.learning ?? [],
      }) satisfies Record<BadgeStatus, BadgeRecord[]>,
    [studentData]
  );

  const allBadges: BadgeRecord[] = useMemo(
    () => [
      ...badgesByStatus.completed,
      ...badgesByStatus.assessment,
      ...badgesByStatus.finalization,
      ...badgesByStatus.learning,
    ],
    [badgesByStatus]
  );

  const activeBadge = allBadges.find((b) => b.id === activeBadgeId) ?? null;

  if (!isLoaded || !isSignedIn) return null;

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/sign-in');
    } catch (e) {
      console.error('Failed to sign out', e);
      setIsSigningOut(false);
    }
  };

  const toggleSection = (status: BadgeStatus) => {
    setOpenSection((prev) => (prev === status ? null : status));
    setActiveBadgeId(null);
  };

  const studentEmail = studentData?.student?.email || user?.email || null;

  const markBadgeAssessed = async (badge: BadgeRecord) => {
    if (!studentEmail) return;
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/badges/${badge.id}/assess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: studentEmail }),
      });
      if (!response.ok) throw new Error('Failed to update badge status.');
      await refresh();
      setActiveBadgeId(null);
    } catch (e) {
      console.error('Failed to mark badge as assessed', e);
    } finally {
      setIsUpdating(false);
    }
  };

  const startSurvey = (badge: BadgeRecord) => {
    setActiveBadgeId(null);
    router.push(`/?surveyBadge=${encodeURIComponent(badge.slug)}`);
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
    <div className="page">
      {/* Global sidebar with global classes only */}
      <aside className="sidebar">
        <div className="profile">
          <div className="avatar">{initialsFromName(displayName)}</div>
          <div className="name">{displayName}</div>
        </div>

        <nav className="navList" aria-label="Main">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const cls = `navItem${isActive ? ' navItemActive' : ''}`;
            return (
              <Link key={item.href} href={item.href} className={cls}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebarFooter">
          <button type="button" onClick={handleSignOut} className="signOffButton" disabled={isSigningOut}>
            {isSigningOut ? 'Signing off…' : 'Sign off'}
          </button>
          <div className="brandFooter">checkd.</div>
        </div>
      </aside>

      {/* Main area: local wrapper for wallet spacing */}
      <main className="main">
        <div className={styles.walletRoot}>
          <header className={styles.headerRow}>
            <h1 className={styles.pageTitle}>Badge Wallet</h1>
            <div className="brandMark">checkd.</div>
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
                      aria-label={isExpanded ? 'Collapse section' : 'Expand section'}
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

                      {activeBadge.status === 'READY_FOR_ASSESSMENT' && (
                        <p className={styles.modalHelperText}>
                          A course assistant will observe your skills. Once the assessment is finished, mark it
                          completed to unlock the final survey.
                        </p>
                      )}
                      {activeBadge.status === 'READY_FOR_FINALIZATION' && (
                        <p className={styles.modalHelperText}>
                          Take a quick feedback survey to finalize this badge and add it to your completed list.
                        </p>
                      )}
                      {activeBadge.status === 'LEARNING' && (
                        <p className={styles.modalHelperText}>
                          Keep working through lesson checkpoints to unlock your assessment.
                        </p>
                      )}
                      {activeBadge.status === 'COMPLETED' && (
                        <p className={styles.modalHelperText}>Badge finalized. Great work!</p>
                      )}

                      <div className={styles.modalActions}>
                        {activeBadge.status === 'READY_FOR_ASSESSMENT' && (
                          <button
                            type="button"
                            className={styles.modalActionPrimary}
                            onClick={() => markBadgeAssessed(activeBadge)}
                            disabled={isUpdating}
                          >
                            {isUpdating ? 'Updating…' : 'Mark Assessment Completed'}
                          </button>
                        )}

                        {activeBadge.status === 'READY_FOR_FINALIZATION' && (
                          <button
                            type="button"
                            className={styles.modalActionPrimary}
                            onClick={() => startSurvey(activeBadge)}
                          >
                            Start Survey
                          </button>
                        )}
                      </div>
                    </article>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
