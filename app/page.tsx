'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import checkedLogo from '../assets/checked_logo.png';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './hooks/useAuth';
import { useStudentData, type LessonRecord } from './hooks/useStudentData';
import styles from './page.module.css';

interface LessonCard {
  id: string;
  title: string;
  status: string;
  meta: string;
  actionLabel: string;
  variant?: 'start' | 'continue';
  image?: string;
  href?: string;
}

const DEFAULT_LESSON_IMAGE = 'https://dummyimage.com/320x200/EBF2FF/1F5FAB&text=ChemSkills';

function initialsFromName(name?: string | null) {
  if (!name) {
    return 'ST';
  }
  const parts = name.trim().split(/\s+/);
  const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase());
  return initials.join('') || 'ST';
}

function formatDueDate(dueDate: string | null) {
  if (!dueDate) {
    return null;
  }
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function lessonRecordToCard(record: LessonRecord): LessonCard {
  const due = formatDueDate(record.dueDate);
  const metaParts: string[] = [];
  if (due) {
    metaParts.push(`Due: ${due}`);
  }
  if (record.estimatedMinutes) {
    metaParts.push(`${record.estimatedMinutes} min`);
  }

  return {
    id: record.id,
    title: record.title,
    status: record.status === 'IN_PROGRESS' ? `${Math.max(record.percentComplete, 1)}% complete` : 'Not started',
    meta: metaParts.join(' • ') || 'No due date',
    actionLabel: record.status === 'IN_PROGRESS' ? 'Continue' : 'Start',
    variant: record.status === 'IN_PROGRESS' ? 'continue' : 'start',
    image: record.thumbnailUrl ?? DEFAULT_LESSON_IMAGE,
    href: `/lessons/${record.slug}`,
  };
}

export default function HomePage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user, signOut } = useAuth();
  const { data: studentData, isLoading } = useStudentData(user?.email);
  const pathname = usePathname();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const displayName = studentData?.student.name || user?.name || 'Student';

  const upNextLessons = useMemo(() => {
    return studentData?.lessons.upNext.map(lessonRecordToCard) ?? [];
  }, [studentData]);

  const continueLessons = useMemo(() => {
    return studentData?.lessons.inProgress.map(lessonRecordToCard) ?? [];
  }, [studentData]);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

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

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  const renderCard = (lesson: LessonCard) => {
    const buttonClass =
      lesson.variant === 'continue' ? `${styles.cardButton} ${styles.secondaryAction}` : styles.cardButton;

    return (
      <div key={lesson.id} className={styles.card}>
        <div className={styles.cardMedia}>
          <Image
            src={lesson.image ?? DEFAULT_LESSON_IMAGE}
            alt="Lesson preview"
            width={320}
            height={200}
            className={styles.cardMediaImage}
          />
        </div>
        <div>
          <div className={styles.cardTitle}>{lesson.title}</div>
          <div className={styles.cardStatus}>{lesson.status}</div>
          <div className={styles.cardMeta}>{lesson.meta}</div>
        </div>
        {lesson.href ? (
          <Link href={lesson.href} className={buttonClass}>
            {lesson.actionLabel}
          </Link>
        ) : (
          <button type="button" className={buttonClass}>
            {lesson.actionLabel}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.profile}>
          <div className={styles.avatar}>{initialsFromName(displayName)}</div>
          <div className={styles.name}>{displayName}</div>
        </div>
        <nav className={styles.navList}>
          {[
            { label: 'Home', href: '/' },
            { label: 'Profile', href: '/profile' },
            { label: 'My Analytics', href: '/analytics' },
            { label: 'Badge Wallet', href: '/badges' },
            { label: 'Grades', href: '/grades' },
            { label: 'Settings', href: '/settings' },
          ].map((item) => {
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
          <div className={styles.brandFooter}>checkd.</div>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.topRow}>
          <div className={styles.alert}>
            <span>Alert INFO.</span>
          </div>
          <div className={styles.brandMark}>
            <Image src={checkedLogo} alt="checkd logo" width={80} height={24} />
          </div>
        </div>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Up next</h2>
          {isLoading ? (
            <div className={styles.emptyState}>Loading lessons…</div>
          ) : upNextLessons.length === 0 ? (
            <div className={styles.emptyState}>No lessons ready to start.</div>
          ) : (
            <div className={styles.cardRow}>{upNextLessons.map(renderCard)}</div>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Pick up where you left off</h2>
          {isLoading ? (
            <div className={styles.emptyState}>Loading your progress…</div>
          ) : continueLessons.length === 0 ? (
            <div className={styles.emptyState}>There are no in-progress lessons right now.</div>
          ) : (
            <div className={styles.cardRow}>{continueLessons.map(renderCard)}</div>
          )}
        </section>
      </main>
    </div>
  );
}
