'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { useStudentData, type BadgeRecord } from '../hooks/useStudentData';
import styles from './page.module.css';
import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';
import { useRouter } from 'next/navigation';

type ProgressItem = {
  id: string;
  value: string;
  label: string;
  icon: ReactNode;
  iconClassName: string;
};

type ScoreItem = {
  id: string;
  value: number;
  label: string;
};

function BadgeCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor">
      <path
        d="M12 3.5 6.8 5.6A1 1 0 0 0 6 6.5v5.95a6 6 0 0 0 4.11 5.7l1.7.55 1.77-.56a6 6 0 0 0 4.12-5.7V6.5a1 1 0 0 0-.8-.97L12 3.5Z"
        strokeLinejoin="round"
      />
      <path d="m9.5 12 2 2.1 3.3-3.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor">
      <rect x="5.5" y="4.8" width="13" height="15" rx="1.6" />
      <path d="M9.5 4.8V3.6h5v1.2" strokeLinecap="round" />
      <path d="M9.5 10.2h5" strokeLinecap="round" />
      <path d="M9.5 13.6h5" strokeLinecap="round" />
    </svg>
  );
}

function CrossBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor">
      <circle cx="12" cy="12" r="9.2" />
      <path d="m9.1 9.1 5.8 5.8M14.9 9.1l-5.8 5.8" strokeLinecap="round" />
    </svg>
  );
}

function BadgeSummaryDial({ completed, available }: { completed: number; available: number }) {
  // Two stroked SVG arcs (lime = completed, red = available) with rounded caps and
  // a small gap between segments, matching the Figma badge-summary donut. A
  // conic-gradient can't produce rounded caps or inter-segment gaps, so we draw arcs.
  const SIZE = 220;
  const STROKE = 18;
  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = SIZE / 2;
  const GAP = 12; // px of arc kept blank on each side of a segment
  const completedLen = Math.max(0, (Math.min(100, Math.max(0, completed)) / 100) * circumference - GAP);
  const availableLen = Math.max(0, (Math.min(100, Math.max(0, available)) / 100) * circumference - GAP);

  return (
    <svg
      className={styles.badgeDial}
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={`Badges completed ${completed}%, badges available ${available}%`}
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        strokeWidth={STROKE}
        strokeLinecap="round"
        style={{ stroke: 'var(--c-lime)' }}
        strokeDasharray={`${completedLen} ${circumference - completedLen}`}
        transform={`rotate(-90 ${center} ${center})`}
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        strokeWidth={STROKE}
        strokeLinecap="round"
        style={{ stroke: 'var(--c-red)' }}
        strokeDasharray={`${availableLen} ${circumference - availableLen}`}
        strokeDashoffset={-(completedLen + GAP)}
        transform={`rotate(-90 ${center} ${center})`}
      />
      {/* Centered check mark */}
      <path
        d="M84 112l16 18 36-44"
        fill="none"
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ stroke: 'var(--c-lime)' }}
      />
    </svg>
  );
}

function CircularScore({ value, label }: ScoreItem) {
  const radius = 60;
  const strokeWidth = 12;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = useMemo(() => circumference - (value / 100) * circumference, [circumference, value]);

  return (
    <div className={styles.scoreCard}>
      <div className={styles.circularStat}>
        <svg width={radius * 2} height={radius * 2}>
          <circle
            className={styles.circularTrack}
            cx={radius}
            cy={radius}
            r={normalizedRadius}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <circle
            className={styles.circularProgress}
            cx={radius}
            cy={radius}
            r={normalizedRadius}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            transform={`rotate(-90 ${radius} ${radius})`}
          />
        </svg>
        <div className={styles.circularStatValue}>
          <span className={styles.circularStatNumber}>{value}</span>
          <span className={styles.circularStatPercent}>%</span>
        </div>
      </div>
      <div className={styles.scoreLabel}>{label}</div>
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();
  const { data: studentData } = useStudentData(user?.primaryEmailAddress?.emailAddress);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn && !isSigningOut) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, isSigningOut, router]);

  const displayName = studentData?.student.name || '';
  const totalBadges =
    (studentData?.badges.completed.length ?? 0) +
    (studentData?.badges.readyForAssessment.length ?? 0) +
    (studentData?.badges.learning.length ?? 0);
  const completedPercent =
    totalBadges > 0 ? Math.round(((studentData?.badges.completed.length ?? 0) / totalBadges) * 100) : 0;
  const availablePercent = Math.max(0, 100 - completedPercent);
  const analytics = studentData?.analytics;

  const { averageScorePercent, highestScorePercent, lowestScorePercent } = useMemo(() => {
    const completedBadges = studentData?.badges.completed ?? [];
    const scoredBadges = completedBadges.filter((badge) => typeof badge.score === 'number') as Array<
      Required<BadgeRecord>
    >;

    if (scoredBadges.length > 0) {
      const total = scoredBadges.reduce((sum, badge) => sum + (badge.score ?? 0), 0);
      const avg = Math.round(total / scoredBadges.length);
      const top = scoredBadges.reduce(
        (acc, badge) =>
          badge.score != null && badge.score > acc.score ? { score: badge.score, name: badge.name } : acc,
        { score: -Infinity, name: '' }
      );
      const bottom = scoredBadges.reduce(
        (acc, badge) =>
          badge.score != null && badge.score < acc.score ? { score: badge.score, name: badge.name } : acc,
        { score: Infinity, name: '' }
      );
      return {
        averageScorePercent: avg,
        highestScorePercent: Math.max(0, top.score),
        lowestScorePercent: Math.max(0, Math.min(100, bottom.score === Infinity ? 0 : bottom.score)),
      };
    }

    return {
      averageScorePercent: analytics?.averageAssessmentScore ?? 0,
      highestScorePercent: analytics?.highestAssessmentScore ?? 0,
      lowestScorePercent: 0,
    };
  }, [analytics, studentData?.badges.completed]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  const progressItems: ProgressItem[] = [
    {
      id: 'badges-completed',
      value: String(studentData?.badges.completed.length ?? 0),
      label: 'badges completed',
      icon: <BadgeCheckIcon />,
      iconClassName: `${styles.progressIcon} ${styles.iconLime}`,
    },
    {
      id: 'badges-reassess',
      value: String(studentData?.badges.readyForAssessment.length ?? analytics?.badgesReadyForAssessment ?? 0),
      label: 'badges ready to be reassessed',
      icon: <ClipboardIcon />,
      iconClassName: `${styles.progressIcon} ${styles.iconLime}`,
    },
    {
      id: 'badges-not-attempted',
      value: String(analytics?.badgesNotAttempted ?? 0),
      label: 'badges not yet attempted',
      icon: <CrossBadgeIcon />,
      iconClassName: `${styles.progressIcon} ${styles.iconLime}`,
    },
  ];

  const scoreItems: ScoreItem[] = [
    {
      id: 'avg-score',
      value: averageScorePercent,
      label: 'Average assessment score',
    },
    {
      id: 'highest-badge',
      value: highestScorePercent,
      label: 'Highest scoring badge',
    },
    {
      id: 'lowest-badge',
      value: lowestScorePercent,
      label: 'Lowest scoring badge',
    },
  ];

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/splash');
    } catch (error) {
      console.error('Failed to sign out', error);
      setIsSigningOut(false);
    }
  };

  return (
    <div className={`page ${styles.page}`}>
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={`main ${styles.main}`}>
        <header className={styles.headerRow}>
          <div className={styles.titleBlock}>
            <h1 className={styles.pageTitle}>Student&apos;s Analytics</h1>
            <p className={styles.pageSubtitle}>View your analytics and track learning progress.</p>
          </div>
        </header>

        <section className={styles.analyticsGrid}>
          <article className={`${styles.card} ${styles.progressCard}`}>
            <h2 className={`${styles.cardTitle} ${styles.progressTitle}`}>Student&apos;s Total Progress</h2>
            <div className={styles.progressList}>
              {progressItems.map((item) => (
                <div key={item.id} className={styles.progressItem}>
                  <div className={item.iconClassName}>{item.icon}</div>
                  <div className={styles.progressContent}>
                    <span className={styles.progressValue}>{item.value}</span>
                    <span className={styles.progressLabel}>{item.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.badgeSummary}>
              <h2 className={`${styles.cardTitle} ${styles.badgeSummaryTitle}`}>Student&apos;s Badge Summary</h2>

              <div className={styles.badgeTop}>
                <BadgeSummaryDial completed={completedPercent} available={availablePercent} />
                <div className={styles.badgeRows}>
                  <div className={styles.badgeRow}>
                    <div className={styles.badgeRowHead}>
                      <span className={styles.badgeLabel}>Badges Completed</span>
                      <span className={styles.badgePercentage}>{completedPercent}%</span>
                    </div>
                    <div className={styles.badgeBar}>
                      <div
                        className={`${styles.badgeFill} ${styles.badgeFillCompleted}`}
                        style={{ width: `${completedPercent}%` }}
                      />
                    </div>
                  </div>
                  <div className={styles.badgeRow}>
                    <div className={styles.badgeRowHead}>
                      <span className={styles.badgeLabel}>Badges Available</span>
                      <span className={styles.badgePercentage}>{availablePercent}%</span>
                    </div>
                    <div className={styles.badgeBar}>
                      <div
                        className={`${styles.badgeFill} ${styles.badgeFillAvailable}`}
                        style={{ width: `${availablePercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.badgeScoreDivider} />
              <div className={styles.badgeScoreRow}>
                {scoreItems.map((item) => (
                  <CircularScore key={item.id} {...item} />
                ))}
              </div>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
