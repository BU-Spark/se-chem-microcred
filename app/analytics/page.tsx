'use client';

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import { useStudentData, type BadgeRecord } from '../hooks/useStudentData';
import styles from './page.module.css';

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

function initialsFromName(name?: string | null) {
  if (!name) {
    return 'ST';
  }
  const parts = name.trim().split(/\s+/);
  const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase());
  return initials.join('') || 'ST';
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor">
      <circle cx="12" cy="12" r="9.2" strokeLinecap="round" />
      <path d="M12 6.8v5l3.2 1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

function NotebookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor">
      <rect x="5.5" y="4" width="12.5" height="16" rx="1.6" />
      <path d="M9 4v16" />
      <path d="M9 8.4h5.4" strokeLinecap="round" />
      <path d="M9 11.8h5.4" strokeLinecap="round" />
      <path d="M9 15.2h4" strokeLinecap="round" />
    </svg>
  );
}

function LargeBadgeDialCheck() {
  return (
    <svg viewBox="0 0 64 64" fill="none" strokeWidth={4.2} stroke="currentColor">
      <path d="M21 33.5 29.6 42l13.8-15.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CircularScore({ value, label }: ScoreItem) {
  const radius = 60;
  const strokeWidth = 10;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = useMemo(() => circumference - (value / 100) * circumference, [circumference, value]);

  return (
    <div className={styles.scoreCard}>
      <div className={styles.circularStat}>
        <svg width={radius * 2} height={radius * 2}>
          <circle
            cx={radius}
            cy={radius}
            r={normalizedRadius}
            stroke="#e3e9f5"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <circle
            cx={radius}
            cy={radius}
            r={normalizedRadius}
            stroke="#1f5fab"
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            transform={`rotate(-90 ${radius} ${radius})`}
          />
        </svg>
        <div className={styles.circularStatValue}>{value}%</div>
      </div>
      <div className={styles.scoreLabel}>{label}</div>
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();
  const { data: studentData } = useStudentData(user?.primaryEmailAddress?.emailAddress);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  const displayName = studentData?.student.name || user?.fullName || 'Lastname, Student';
  const totalBadges =
    (studentData?.badges.completed.length ?? 0) +
    (studentData?.badges.readyForAssessment.length ?? 0) +
    (studentData?.badges.learning.length ?? 0);
  const completedPercent =
    totalBadges > 0 ? Math.round(((studentData?.badges.completed.length ?? 0) / totalBadges) * 100) : 0;
  const availablePercent = Math.max(0, 100 - completedPercent);
  const analytics = studentData?.analytics;

  const { averageScorePercent, highestScorePercent } = useMemo(() => {
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
      return {
        averageScorePercent: avg,
        highestScorePercent: Math.max(0, top.score),
      };
    }

    return {
      averageScorePercent: analytics?.averageAssessmentScore ?? 0,
      highestScorePercent: analytics?.highestAssessmentScore ?? 0,
    };
  }, [analytics, studentData?.badges.completed]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  const navItems = [
    { label: 'Home', href: '/' },
    { label: 'Profile', href: '/profile' },
    { label: 'My Analytics', href: '/analytics' },
    { label: 'Badge Wallet', href: '/badges' },
<<<<<<< HEAD
=======
    { label: 'My Badges', href: '/my_badges' },
>>>>>>> badge-creation
    { label: 'Grades', href: '/grades' },
    { label: 'Settings', href: '/settings' },
  ];

  const progressItems: ProgressItem[] = [
    {
      id: 'hours-learning',
      value: analytics ? String(analytics.hoursLearning) : '0',
      label: 'hours spent learning',
      icon: <ClockIcon />,
      iconClassName: `${styles.progressIcon} ${styles.iconPrimary}`,
    },
    {
      id: 'badges-completed',
      value: String(studentData?.badges.completed.length ?? 0),
      label: 'badges completed',
      icon: <BadgeCheckIcon />,
      iconClassName: `${styles.progressIcon} ${styles.iconSuccess}`,
    },
    {
      id: 'badges-reassess',
      value: String(studentData?.badges.readyForAssessment.length ?? analytics?.badgesReadyForAssessment ?? 0),
      label: 'badges ready to be reassessed',
      icon: <ClipboardIcon />,
      iconClassName: `${styles.progressIcon} ${styles.iconAccent}`,
    },
    {
      id: 'badges-not-attempted',
      value: String(analytics?.badgesNotAttempted ?? 0),
      label: 'badges not yet attempted',
      icon: <CrossBadgeIcon />,
      iconClassName: `${styles.progressIcon} ${styles.iconMuted}`,
    },
    {
      id: 'questions-answered',
      value: String(analytics?.questionsAnswered ?? 0),
      label: 'questions answered',
      icon: <NotebookIcon />,
      iconClassName: `${styles.progressIcon} ${styles.iconWarning}`,
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
      id: 'badges-completed-percent',
      value: completedPercent,
      label: 'Badge completion rate',
    },
  ];

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

  return (
    <div className={`page ${styles.page}`}>
      <aside className={`sidebar ${styles.sidebar}`}>
        <div className={styles.profile}>
          <div className={styles.avatar}>{initialsFromName(displayName)}</div>
          <div className={styles.name}>{displayName}</div>
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
        </div>
      </aside>

      <main className={`main ${styles.main}`}>
        <header className={styles.headerRow}>
          <div className={styles.titleBlock}>
            <h1 className={styles.pageTitle}>Student&apos;s Analytics</h1>
            <p className={styles.pageSubtitle}>View your analytics and track learning progress.</p>
          </div>
        </header>

        <section className={styles.analyticsGrid}>
          <article className={`${styles.card} ${styles.progressCard}`}>
            <h2 className={styles.cardTitle}>Student&apos;s Total Progress</h2>
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
              <div>
                <h2 className={styles.cardTitle}>Student&apos;s Badge Summary</h2>
              </div>
              <div
                className={styles.badgeDial}
                style={
                  {
                    // Using CSS variables keeps the conic gradient declarative in CSS.
                    '--completed': completedPercent,
                    '--available': availablePercent,
                  } as CSSProperties
                }
              >
                <LargeBadgeDialCheck />
              </div>
              <div className={styles.badgeRows}>
                <div className={styles.badgeRow}>
                  <span className={styles.badgeLabel}>Badges Completed</span>
                  <div className={styles.badgeBar}>
                    <div
                      className={`${styles.badgeFill} ${styles.badgeFillCompleted}`}
                      style={{ width: `${completedPercent}%` }}
                    />
                  </div>
                  <span className={styles.badgePercentage}>{completedPercent}%</span>
                </div>
                <div className={styles.badgeRow}>
                  <span className={styles.badgeLabel}>Badges Available</span>
                  <div className={styles.badgeBar}>
                    <div
                      className={`${styles.badgeFill} ${styles.badgeFillAvailable}`}
                      style={{ width: `${availablePercent}%` }}
                    />
                  </div>
                  <span className={styles.badgePercentage}>{availablePercent}%</span>
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
