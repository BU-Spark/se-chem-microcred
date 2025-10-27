'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';
import { useStudentData } from '../../hooks/useStudentData';
import styles from './page.module.css';

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
  const { data: studentData, isLoading } = useStudentData(user?.email);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  const lessonRecord = studentData?.lessons.catalog.find((entry) => entry.slug === params.lessonId);
  const displayName = studentData?.student.name || user?.name || 'Student Demo';

  const timelineItems =
    lessonRecord?.segments.map((segment, index) => {
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
    }) ?? [];
  const lessonTitle = lessonRecord?.title ?? (isLoading ? 'Loading lesson…' : 'Lesson unavailable');

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

        <h1 className={styles.lessonTitle}>{lessonTitle}</h1>

        {lessonRecord ? (
          <>
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
          </>
        ) : (
          <section className={styles.section}>
            <p className={styles.paragraph}>
              {isLoading
                ? 'Loading lesson details…'
                : 'We could not find a lesson that matches this page. Please head back to the lesson list.'}
            </p>
            {!isLoading && (
              <Link href="/" className={styles.primaryButton}>
                Browse Lessons
              </Link>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
