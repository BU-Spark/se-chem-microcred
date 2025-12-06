'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useStudentData } from '../../hooks/useStudentData';
import styles from './page.module.css';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/profile', label: 'Profile' },
  { href: '/analytics', label: 'My Analytics' },
  { href: '/badges', label: 'Badge Wallet' },
  { href: '/grades', label: 'Grades' },
  { href: '/settings', label: 'Settings' },
];

function initialsFromName(name?: string | null) {
  if (!name) return 'ST';
  const parts = name.trim().split(/\s+/);
  return (
    parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || 'ST'
  );
}

export default function LessonDetailPage() {
  // ✅ Hooks are always called in the same order
  const router = useRouter();
  const params = useParams<{ lessonId: string }>();
  const pathname = usePathname();

  const { isLoaded, isSignedIn, user } = useUser();
  const { data: studentData, isLoading } = useStudentData(user?.primaryEmailAddress?.emailAddress ?? null);

  // Redirect only via effect (do not early-return before hooks finish)
  const signedOut = isLoaded && !isSignedIn;
  useEffect(() => {
    if (signedOut) router.replace('/sign-in');
  }, [signedOut, router]);

  const displayName = studentData?.student.name || user?.fullName || 'Student Demo';
  const lessonRecord = studentData?.lessons.catalog.find((e) => e.slug === params.lessonId);

  // Build timeline items from your existing data
  const timeline = useMemo(() => {
    if (!lessonRecord) return [];
    return lessonRecord.segments.map((seg, idx) => {
      const [firstCheckpointId] = seg.checkpointIds;
      const cp = lessonRecord.checkpoints.find((c) => c.id === firstCheckpointId);
      const minutes = seg.duration != null ? `${seg.duration} minute${seg.duration === 1 ? '' : 's'} long` : '';
      return {
        id: seg.id,
        title: seg.title || `Part ${idx + 1}`,
        duration: minutes || 'Segment duration TBD',
        cpLabel: cp?.label || 'Checkpoint',
        cpMeta: cp?.meta || `${cp?.questionCount ?? 0} questions`,
        img: seg.thumbnailUrl || lessonRecord.thumbnailUrl || '',
        partIndex: idx + 1,
      };
    });
  }, [lessonRecord]);

  // While auth is resolving or redirecting: render nothing (keeps hook order safe)
  if (!isLoaded || signedOut) return null;

  const title = lessonRecord?.title ?? (isLoading ? 'Loading lesson…' : 'Lesson unavailable');

  return (
    <div className="page">
      {/* ✅ pure global shell (no module .page) */}
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="profile">
          <div className="avatar">{initialsFromName(displayName)}</div>
          <div className="name">{displayName}</div>
        </div>

        <nav className="navList" aria-label="Main">
          {NAV.map((item) => {
            const active =
              item.href === '/' ? pathname.startsWith('/lessons') || pathname === '/' : pathname === item.href;
            const cls = `navItem${active ? ' navItemActive' : ''}`;
            return (
              <Link key={item.href} href={item.href} className={cls}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebarFooter">
          <button className="signOffButton" type="button" onClick={() => router.push('/sign-in')}>
            Sign off
          </button>
          <div className="brandFooter">checkd.</div>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <div className={styles.root}>
          <header className={styles.header}>
            <Link href="/" className={styles.backLink}>
              ← Back
            </Link>
            <div className="brandMark">checkd.</div>
          </header>

          <h1 className={styles.lessonTitle}>{title}</h1>

          {lessonRecord ? (
            <>
              <section className={styles.section}>
                <h2 className={styles.sectionHeading}>About this unit:</h2>
                <p className={styles.body}>{lessonRecord.description}</p>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionHeading}>Skills you’ll learn</h2>
                <ul className={styles.bullets}>
                  {lessonRecord.skills.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionHeading}>Lesson outline</h2>

                {/* Track: card → connector → card … then terminal */}
                <div className={styles.track}>
                  {timeline.map((item, idx) => (
                    <div key={item.id} className={styles.trackGroup}>
                      <div className={styles.card}>
                        <div className={styles.media}>
                          {item.img ? (
                            <Image src={item.img} alt={item.title} fill sizes="160px" className={styles.mediaImg} />
                          ) : (
                            <span className={styles.mediaPlaceholder}>Preview</span>
                          )}
                        </div>

                        <div className={styles.cardTitle}>{item.title}</div>
                        <div className={styles.cardMeta}>{item.duration}</div>
                        <div className={styles.cardFoot}>
                          <span>{item.cpLabel}</span>
                          <span className={styles.dot}>•</span>
                          <span>{item.cpMeta}</span>
                          <span className={styles.dot}>•</span>
                          <span>Part {item.partIndex}</span>
                        </div>
                      </div>

                      {/* connector to next */}
                      {idx < timeline.length - 1 && (
                        <div className={styles.connector} aria-hidden>
                          <span className={styles.node} />
                          <span className={styles.line} />
                          <span className={styles.node} />
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Terminal “Final check point” */}
                  {timeline.length > 0 && (
                    <div className={styles.terminal} aria-label="Final checkpoint">
                      <svg viewBox="0 0 48 48" className={styles.terminalIcon} aria-hidden="true">
                        <circle cx="24" cy="24" r="22" fill="white" />
                        <circle cx="24" cy="24" r="22" stroke="#3b82f6" strokeWidth="2" fill="none" />
                        <path
                          d="M16 25l6 6 10-12"
                          fill="none"
                          stroke="#22c55e"
                          strokeWidth="3.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <div className={styles.terminalLabel}>
                        <div>Final check point</div>
                        <div className={styles.terminalMeta}>3 questions</div>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <Link href={`/lessons/${lessonRecord.slug}/video`} className={styles.primaryButton}>
                Start Lesson
              </Link>
            </>
          ) : (
            <section className={styles.section}>
              <p className={styles.body}>
                {isLoading ? 'Loading lesson details…' : 'We could not find this lesson. Please head back to the list.'}
              </p>
              {!isLoading && (
                <Link href="/" className={styles.primaryButton}>
                  Browse Lessons
                </Link>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
