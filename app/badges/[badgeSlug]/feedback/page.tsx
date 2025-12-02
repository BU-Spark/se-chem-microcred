'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../hooks/useAuth';
import { useStudentData } from '../../../hooks/useStudentData';
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
  const { isLoaded, isSignedIn, user } = useAuth();
  const router = useRouter();
  const { data: studentData } = useStudentData(user?.email);

  const allBadges = useMemo(() => {
    if (!studentData) {
      return [] as typeof studentData.badges.learning;
    }
    return [
      ...studentData.badges.learning,
      ...studentData.badges.readyForAssessment,
      ...studentData.badges.readyForFinalization,
      ...studentData.badges.completed,
    ];
  }, [studentData]);

  const badge = allBadges.find((entry) => entry.slug === params.badgeSlug);
  const content = REVIEW_CONTENT[params.badgeSlug] ?? REVIEW_CONTENT['bunsen-burner-badge'];

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

  const displayName = studentData?.student.name || user?.name || 'Student Demo';
  const lessonSlug = badge.requirements.find((req) => req.lessonSlug)?.lessonSlug;

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <aside className={styles.sidebar}>
          <div className={styles.profileCard}>
            <div className={styles.profileAvatar}>{initialsFromName(displayName)}</div>
            <div>
              <div style={{ fontWeight: 600 }}>{displayName}</div>
              <div style={{ opacity: 0.8 }}>Student</div>
            </div>
          </div>

          <nav className={styles.navList} aria-label="Main">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${item.href === '/badges' ? styles.navItemActive : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <section className={styles.content}>
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
        </section>
      </div>
    </div>
  );
}
