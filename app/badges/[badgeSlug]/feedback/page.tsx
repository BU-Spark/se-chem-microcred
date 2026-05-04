'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import { useStudentData, type BadgeRecord } from '../../../hooks/useStudentData';
import styles from './page.module.css';

const NAV_ITEMS = [
  { label: 'Home', href: '/' },
  { label: 'Profile', href: '/profile' },
  { label: 'My Analytics', href: '/analytics' },
  { label: 'Badge Wallet', href: '/badges' },
  { label: 'Grades', href: '/grades' },
  { label: 'Settings', href: '/settings' },
];

const REVIEW_CONTENT: Record<
  string,
  {
    title: string;
    feedback: string;
    cooldown: { last: string; remaining: string; next: string };
    lessonSummary: string;
    checkpoints: Array<{
      title: string;
      subtitle: string;
      duration: string;
      image: string;
    }>;
    optional: Array<{
      title: string;
      duration: string;
      summary: string;
      image: string;
    }>;
  }
> = {
  'bunsen-burner-badge': {
    title: 'Bunsen Burner Badge',
    feedback:
      "Keep refining your flame control and ignition steps. Review your instructor's notes and rewatch the checkpoints below to prepare for your reassessment.",
    cooldown: {
      last: '03/08/2025',
      remaining: '3 days remaining',
      next: '03/15/2025',
    },
    lessonSummary:
      'Revisit each burner checkpoint, paying close attention to hose inspections and flame height adjustments. Focus on deliberate movements and verbal callouts.',
    checkpoints: [
      {
        title: 'Part 1',
        subtitle: 'Ignition & Setup',
        duration: '1.4 minutes',
        image: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=400&q=80',
      },
      {
        title: 'Part 2',
        subtitle: 'Flame Control',
        duration: '1.3 minutes',
        image: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=400&q=80',
      },
      {
        title: 'Part 3',
        subtitle: 'Shutdown & Storage',
        duration: '1.2 minutes',
        image: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=400&q=80',
      },
    ],
    optional: [
      {
        title: 'Advanced Flame Types',
        duration: '4 min',
        summary: 'Walk through oxidizing vs. reducing flames and how to set each one.',
        image: 'https://images.unsplash.com/photo-1470165229730-5bf5ce30f7b6?auto=format&fit=crop&w=400&q=80',
      },
      {
        title: 'Common Burner Mistakes',
        duration: '3 min',
        summary: 'Review avoidable lab errors spotted during assessments.',
        image: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=400&q=80',
      },
      {
        title: 'Instructor Walkthrough',
        duration: '5 min',
        summary: 'Watch a full burner demonstration narrated by the lab team.',
        image: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=400&q=80',
      },
    ],
  },
  'lab-notebook-badge': {
    title: 'Lab Notebook Badge',
    feedback:
      'Great start capturing your work. Tighten consistency on page numbering, dating entries, and summarizing objectives before each experiment.',
    cooldown: {
      last: '03/05/2025',
      remaining: 'Open for reassessment now',
      next: '03/12/2025',
    },
    lessonSummary:
      'Review the setup walkthrough and ensure every page is numbered, dated, and includes a clear objective and materials list. Keep handwriting readable and avoid blank spaces.',
    checkpoints: [
      {
        title: 'Part 1',
        subtitle: 'Notebook Setup',
        duration: '1.2 minutes',
        image: 'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=400&q=80',
      },
      {
        title: 'Part 2',
        subtitle: 'Page Numbering & Dates',
        duration: '1.0 minutes',
        image: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=400&q=80',
      },
      {
        title: 'Part 3',
        subtitle: 'Objectives & Materials',
        duration: '1.1 minutes',
        image: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=400&q=80',
      },
    ],
    optional: [
      {
        title: 'Example Pre-lab Entry',
        duration: '3 min',
        summary: 'See a complete pre-lab with objectives, hazards, and materials.',
        image: 'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?auto=format&fit=crop&w=400&q=80',
      },
      {
        title: 'Common Notebook Pitfalls',
        duration: '2 min',
        summary: 'Avoid gaps, illegible notes, and missing dates.',
        image: 'https://images.unsplash.com/photo-1504691342899-4d92b50853e1?auto=format&fit=crop&w=400&q=80',
      },
    ],
  },
};

const BADGE_STATUS_LABEL: Record<string, string> = {
  LEARNING: 'Still learning',
  READY_FOR_ASSESSMENT: 'Ready for assessment',
  READY_FOR_FINALIZATION: 'Ready to be finalized',
  COMPLETED: 'Completed',
};

function initialsFromName(name?: string | null) {
  if (!name) return 'ST';
  const parts = name.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export default function BadgeFeedbackPage() {
  const params = useParams<{ badgeSlug: string }>();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { data: studentData } = useStudentData(user?.primaryEmailAddress?.emailAddress);

  const allBadges = useMemo<BadgeRecord[]>(() => {
    if (!studentData) {
      return [];
    }
    return [
      ...studentData.badges.learning,
      ...studentData.badges.readyForAssessment,
      ...studentData.badges.readyForFinalization,
      ...studentData.badges.completed,
    ];
  }, [studentData]);

  const badge = allBadges.find((entry) => entry.slug === params.badgeSlug);
  const content = useMemo(() => {
    if (!badge) return null;
    const specific = REVIEW_CONTENT[params.badgeSlug];
    if (specific) return specific;
    return {
      title: badge.name,
      feedback: badge.description ?? 'We are still preparing detailed feedback for this badge.',
      cooldown: { last: 'N/A', remaining: 'Feedback pending', next: 'TBD' },
      lessonSummary:
        'We are preparing detailed review points for this badge. In the meantime, revisit your lesson checkpoints.',
      checkpoints: [],
      optional: [],
    };
  }, [badge, params.badgeSlug]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !studentData) {
      return;
    }

    if (!allBadges.some((entry) => entry.slug === params.badgeSlug)) {
      router.replace('/badges');
    }
  }, [allBadges, isLoaded, isSignedIn, params.badgeSlug, router, studentData]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  if (!badge) {
    return null;
  }

  const displayName = studentData?.student.name || user?.fullName || 'Student Demo';

  if (!content) {
    return (
      <div className="page">
        <aside className="sidebar">
          <div className={`${styles.sidebarProfile} profile`}>
            <div className={`${styles.sidebarAvatar} avatar`}>{initialsFromName(displayName)}</div>
            <div className={`${styles.sidebarName} name`}>{displayName}</div>
          </div>

          <nav className={`${styles.sidebarNavList} navList`} aria-label="Main">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || (item.href === '/badges' && pathname.startsWith('/badges'));
              const cls = `navItem${isActive ? ' navItemActive' : ''} ${styles.sidebarNavItem} ${
                isActive ? styles.sidebarNavItemActive : ''
              }`.trim();
              return (
                <Link key={item.href} href={item.href} className={cls}>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="sidebarFooter">
            <button
              type="button"
              className="signOffButton"
              onClick={() => {
                void signOut();
              }}
            >
              Sign off
            </button>
            <div className="brandFooter">checkd.</div>
          </div>
        </aside>

        <main className="main">
          <div className={styles.pageContent}>
            <div className={styles.headerRow}>
              <h1 className={styles.title}>{badge.name}</h1>
              <div className={styles.brandMark}>checkd.</div>
            </div>

            <div className={styles.badgeCard}>
              <h2>Feedback content not yet available</h2>
              <p>We&apos;re still preparing feedback for this badge. Please check back later.</p>
              <Link href="/badges" className={styles.modalActionPrimary}>
                Back to badges
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const lessonSlug = badge.requirements.find((req) => req.lessonSlug)?.lessonSlug;

  return (
    <div className="page">
      <aside className="sidebar">
        <div className={`${styles.sidebarProfile} profile`}>
          <div className={`${styles.sidebarAvatar} avatar`}>{initialsFromName(displayName)}</div>
          <div className={`${styles.sidebarName} name`}>{displayName}</div>
        </div>

        <nav className={`${styles.sidebarNavList} navList`} aria-label="Main">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href === '/badges' && pathname.startsWith('/badges'));
            const cls = `navItem${isActive ? ' navItemActive' : ''} ${styles.sidebarNavItem} ${
              isActive ? styles.sidebarNavItemActive : ''
            }`.trim();
            return (
              <Link key={item.href} href={item.href} className={cls}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebarFooter">
          <button
            type="button"
            className="signOffButton"
            onClick={() => {
              void signOut();
            }}
          >
            Sign off
          </button>
          <div className="brandFooter">checkd.</div>
        </div>
      </aside>

      <main className="main">
        <div className={styles.pageContent}>
          <div className={styles.headerRow}>
            <h1 className={styles.title}>{content.title}</h1>
            <div className={styles.brandMark}>checkd.</div>
          </div>

          <div className={styles.badgeCard}>
            <h2>
              Status: <span style={{ color: '#f3f27a' }}>{BADGE_STATUS_LABEL[badge.status] ?? 'Status'}</span>
            </h2>
            <p>{content.feedback}</p>
          </div>

          {badge.status === 'READY_FOR_ASSESSMENT' ? (
            <div className={styles.cooldown}>
              <h3>Cooldown</h3>
              <div className={styles.cooldownBar} />
              <div className={styles.cooldownMeta}>
                <div>
                  <div style={{ fontWeight: 600 }}>{content.cooldown.last}</div>
                  <div style={{ opacity: 0.7, fontSize: '0.9rem' }}>Last assessment</div>
                </div>
                <div style={{ textAlign: 'center' }}>{content.cooldown.remaining}</div>
                <div>
                  <div style={{ fontWeight: 600 }}>{content.cooldown.next}</div>
                  <div style={{ opacity: 0.7, fontSize: '0.9rem' }}>Next attempt window</div>
                </div>
              </div>
            </div>
          ) : null}

          <div className={styles.section}>
            <h3>Review</h3>
            <p>{content.lessonSummary}</p>
            <div className={styles.timeline}>
              {content.checkpoints.map((checkpoint) => (
                <div key={checkpoint.title} className={styles.timelineItem}>
                  <Image src={checkpoint.image} alt={checkpoint.title} width={320} height={180} />
                  <strong>{checkpoint.title}</strong>
                  <div>{checkpoint.subtitle}</div>
                  <div style={{ opacity: 0.75 }}>{checkpoint.duration}</div>
                </div>
              ))}
            </div>
            {lessonSlug ? (
              <Link href={`/lessons/${lessonSlug}`} className={styles.primaryButton}>
                Review Lesson
              </Link>
            ) : null}
          </div>

          <div className={styles.section}>
            <h3>Optional Learning</h3>
            <div className={styles.optionalGrid}>
              {content.optional.map((item) => (
                <div key={item.title} className={styles.optionalCard}>
                  <Image src={item.image} alt={item.title} width={320} height={180} />
                  <strong>{item.title}</strong>
                  <div style={{ opacity: 0.75 }}>{item.duration}</div>
                  <p style={{ opacity: 0.8 }}>{item.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
