'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
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

function formatBadgeStatus(status: BadgeRecord['status']) {
  return BADGE_STATUS_LABEL[status];
}

export default function BadgeWalletPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();
  const { data: studentData } = useStudentData(user?.primaryEmailAddress?.emailAddress);

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [activeBadgeId, setActiveBadgeId] = useState<string | null>(null);
  const [qrBadge, setQrBadge] = useState<BadgeRecord | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  // 初始不展开任何 section（全部只露出头）
  const initialOpenSection = useMemo<BadgeStatus | null>(() => null, []);
  const [openSection, setOpenSection] = useState<BadgeStatus | null>(initialOpenSection);

  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/sign-in');
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (!activeBadgeId) return;

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
    return () => window.removeEventListener('mousedown', handleClickAway);
  }, [activeBadgeId]);

  useEffect(() => {
    setExportStatus(null);
  }, [activeBadgeId]);

  const navItems = [
    { label: 'Home', href: '/' },
    { label: 'Profile', href: '/profile' },
    { label: 'My Analytics', href: '/analytics' },
    { label: 'Badge Wallet', href: '/badges' },
    { label: 'Grades', href: '/grades' },
    { label: 'Settings', href: '/settings' },
  ];

  const displayName = studentData?.student.name || user?.fullName || 'Lastname, Student';

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

  const studentEmail = studentData?.student?.email || user?.primaryEmailAddress?.emailAddress || null;

  const startSurvey = (badge: BadgeRecord) => {
    setActiveBadgeId(null);
    router.push(`/?surveyBadge=${encodeURIComponent(badge.slug)}`);
  };

  const reviewFeedback = (badge: BadgeRecord) => {
    setActiveBadgeId(null);
    router.push(`/badges/${badge.slug}/feedback`);
  };

  const exportBadgeToLinkedIn = async (badge: BadgeRecord) => {
    if (!studentEmail) {
      setExportStatus('Please sign in again to export badges.');
      return;
    }

    setIsExporting(true);
    setExportStatus(null);

    try {
      const response = await fetch(`/api/badges/export/${badge.id}?email=${encodeURIComponent(studentEmail)}`);

      const body = (await response.json().catch(() => ({}))) as {
        linkedInUrl?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error || 'Unable to prepare LinkedIn export.');
      }

      if (!body.linkedInUrl) {
        throw new Error('LinkedIn URL unavailable.');
      }

      window.open(body.linkedInUrl, '_blank', 'noopener,noreferrer');

      setExportStatus('LinkedIn window opened. After you sign in, confirm the fields and save the certificate.');
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : 'Failed to create LinkedIn export.');
    } finally {
      setIsExporting(false);
    }
  };

  const renderBadgeTokens = (badges: BadgeRecord[]) => {
    if (!badges.length) {
      return (
        <div
          style={{
            color: 'rgba(248, 251, 255, 0.75)',
            fontSize: '0.95rem',
          }}
        >
          No badges in this section yet.
        </div>
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

              // Simplify stacking to prevent drift when toggling sections
              const zIndexBoost = SECTION_CONFIG.length - index;

              const sectionClassName = [
                styles.walletSection,
                !isExpanded ? styles.walletSectionCollapsed : '',
                isExpanded ? styles.walletSectionElevated : styles.walletSectionResting,
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <section
                  key={section.status}
                  className={sectionClassName}
                  style={{
                    zIndex: zIndexBoost,
                    transform: 'translateY(0) scale(1)',
                  }}
                  data-open={isExpanded ? 'true' : 'false'}
                >
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

                  <div
                    id={`${section.status}-badges`}
                    className={[styles.badgeGrid, isExpanded ? styles.badgeGridVisible : styles.badgeGridHidden]
                      .filter(Boolean)
                      .join(' ')}
                    aria-hidden={!isExpanded}
                  >
                    {renderBadgeTokens(badges)}
                  </div>
                </section>
              );
            })}
          </div>

          {activeBadge ? (
            <div className={styles.modalOverlay}>
              <article ref={modalRef} className={styles.badgeModal} role="dialog" aria-modal="true">
                <button type="button" className={styles.modalClose} onClick={() => setActiveBadgeId(null)}>
                  ×
                </button>
                <h3>{activeBadge.name}</h3>
                <div>
                  <span className={styles.badgeStatus}>Status: </span>
                  <span>{formatBadgeStatus(activeBadge.status)}</span>
                </div>
                <p>{activeBadge.description}</p>

                {activeBadge.status === 'READY_FOR_ASSESSMENT' && (
                  <p className={styles.modalHelperText}>
                    Show your assessor this QR code during the in-person skill check. When you finish, you can review
                    the lesson details again.
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
                    <>
                      <button
                        type="button"
                        className={styles.modalActionPrimary}
                        onClick={() => setQrBadge(activeBadge)}
                      >
                        Show Code
                      </button>
                      <button
                        type="button"
                        className={styles.modalActionLink}
                        onClick={() => reviewFeedback(activeBadge)}
                      >
                        View skill
                      </button>
                    </>
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

                  {activeBadge.status === 'LEARNING' && (
                    <button
                      type="button"
                      className={styles.modalActionPrimary}
                      onClick={() => reviewFeedback(activeBadge)}
                    >
                      Review Feedback
                    </button>
                  )}

                  {activeBadge.status === 'COMPLETED' && (
                    <button
                      type="button"
                      className={styles.modalActionPrimary}
                      onClick={() => exportBadgeToLinkedIn(activeBadge)}
                      disabled={isExporting}
                    >
                      {isExporting ? 'Preparing LinkedIn package…' : 'Export to LinkedIn'}
                    </button>
                  )}
                </div>

                {activeBadge.status === 'COMPLETED' && exportStatus ? (
                  <p className={styles.modalHelperText}>{exportStatus}</p>
                ) : null}
              </article>
            </div>
          ) : null}

          {qrBadge ? (
            <div className={styles.modalOverlay}>
              <div className={styles.qrModal} role="dialog" aria-modal="true">
                <button type="button" className={styles.modalClose} onClick={() => setQrBadge(null)}>
                  ×
                </button>
                <div className={styles.qrCodeBox}>
                  <Image
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(
                      `student:${studentData?.student.id ?? 'unknown'}|badge:${qrBadge.id}`
                    )}`}
                    alt={`${qrBadge.name} QR code`}
                    width={360}
                    height={360}
                  />
                  <div className={styles.qrCaption}>{qrBadge.name} Skill Check</div>
                  <p>
                    Show your assessor this QR code to complete the in-person assessment. Don&apos;t forget to bring
                    your student ID for verification.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
