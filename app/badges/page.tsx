'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import { useStudentData, type BadgeRecord } from '../hooks/useStudentData';
import styles from './page.module.css';
import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';

type BadgeStatus = 'completed' | 'assessment' | 'finalization' | 'learning' | 'notStarted';

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
    status: 'finalization',
    title: 'Ready to be Finalized',
    subtitle: 'Complete the feedback survey to finalize your badge.',
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
  },
  {
    status: 'notStarted',
    title: 'Not Yet Started',
    subtitle: 'Start the related lessons to begin earning these badges.',
  },
];

const BADGE_STATUS_LABEL: Record<BadgeRecord['status'], string> = {
  COMPLETED: 'Completed',
  READY_FOR_ASSESSMENT: 'Ready for assessment',
  READY_FOR_FINALIZATION: 'Ready to be finalized',
  LEARNING: 'Still learning',
  NOT_STARTED: 'Not yet started',
};

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

function buildAssessmentQrUrl(
  courseId: string | null | undefined,
  studentId: string | null | undefined,
  badgeId: string
) {
  if (typeof window === 'undefined' || !courseId || !studentId) {
    return null;
  }

  const url = new URL('/qr/assessment', window.location.origin);
  url.searchParams.set('courseId', courseId);
  url.searchParams.set('studentId', studentId);
  url.searchParams.set('badgeId', badgeId);
  return url.toString();
}

export default function BadgeWalletPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();
  const { data: studentData } = useStudentData(user?.primaryEmailAddress?.emailAddress);

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [activeBadgeId, setActiveBadgeId] = useState<string | null>(null);
  const [qrBadge, setQrBadge] = useState<BadgeRecord | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const [openSection, setOpenSection] = useState<BadgeStatus | null>(null);

  const modalRef = useRef<HTMLDivElement | null>(null);
  const hasAutoOpenedSection = useRef(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn && !isSigningOut) router.replace('/sign-in');
  }, [isLoaded, isSignedIn, isSigningOut, router]);

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

  const displayName = studentData?.student.name || '';

  const badgesByStatus = useMemo(
    () =>
      ({
        completed: studentData?.badges?.completed ?? [],
        assessment: studentData?.badges?.readyForAssessment ?? [],
        finalization: studentData?.badges?.readyForFinalization ?? [],
        learning: studentData?.badges?.learning ?? [],
        notStarted: studentData?.badges?.notStarted ?? [],
      }) satisfies Record<BadgeStatus, BadgeRecord[]>,
    [studentData]
  );

  useEffect(() => {
    if (!studentData || hasAutoOpenedSection.current) return;

    const firstSectionWithBadges = SECTION_CONFIG.find((section) => badgesByStatus[section.status].length > 0);
    const defaultSection = SECTION_CONFIG.find((section) => !section.collapsedByDefault);

    setOpenSection(firstSectionWithBadges?.status ?? defaultSection?.status ?? null);
    hasAutoOpenedSection.current = true;
  }, [badgesByStatus, studentData]);

  const allBadges: BadgeRecord[] = useMemo(
    () => [
      ...badgesByStatus.completed,
      ...badgesByStatus.assessment,
      ...badgesByStatus.finalization,
      ...badgesByStatus.learning,
      ...badgesByStatus.notStarted,
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
      router.replace('/splash');
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
  const qrAssessmentUrl = qrBadge
    ? buildAssessmentQrUrl(studentData?.course?.id, studentData?.student.id, qrBadge.id)
    : null;

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
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      {/* Main area: local wrapper for wallet spacing */}
      <main className="main">
        <div className={styles.walletRoot}>
          <header className={styles.headerRow}>
            <h1 className={styles.pageTitle}>Badge Wallet</h1>
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
                {activeBadge.status === 'NOT_STARTED' && (
                  <p className={styles.modalHelperText}>
                    Start the related lessons to begin working toward this badge.
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
                  {qrAssessmentUrl ? (
                    <div className={styles.qrCodeWrapper}>
                      <div className={styles.qrCodeCanvas}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/qr?size=360&data=${encodeURIComponent(qrAssessmentUrl)}`}
                          alt={`${qrBadge.name} QR code`}
                          width={360}
                          height={360}
                          className={styles.qrCodeImage}
                        />
                        <div className={styles.qrCodeLogo}>
                          <Image
                            src="/assets/badge_wallet/QR/qr_logo.svg"
                            alt="Checkd logo"
                            width={74}
                            height={74}
                            className={styles.qrCodeLogoImage}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className={styles.modalHelperText}>We could not build the assessment QR code for this badge.</p>
                  )}
                  <div className={styles.qrCaption}>{qrBadge.name} Skill Check</div>
                  <p>
                    Have your assessor scan this code to open your badge assessment. Don&apos;t forget to bring your
                    student ID for verification.
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
