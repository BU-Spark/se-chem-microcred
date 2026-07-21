'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import { useStudentData, type BadgeRecord } from '../hooks/useStudentData';
import styles from './page.module.css';
import Sidebar, { SIDEBAR_NAV } from '@/app/components/Navigation/Sidebar';
import YoutubeThumbnail from '@/app/components/Video/Youtube/YoutubeThumbnail';
import AssessmentCodeModal from '@/app/components/AssessmentCodeModal';

type BadgeStatus = 'completed' | 'assessment' | 'inReview' | 'learning' | 'locked';

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
    status: 'inReview',
    title: 'In Review',
    subtitle: 'Review your assessment result — rate to finalize, or read feedback before reassessing.',
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
    subtitle: "You'll earn these badges after you finish the lesson and pass an in-person assessment.",
  },
  {
    status: 'locked',
    title: 'Locked',
    subtitle: "You've used every assessment attempt for these badges.",
    collapsedByDefault: true,
  },
];

const BADGE_STATUS_LABEL: Record<BadgeRecord['status'], string> = {
  COMPLETED: 'Completed',
  READY_FOR_ASSESSMENT: 'Ready for assessment',
  IN_REVIEW: 'In review',
  LEARNING: 'Still learning',
  LOCKED: 'Locked',
  NOT_STARTED: 'Not yet started',
};

// Material-style keyboard_arrow_down chevron (rotates 180deg when open via CSS)
function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" focusable="false">
      <path
        d="M7 10l5 5 5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatBadgeStatus(status: BadgeRecord['status']) {
  return BADGE_STATUS_LABEL[status];
}

type PopoverAnchor = {
  // position relative to the card the badge lives in
  top: number;
  left: number;
  below: boolean; // true => bubble sits below the circle (tail points up)
};

export default function BadgeWalletPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const signOut = useSignOut();
  const { data: studentData } = useStudentData(user?.primaryEmailAddress?.emailAddress);

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [activeBadgeId, setActiveBadgeId] = useState<string | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<PopoverAnchor | null>(null);
  const [qrBadge, setQrBadge] = useState<BadgeRecord | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const initialOpenSection = useMemo<BadgeStatus | null>(
    () => SECTION_CONFIG.find((section) => !section.collapsedByDefault)?.status ?? null,
    []
  );
  // openSection drives expand/collapse (badge grid + chevron + aria-expanded)
  const [openSection, setOpenSection] = useState<BadgeStatus | null>(initialOpenSection);
  // frontSection drives which card sits at the front of the z-stack
  const [frontSection, setFrontSection] = useState<BadgeStatus | null>(initialOpenSection);

  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn && !isSigningOut) router.replace('/sign-in');
  }, [isLoaded, isSignedIn, isSigningOut, router]);

  useEffect(() => {
    if (!activeBadgeId) return;

    const handleClickAway = (event: MouseEvent) => {
      if (!popoverRef.current) {
        setActiveBadgeId(null);
        return;
      }
      if (event.target instanceof Node && popoverRef.current.contains(event.target)) {
        return;
      }
      setActiveBadgeId(null);
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveBadgeId(null);
    };

    window.addEventListener('mousedown', handleClickAway);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClickAway);
      window.removeEventListener('keydown', handleKey);
    };
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
        inReview: studentData?.badges?.inReview ?? [],
        learning: studentData?.badges?.learning ?? [],
        locked: studentData?.badges?.locked ?? [],
      }) satisfies Record<BadgeStatus, BadgeRecord[]>,
    [studentData]
  );

  const allBadges: BadgeRecord[] = useMemo(
    () => [
      ...badgesByStatus.completed,
      ...badgesByStatus.assessment,
      ...badgesByStatus.inReview,
      ...badgesByStatus.learning,
      ...badgesByStatus.locked,
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

  // Credit-card-wallet behaviour: clicking a card raises it to the front AND
  // opens its badge grid (chevron rotates down). The chevron still toggles closed.
  const handleCardActivate = (status: BadgeStatus) => {
    setFrontSection(status);
    setOpenSection(status);
    setActiveBadgeId(null);
  };

  // Toggle expand/collapse AND bring the card to the front.
  const handleToggleExpand = (status: BadgeStatus) => {
    setFrontSection(status);
    setOpenSection((prev) => (prev === status ? null : status));
    setActiveBadgeId(null);
  };

  const studentEmail = studentData?.student?.email || user?.primaryEmailAddress?.emailAddress || null;

  const reviewFeedback = (badge: BadgeRecord) => {
    setActiveBadgeId(null);
    const courseParam = badge.courseId ? `?courseId=${encodeURIComponent(badge.courseId)}` : '';
    router.push(`/badges/${badge.slug}/feedback${courseParam}`);
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

  // Compute popover anchor relative to the badge's card container.
  const openBadgePopover = (badge: BadgeRecord, buttonEl: HTMLButtonElement) => {
    const card = buttonEl.closest(`.${styles.walletSection}`) as HTMLElement | null;
    const cardRect = card?.getBoundingClientRect();
    const btnRect = buttonEl.getBoundingClientRect();
    const cardLeft = cardRect?.left ?? 0;
    const cardTop = cardRect?.top ?? 0;
    const circleCenterX = btnRect.left - cardLeft + btnRect.width / 2;
    const circleTop = btnRect.top - cardTop;
    const circleBottom = circleTop + btnRect.height;
    // Flip below the circle if there isn't enough room above for the bubble.
    const estimatedBubbleHeight = 320;
    const below = circleTop < estimatedBubbleHeight;
    setPopoverAnchor({
      top: below ? circleBottom : circleTop,
      left: circleCenterX,
      below,
    });
    setActiveBadgeId(badge.id);
  };

  const renderBadgeTokens = (badges: BadgeRecord[], status: BadgeStatus) => {
    if (!badges.length) {
      return <div className={styles.emptyState}>No badges in this section yet.</div>;
    }
    const tokenVariant = status === 'completed' ? styles.badgeTokenWhite : styles.badgeTokenBlue;
    const realBadges = badges.map((badge) => {
      const isActive = activeBadgeId === badge.id;
      const tokenClassName = [styles.badgeToken, tokenVariant, isActive ? styles.badgeTokenActive : '']
        .filter(Boolean)
        .join(' ');

      return (
        <button
          type="button"
          key={badge.id}
          className={tokenClassName}
          onClick={(e) => openBadgePopover(badge, e.currentTarget)}
          aria-pressed={isActive}
        >
          <span className={styles.srOnly}>{badge.name.replace(/ Badge$/i, '')}</span>
          {badge.youtubeUrl ? (
            <YoutubeThumbnail videoUrl={badge.youtubeUrl} alt="" className={styles.badgeTokenImage} />
          ) : (
            <div
              className={styles.badgeTokenImage}
              style={{ width: '100%', height: '100%', background: 'currentColor' }}
            />
          )}
        </button>
      );
    });

    // Pure-CSS empty-slot placeholders to fill out the last row (never buttons).
    const perRow = 3;
    const remainder = badges.length % perRow;
    const emptyCount = remainder === 0 ? 0 : perRow - remainder;
    const emptySlots = Array.from({ length: emptyCount }, (_, i) => (
      <span key={`empty-${i}`} aria-hidden="true" className={styles.emptySlot} />
    ));

    return [...realBadges, ...emptySlots];
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
              const isFront = frontSection === section.status;

              // Selected card sits on top; z decreases with distance on BOTH sides
              // so the stack cascades outward from the selected card (… n-1, n, n+1 …).
              const frontIndex = SECTION_CONFIG.findIndex((s) => s.status === frontSection);
              const zIndex = SECTION_CONFIG.length - Math.abs(index - (frontIndex < 0 ? index : frontIndex));

              const sectionClassName = [
                styles.walletSection,
                !isExpanded ? styles.walletSectionCollapsed : '',
                isFront ? styles.walletSectionFront : styles.walletSectionResting,
                index === 0 ? styles.walletSectionFirst : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <section
                  key={section.status}
                  className={sectionClassName}
                  style={{ zIndex }}
                  data-open={isExpanded ? 'true' : 'false'}
                  data-front={isFront ? 'true' : 'false'}
                  onClick={(event) => {
                    // Bring the card to front when clicking the card chrome
                    // (not a badge circle, the chevron, or the popover itself).
                    const target = event.target as HTMLElement;
                    if (
                      target.closest(`.${styles.badgeToken}`) ||
                      target.closest(`.${styles.toggleButton}`) ||
                      target.closest(`.${styles.badgePopover}`)
                    ) {
                      return;
                    }
                    // Raise + open on any card-chrome click (reopens a front card
                    // the user had collapsed via the chevron).
                    handleCardActivate(section.status);
                  }}
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
                      onClick={() => handleToggleExpand(section.status)}
                      aria-expanded={isExpanded}
                      aria-controls={`${section.status}-badges`}
                      aria-label={isExpanded ? 'Collapse section' : 'Expand section'}
                    >
                      <ChevronIcon />
                    </button>
                  </div>

                  <div
                    id={`${section.status}-badges`}
                    className={[styles.badgeGrid, isExpanded ? styles.badgeGridVisible : styles.badgeGridHidden]
                      .filter(Boolean)
                      .join(' ')}
                    aria-hidden={!isExpanded}
                  >
                    {renderBadgeTokens(badges, section.status)}
                  </div>

                  {/* Anchored speech-bubble popover lives inside the badge's card */}
                  {activeBadge && badges.some((b) => b.id === activeBadge.id) && popoverAnchor ? (
                    <div
                      ref={popoverRef}
                      className={[styles.badgePopover, popoverAnchor.below ? styles.badgePopoverBelow : '']
                        .filter(Boolean)
                        .join(' ')}
                      role="dialog"
                      aria-modal="false"
                      aria-label={`${activeBadge.name} details`}
                      style={{
                        top: popoverAnchor.top,
                        left: popoverAnchor.left,
                      }}
                    >
                      <button
                        type="button"
                        className={styles.modalClose}
                        onClick={() => setActiveBadgeId(null)}
                        aria-label="Close"
                      >
                        ×
                      </button>
                      <h3>{activeBadge.name}</h3>
                      <div className={styles.popoverStatus}>
                        <span className={styles.badgeStatus}>Status: </span>
                        <span>{formatBadgeStatus(activeBadge.status)}</span>
                      </div>
                      <p>{activeBadge.description}</p>

                      {activeBadge.status === 'READY_FOR_ASSESSMENT' && (
                        <p className={styles.popoverHelperText}>
                          Show your assessor this QR code during the in-person skill check.
                        </p>
                      )}
                      {activeBadge.status === 'IN_REVIEW' && activeBadge.latestAttemptPassed === true && (
                        <p className={styles.popoverHelperText}>
                          You passed! Review your assessment, then finalize this badge to add it to your completed list.
                        </p>
                      )}
                      {activeBadge.status === 'IN_REVIEW' && activeBadge.latestAttemptPassed !== true && (
                        <p className={styles.popoverHelperText}>
                          Review your assessor&apos;s feedback to unlock your next attempt.
                        </p>
                      )}
                      {activeBadge.status === 'LEARNING' && (
                        <p className={styles.popoverHelperText}>
                          Keep working through lesson checkpoints to unlock your assessment.
                        </p>
                      )}
                      {activeBadge.status === 'LOCKED' && (
                        <p className={styles.popoverHelperText}>
                          You&apos;ve used every assessment attempt for this badge. Review your feedback to see where to
                          improve.
                        </p>
                      )}
                      {activeBadge.status === 'COMPLETED' && (
                        <p className={styles.popoverHelperText}>Badge finalized. Great work!</p>
                      )}

                      <div className={styles.popoverActions}>
                        {activeBadge.status === 'READY_FOR_ASSESSMENT' && (
                          <>
                            <button
                              type="button"
                              className={styles.popoverActionPrimary}
                              onClick={() => setQrBadge(activeBadge)}
                            >
                              Show Code
                            </button>
                            <button
                              type="button"
                              className={styles.popoverActionLink}
                              onClick={() => reviewFeedback(activeBadge)}
                            >
                              Review Skill
                            </button>
                          </>
                        )}

                        {activeBadge.status === 'IN_REVIEW' && activeBadge.latestAttemptPassed === true && (
                          <button
                            type="button"
                            className={styles.popoverActionPrimary}
                            onClick={() => reviewFeedback(activeBadge)}
                          >
                            Review &amp; Finalize
                          </button>
                        )}

                        {activeBadge.status === 'IN_REVIEW' && activeBadge.latestAttemptPassed !== true && (
                          <button
                            type="button"
                            className={styles.popoverActionPrimary}
                            onClick={() => reviewFeedback(activeBadge)}
                          >
                            Review Feedback
                          </button>
                        )}

                        {activeBadge.status === 'LOCKED' && (
                          <button
                            type="button"
                            className={styles.popoverActionPrimary}
                            onClick={() => reviewFeedback(activeBadge)}
                          >
                            Review Feedback
                          </button>
                        )}

                        {activeBadge.status === 'COMPLETED' && (
                          <>
                            <button
                              type="button"
                              className={styles.popoverActionPrimary}
                              onClick={() => exportBadgeToLinkedIn(activeBadge)}
                              disabled={isExporting}
                            >
                              {isExporting ? 'Preparing LinkedIn package…' : 'Export to LinkedIn'}
                            </button>
                            <button
                              type="button"
                              className={styles.popoverActionLink}
                              onClick={() => reviewFeedback(activeBadge)}
                            >
                              Review Feedback
                            </button>
                          </>
                        )}
                      </div>

                      {activeBadge.status === 'COMPLETED' && exportStatus ? (
                        <p className={styles.popoverHelperText}>{exportStatus}</p>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>

          {qrBadge ? (
            <AssessmentCodeModal
              badgeId={qrBadge.id}
              badgeName={qrBadge.name}
              courseId={qrBadge.courseId ?? studentData?.course?.id}
              studentId={studentData?.student.id}
              onClose={() => setQrBadge(null)}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
