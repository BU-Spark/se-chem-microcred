'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';
import { useStudentData, type LessonRecord } from '../../hooks/useStudentData';
import styles from './page.module.css';

export const FALLBACK_LESSON: LessonRecord = {
  id: 'sample-lesson',
  slug: 'sample-lesson',
  title: 'Sample Lesson',
  summary: 'Lesson summary unavailable.',
  description:
    'This is a placeholder lesson overview. Replace with real lesson copy when content is ready. Keep the sections below updated so students know what to expect.',
  thumbnailUrl:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAZAAAAGQCAYAAABit0H5AAAACXBIWXMAAAsTAAALEwEAmpwYAAAF5ElEQVR4nO3cQW6bMBRAUT5t//9nnuJlsqS2HApRtf7CfJbFg4lQz+xX86IRERERERERERERGRP4gGrA7jw2cfZsv3xQNAOV6A3SxPg+wJprbV8MgRwBr4FUwPobnYz1UBBqefgdgPgC66P4U9AFbA+jJ0BjWZ/AVeAEObwfsBx8C3sB9gBnQ9V9gCtwPuwFjYOfgNrHg78Be0PhPwHp0NXfYAt8D6sBc2Dn4DSw4O/AXtD4T8BqdDV32ALfA+rAXNg5+A0sODvwF7Q+E/AanQ1d9gC3wPqwFzYOfgNLDg78Be0PhPwGp0NXfYAt8D6sBc2Dn4DSw4O/AXtD4T8BqdDV32ALfA+rAXNg5+A0sODvwF7Q+E/AanQ1d9gC3wPqwFzYOfgNLDg78Be0PhPwGp0NXfYAt8D6sBc2Dn4DSw4O/AXtD4T8BqdDV32ALfA+rAXNg5+A0sODvwF7Q+E/AanQ1d9gC3wPqwFzYOfgNLDg78Be0PhPwGp0NXfYDtwK3wHzYGfgPLA6N8A6sNzM0aW90U/K6EFe87Qp9e3t54J/3ORERERERERERERkd/5ALAeGdKyv4AAAAASUVORK5CYII=',
  estimatedMinutes: 0,
  dueDate: null,
  sortOrder: 0,
  status: 'NOT_STARTED',
  percentComplete: 0,
  segments: [
    {
      id: 'segment-a',
      title: 'Segment A',
      summary: 'Segment overview goes here.',
      duration: 1,
      videoUrl: null,
      thumbnailUrl: null,
      status: 'NOT_STARTED',
      checkpointIds: [],
    },
  ],
  checkpoints: [
    {
      id: 'checkpoint-a',
      title: 'Checkpoint A',
      label: 'Checkpoint',
      meta: '2 questions',
      description: null,
      questionCount: 2,
      segmentId: null,
      questions: [],
    },
  ],
  skills: ['Outline the main objectives', 'Summarize prerequisite knowledge', 'Describe the assessment checkpoints'],
};

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/profile', label: 'Profile' },
  { href: '/analytics', label: 'My Analytics' },
  { href: '/badges', label: 'Badge Wallet' },
  { href: '/grades', label: 'Grades' },
  { href: '/settings', label: 'Settings' },
];

function initialsFromName(name?: string | null) {
  if (!name) {
    return 'ST';
  }
  const parts = name.trim().split(/\s+/);
  const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase());
  return initials.join('') || 'ST';
}

export default function LessonDetailPage() {
  const router = useRouter();
  const params = useParams<{ lessonId: string }>();
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useAuth();
  const { data: studentData } = useStudentData(user?.email);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  const lessonRecord = studentData?.lessons.catalog.find((entry) => entry.slug === params.lessonId) ?? FALLBACK_LESSON;
  const displayName = studentData?.student.name || user?.name || 'Student Demo';

  const timelineItems = lessonRecord.segments.map((segment, index) => {
    const [firstCheckpointId] = segment.checkpointIds;
    const checkpoint = lessonRecord.checkpoints.find((item) => item.id === firstCheckpointId);
    const minutes = segment.duration ? `${segment.duration} minute${segment.duration === 1 ? '' : 's'} long` : '';

    return {
      id: segment.id,
      title: segment.title || `Part ${index + 1}`,
      duration: minutes || 'Segment duration TBD',
      checkpointLabel: checkpoint?.label || 'Checkpoint',
      checkpointMeta: checkpoint?.meta || `${checkpoint?.questionCount ?? 0} questions`,
      image: segment.thumbnailUrl || lessonRecord.thumbnailUrl,
    };
  });

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.profile}>
          <div className={styles.avatar}>{initialsFromName(displayName)}</div>
          <div className={styles.name}>{displayName}</div>
        </div>
        <nav className={styles.navList}>
          {navLinks.map((link) => {
            const isActive =
              link.href === '/' ? pathname.startsWith('/lessons') || pathname === '/' : pathname === link.href;
            const className = `${styles.navItem} ${isActive ? styles.navItemActive : ''}`.trim();
            return (
              <Link key={link.href} href={link.href} className={className}>
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className={styles.brandFooter}>checkd.</div>
      </aside>

      <main className={styles.main}>
        <div className={styles.header}>
          <Link href="/" className={styles.backLink}>
            ← Back
          </Link>
          <div className={styles.brandMark}>checkd.</div>
        </div>

        <h1 className={styles.lessonTitle}>{lessonRecord.title}</h1>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>About this unit</h2>
          <p className={styles.paragraph}>{lessonRecord.description}</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Skills you’ll learn</h2>
          <ul className={styles.list}>
            {lessonRecord.skills.map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Lesson outline</div>
          <div className={styles.timeline}>
            {timelineItems.map((item, index) => (
              <div key={item.id} className={styles.timelineItem}>
                <div className={styles.timelineMedia}>
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt={item.title}
                      width={200}
                      height={120}
                      className={styles.timelineMediaImage}
                    />
                  ) : (
                    <span>Segment preview</span>
                  )}
                </div>
                <div className={styles.timelineHeading}>{item.title}</div>
                <div className={styles.timelineMeta}>{item.duration}</div>
                <div className={styles.timelineCheckpoints}>
                  <span>{item.checkpointLabel}</span>
                  <span>•</span>
                  <span>{item.checkpointMeta}</span>
                  <span>•</span>
                  <span>Part {index + 1}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <Link href={`/lessons/${lessonRecord.slug}/video`} className={styles.primaryButton}>
          Start Lesson
        </Link>
      </main>
    </div>
  );
}
