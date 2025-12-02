'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Image, { type StaticImageData } from 'next/image';
import checkedLogo from '../assets/checked_logo.png';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from './hooks/useAuth';
import { useStudentData, type LessonRecord } from './hooks/useStudentData';
import styles from './page.module.css';
import surveyAlarmXIcon from '../assets/survey_alarm/survey_alarm_x_icon.png';
import veryUnhappy from '../assets/survey_faces/very_unhappy.png';
import slightlyUnhappy from '../assets/survey_faces/slightly_unhappy.png';
import neutral from '../assets/survey_faces/neutral.png';
import slightlyHappy from '../assets/survey_faces/slightly_happy.png';
import veryHappy from '../assets/survey_faces/very_happy.png';

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
    href: `/lessons/${record.slug}${record.status === 'IN_PROGRESS' ? '?resume=1' : ''}`,
  };
}

function getFaceFilter(value: number, isSelected: boolean): string {
  // Selected state → everything should look lime-ish (#C9DB50)
  if (isSelected) {
    // turn blue to lime; for the lime icon this is a small tweak
    return 'hue-rotate(-140deg) saturate(130%) brightness(1.05)';
  }

  // Default state:
  // faces 1,2,3,5 are already brand blue; do nothing
  if (value !== 4) {
    return 'none';
  }

  // Face 4 (slightly_happy) source is lime; shift it to blue for default
  return 'hue-rotate(140deg) saturate(110%) brightness(0.95)';
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn, user, signOut } = useAuth();
  const { data: studentData, isLoading, refresh } = useStudentData(user?.email);
  const pathname = usePathname();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [activeSurvey, setActiveSurvey] = useState<{
    promptId: string;
    badgeId: string;
    badgeSlug: string | null;
    badgeName: string | null;
    question: string;
  } | null>(null);
  const [surveyRating, setSurveyRating] = useState(3);

  const FACE_IMAGES: Record<number, StaticImageData> = {
    1: veryUnhappy,
    2: slightlyUnhappy,
    3: neutral,
    4: slightlyHappy,
    5: veryHappy,
  };

  const FACE_ALTS: Record<number, string> = {
    1: 'Very unhappy',
    2: 'Slightly unhappy',
    3: 'Neutral',
    4: 'Slightly happy',
    5: 'Very happy',
  };

  const displayName = studentData?.student?.name || user?.name || 'Student';
  const pendingSurveyBadges = useMemo(() => studentData?.surveys?.pendingBadge ?? [], [studentData]);

  useEffect(() => {
    const slug = searchParams.get('surveyBadge');
    if (!slug) {
      return;
    }
    const match = pendingSurveyBadges.find((entry) => entry.badgeSlug === slug) ?? pendingSurveyBadges[0] ?? null;
    if (match) {
      setActiveSurvey(match);
      setSurveyRating(3);
    }
  }, [pendingSurveyBadges, searchParams]);

  useEffect(() => {
    if (pendingSurveyBadges.length === 0) {
      setActiveSurvey(null);
    }
  }, [pendingSurveyBadges]);

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

  const closeSurveyModal = useCallback(() => {
    setActiveSurvey(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('surveyBadge');
    const nextPath = params.size ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextPath, { scroll: false });
  }, [pathname, router, searchParams]);

  const handleStartSurvey = useCallback(
    (target?: {
      promptId: string;
      badgeId: string;
      badgeSlug: string | null;
      badgeName: string | null;
      question: string;
    }) => {
      const surveyTarget = target ?? pendingSurveyBadges[0];
      if (!surveyTarget) {
        return;
      }

      setActiveSurvey(surveyTarget);
      setSurveyRating(3);

      const params = new URLSearchParams(searchParams.toString());
      if (surveyTarget.badgeSlug) {
        params.set('surveyBadge', surveyTarget.badgeSlug);
      }
      const nextPath = `${pathname}?${params.toString()}`;
      router.replace(nextPath, { scroll: false });
    },
    [pendingSurveyBadges, pathname, router, searchParams]
  );

  const handleSubmitSurvey = useCallback(async () => {
    if (!activeSurvey || !studentData?.student.email) {
      return;
    }

    try {
      const response = await fetch(`/api/badges/${activeSurvey.badgeId}/survey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: studentData.student.email, rating: surveyRating }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit survey');
      }

      await refresh();
      closeSurveyModal();
    } catch (error) {
      console.error('Failed to submit survey', error);
    }
  }, [activeSurvey, surveyRating, studentData, refresh, closeSurveyModal]);

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

        {/* ⭐ new wrapper for text block */}
        <div className={styles.cardTextBlock}>
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
    <div className={`page ${styles.page}`}>
      <aside className={`sidebar ${styles.sidebar}`}>
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

      <main className={`main ${styles.main}`}>
        <div className={styles.topRow}>
          <div className={styles.alertWrapper}>
            <div
              className={styles.alert}
              data-active={pendingSurveyBadges.length > 0}
              onClick={pendingSurveyBadges.length > 0 ? () => handleStartSurvey() : undefined}
            >
              {pendingSurveyBadges.length > 0 ? (
                <>
                  <Image src={surveyAlarmXIcon} alt="Survey reminder" className={styles.alertIcon} />
                  <span className={styles.alertText}>
                    Complete feedback survey to finalize this badge. You can find the survey under “Ready to be
                    Finalized” in your Badge Wallet
                  </span>
                </>
              ) : (
                <span className={styles.alertText}>Welcome back!</span>
              )}
            </div>
          </div>

          <div className={styles.brandMark}>
            <Image src={checkedLogo} alt="checkd logo" className={styles.brandLogo} width={80} height={24} />
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

      {activeSurvey ? (
        <div className={styles.surveyOverlay} role="dialog" aria-modal="true">
          <div className={styles.surveyModal}>
            <button type="button" className={styles.surveyClose} onClick={closeSurveyModal}>
              Do this later
            </button>
            <h2 className={styles.surveyTitle}>Tell us about your experience.</h2>
            <p className={styles.surveyQuestion}>{activeSurvey.question}</p>
            <div className={styles.surveyFaces}>
              {[1, 2, 3, 4, 5].map((value) => {
                const isSelected = surveyRating === value;
                const buttonClass = [styles.surveyFace, isSelected ? styles.surveyFaceSelected : '']
                  .filter(Boolean)
                  .join(' ');

                return (
                  <button
                    key={value}
                    type="button"
                    className={buttonClass}
                    onClick={() => setSurveyRating(value)}
                    aria-pressed={isSelected}
                  >
                    <Image
                      src={FACE_IMAGES[value]}
                      alt={FACE_ALTS[value]}
                      className={styles.surveyFaceImage}
                      style={{ filter: getFaceFilter(value, isSelected) }} // ⭐ only ONE filter
                    />
                  </button>
                );
              })}
            </div>

            <button type="button" className={styles.surveySubmit} onClick={handleSubmitSurvey}>
              Submit
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageContent />
    </Suspense>
  );
}
