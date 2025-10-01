'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './hooks/useAuth';
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

const upNextLessons: LessonCard[] = [
  {
    id: 'bunsen-burners-1',
    title: 'Bunsen Burners',
    status: 'Not started',
    meta: 'Due: XX/XX/XXXX XX:XXpm',
    actionLabel: 'Start',
    variant: 'start',
    image:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAZAAAAGQCAYAAABit0H5AAAACXBIWXMAAAsTAAALEwEAmpwYAAAF5ElEQVR4nO3cQW6bMBRAUT5t//9nnuJlsqS2HApRtf7CfJbFg4lQz+xX86IRERERERERERERGRP4gGrA7jw2cfZsv3xQNAOV6A3SxPg+wJprbV8MgRwBr4FUwPobnYz1UBBqefgdgPgC66P4U9AFbA+jJ0BjWZ/AVeAEObwfsBx8C3sB9gBnQ9V9gCtwPuwFjYOfgNrHg78Be0PhPwHp0NXfYAt8D6sBc2Dn4DSw4O/AXtD4T8BqdDV32ALfA+rAXNg5+A0sODvwF7Q+E/AanQ1d9gC3wPqwFzYOfgNLDg78Be0PhPwGp0NXfYAt8D6sBc2Dn4DSw4O/AXtD4T8BqdDV32ALfA+rAXNg5+A0sODvwF7Q+E/AanQ1d9gC3wPqwFzYOfgNLDg78Be0PhPwGp0NXfYAt8D6sBc2Dn4DSw4O/AXtD4T8BqdDV32ALfA+rAXNg5+A0sODvwF7Q+E/AanQ1d9gC3wPqwFzYOfgNLDg78Be0PhPwGp0NXfYAt8D6sBc2Dn4DSw4O/AXtD4T8BqdDV32ALfA+rAXNg5+A0sODvwF7Q+E/AanQ1d9gC3wPqwFzYOfgNLDg78Be0PhPwGp0NXfYDtwK3wHzYGfgPLA6N8A6sNzM0aW90U/K6EFe87Qp9e3t54J/3ORERERERERERERkd/5ALAeGdKyv4AAAAASUVORK5CYII=',
    href: '/lessons/bunsen-burners',
  },
  {
    id: 'bunsen-burners-2',
    title: 'Bunsen Burners',
    status: 'Not started',
    meta: 'Due: XX/XX/XXXX XX:XXpm',
    actionLabel: 'Start',
    variant: 'start',
    href: '/lessons/bunsen-burners',
  },
  {
    id: 'bunsen-burners-3',
    title: 'Bunsen Burners',
    status: 'Not started',
    meta: 'Due: XX/XX/XXXX XX:XXpm',
    actionLabel: 'Start',
    variant: 'start',
    href: '/lessons/bunsen-burners',
  },
];

const continueLessons: LessonCard[] = [
  {
    id: 'bunsen-burners-progress',
    title: 'Bunsen Burners',
    status: '75% of lesson, 20 minutes remaining',
    meta: '5 out of 8 questions answered',
    actionLabel: 'Continue',
    variant: 'continue',
    href: '/lessons/bunsen-burners',
  },
  {
    id: 'waste-handling-progress',
    title: 'Waste Handling',
    status: '75% of lesson, 20 minutes remaining',
    meta: '5 out of 8 questions answered',
    actionLabel: 'Continue',
    variant: 'continue',
    href: '/lessons/bunsen-burners',
  },
  {
    id: 'vent-hood-safety-progress',
    title: 'Vent Hood Safety',
    status: '75% of lesson, 20 minutes remaining',
    meta: '5 out of 8 questions answered',
    actionLabel: 'Continue',
    variant: 'continue',
    href: '/lessons/bunsen-burners',
  },
];

function initialsFromName(name?: string | null) {
  if (!name) {
    return 'ST';
  }
  const parts = name.trim().split(/\s+/);
  const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase());
  return initials.join('') || 'ST';
}

export default function HomePage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user, signOut } = useAuth();
  const pathname = usePathname();
  const [isSigningOut, setIsSigningOut] = useState(false);

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

  const displayName = user?.name || 'Lastname, Student';

  const renderCard = (lesson: LessonCard) => {
    const buttonClass =
      lesson.variant === 'continue' ? `${styles.cardButton} ${styles.secondaryAction}` : styles.cardButton;

    return (
      <div key={lesson.id} className={styles.card}>
        <div className={styles.cardMedia}>
          {lesson.image ? (
            <Image src={lesson.image} alt="Lesson preview" width={320} height={200} className={styles.cardMediaImage} />
          ) : (
            <span>Lesson preview</span>
          )}
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
          <div className={styles.brandMark}>checkd.</div>
        </div>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Up next</h2>
          <div className={styles.cardRow}>{upNextLessons.map(renderCard)}</div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Pick up where you left off</h2>
          <div className={styles.cardRow}>{continueLessons.map(renderCard)}</div>
        </section>
      </main>
    </div>
  );
}
