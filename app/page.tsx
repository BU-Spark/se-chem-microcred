'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import { useStudentData, type LessonRecord } from './hooks/useStudentData';
import styles from './page.module.css';
import veryUnhappy from '../public/assets/survey_faces/very_unhappy.svg';
import slightlyUnhappy from '../public/assets/survey_faces/slightly_unhappy.svg';
import neutral from '../public/assets/survey_faces/neutral.svg';
import slightlyHappy from '../public/assets/survey_faces/slightly_happy.svg';
import veryHappy from '../public/assets/survey_faces/very_happy.svg';
import veryUnhappySelected from '../public/assets/survey_faces/very_unhappy_selected.svg';
import slightlyUnhappySelected from '../public/assets/survey_faces/slightly_unhappy_selected.svg';
import neutralSelected from '../public/assets/survey_faces/neutral_selected.svg';
import slightlyHappySelected from '../public/assets/survey_faces/slightly_happy_selected.svg';
import veryHappySelected from '../public/assets/survey_faces/very_happy_selected.svg';
import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';

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

const FACE_IMAGES: Record<number, StaticImageData> = {
  1: veryUnhappy,
  2: slightlyUnhappy,
  3: neutral,
  4: slightlyHappy,
  5: veryHappy,
};

const FACE_IMAGES_SELECTED: Record<number, StaticImageData> = {
  1: veryUnhappySelected,
  2: slightlyUnhappySelected,
  3: neutralSelected,
  4: slightlyHappySelected,
  5: veryHappySelected,
};

const FACE_ALTS: Record<number, string> = {
  1: 'Very unhappy',
  2: 'Slightly unhappy',
  3: 'Neutral',
  4: 'Slightly happy',
  5: 'Very happy',
};

function formatDueDate(dueDate: string | null) {
  if (!dueDate) return null;
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function extractYouTubeId(url?: string | null) {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const u = new URL(trimmed);

    if (u.hostname.includes('youtu.be')) {
      const pathId = u.pathname.replace('/', '').trim();
      if (pathId.length === 11) return pathId;
    }

    const v = u.searchParams.get('v');
    if (v && v.length === 11) return v;

    const parts = u.pathname.split('/');
    const embedIndex = parts.indexOf('embed');
    if (embedIndex >= 0 && parts[embedIndex + 1]?.length === 11) {
      return parts[embedIndex + 1];
    }
  } catch {
    // ignore
  }

  const match = trimmed.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
  return match?.[1] ?? null;
}

function resolveLessonImage(record: LessonRecord) {
  const clean = (u?: string | null) => {
    if (!u) return null;
    const trimmed = u.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('/public/')) return trimmed.replace(/^\/public/, '');
    return trimmed;
  };

  const candidateUrls: (string | null | undefined)[] = [];

  if ('videoUrl' in record) {
    const maybeVideo = (record as Partial<{ videoUrl: string | null }>).videoUrl;
    if (maybeVideo) candidateUrls.push(maybeVideo);
  }

  if (record.segments && Array.isArray(record.segments)) {
    for (const seg of record.segments) {
      candidateUrls.push(seg?.videoUrl);
    }
  }

  for (const url of candidateUrls) {
    const id = extractYouTubeId(url);
    if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  }

  const fromRecordThumb = clean(record.thumbnailUrl);
  if (fromRecordThumb) return fromRecordThumb;

  const primarySegment = record.segments?.[0];
  const fromSegmentThumb = clean(primarySegment?.thumbnailUrl);
  if (fromSegmentThumb) return fromSegmentThumb;

  return DEFAULT_LESSON_IMAGE;
}

function lessonRecordToCard(record: LessonRecord): LessonCard {
  const due = formatDueDate(record.dueDate);
  const metaParts: string[] = [];

  if (due) metaParts.push(`Due: ${due}`);
  if (record.estimatedMinutes) metaParts.push(`${record.estimatedMinutes} min`);

  return {
    id: record.id,
    title: record.title,
    status: record.status === 'IN_PROGRESS' ? `${Math.max(record.percentComplete, 1)}% complete` : 'Not started',
    meta: metaParts.join(' • ') || 'No due date',
    actionLabel: record.status === 'IN_PROGRESS' ? 'Continue' : 'Start',
    variant: record.status === 'IN_PROGRESS' ? 'continue' : 'start',
    image: resolveLessonImage(record),
    href: `/lessons/${record.slug}`,
  };
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();

  const { data: studentData, isLoading, refresh } = useStudentData(user?.primaryEmailAddress?.emailAddress ?? null);

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [activeSurvey, setActiveSurvey] = useState<{
    promptId: string;
    badgeId: string;
    badgeSlug: string | null;
    badgeName: string | null;
    question: string;
  } | null>(null);
  const [surveyRating, setSurveyRating] = useState(3);

  const navItems = SIDEBAR_NAV;
  const displayName = studentData?.student?.name || 'Student';

  const pendingSurveyBadges = useMemo(() => studentData?.surveys?.pendingBadge ?? [], [studentData]);

  const readyForFinalization = useMemo(() => studentData?.badges?.readyForFinalization ?? [], [studentData]);

  const readyBadgeAlerts = useMemo(() => {
    if (pendingSurveyBadges.length > 0) return pendingSurveyBadges;

    return readyForFinalization.map((badge) => ({
      promptId: `auto-${badge.id}`,
      badgeId: badge.id,
      badgeSlug: badge.slug,
      badgeName: badge.name,
      question: `Complete the final survey for ${badge.name}`,
    }));
  }, [pendingSurveyBadges, readyForFinalization]);

  const upNextLessons = useMemo(() => studentData?.lessons.upNext.map(lessonRecordToCard) ?? [], [studentData]);

  const continueLessons = useMemo(() => studentData?.lessons.inProgress.map(lessonRecordToCard) ?? [], [studentData]);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    const slug = searchParams.get('surveyBadge');
    if (!slug) return;

    const match = pendingSurveyBadges.find((e) => e.badgeSlug === slug) ?? pendingSurveyBadges[0] ?? null;

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

  const handleSignOut = async () => {
    if (isSigningOut) return;

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
      const surveyTarget = target ?? readyBadgeAlerts[0];
      if (!surveyTarget) return;

      setActiveSurvey(surveyTarget);
      setSurveyRating(3);

      const params = new URLSearchParams(searchParams.toString());
      if (surveyTarget.badgeSlug) {
        params.set('surveyBadge', surveyTarget.badgeSlug);
      }

      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [readyBadgeAlerts, pathname, router, searchParams]
  );

  const handleSubmitSurvey = useCallback(async () => {
    if (!activeSurvey || !studentData?.student.email) return;

    try {
      const response = await fetch(`/api/badges/${activeSurvey.badgeId}/survey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: studentData.student.email,
          rating: surveyRating,
        }),
      });

      if (!response.ok) throw new Error('Failed to submit survey');

      await refresh();
      closeSurveyModal();
    } catch (error) {
      console.error('Failed to submit survey', error);
    }
  }, [activeSurvey, surveyRating, studentData, refresh, closeSurveyModal]);

  if (!isLoaded || !isSignedIn) return null;
  if (isLoading || !studentData) return null;

  const renderCard = (lesson: LessonCard) => {
    const buttonClass =
      lesson.variant === 'continue' ? `${styles.cardButton} ${styles.secondaryAction}` : styles.cardButton;

    const imageSrc = lesson.image ?? DEFAULT_LESSON_IMAGE;

    return (
      <div key={lesson.id} className={styles.card}>
        <div className={styles.cardMedia}>
          <Image src={imageSrc} alt="Lesson preview" width={320} height={200} className={styles.cardMediaImage} />
        </div>

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
      <Sidebar navItems={navItems} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={`main ${styles.main}`}>
        <div className={styles.topRow}>
          <div className={styles.alertWrapper}>
            <div
              className={styles.alert}
              data-active={readyBadgeAlerts.length > 0}
              onClick={readyBadgeAlerts.length > 0 ? () => handleStartSurvey() : undefined}
            >
              {readyBadgeAlerts.length > 0 ? (
                <>
                  <Image
                    src="/assets/survey_alarm/survey_alarm_x_icon.png"
                    alt="Survey reminder"
                    className={styles.alertIcon}
                    width={24}
                    height={24}
                  />
                  <span className={styles.alertText}>
                    {readyBadgeAlerts.length === 1
                      ? `Complete feedback for ${readyBadgeAlerts[0]?.badgeName ?? 'your badge'} to finalize it.`
                      : `You have ${readyBadgeAlerts.length} badges ready to finalize. Start the surveys to finish.`}
                  </span>
                </>
              ) : (
                <span className={styles.alertText}>Welcome, Student</span>
              )}
            </div>
          </div>
        </div>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Up next</h2>
          {upNextLessons.length === 0 ? (
            <div className={styles.emptyState}>No lessons ready to start.</div>
          ) : (
            <div className={styles.cardRow}>{upNextLessons.map(renderCard)}</div>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Pick up where you left off</h2>
          {continueLessons.length === 0 ? (
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

                const imgClassNames = [styles.surveyFaceImage, isSelected ? styles.surveyFaceImageSelected : '']
                  .filter(Boolean)
                  .join(' ');

                const iconSrc = isSelected ? FACE_IMAGES_SELECTED[value] : FACE_IMAGES[value];

                return (
                  <button
                    key={value}
                    type="button"
                    className={buttonClass}
                    onClick={() => setSurveyRating(value)}
                    aria-pressed={isSelected}
                    aria-label={FACE_ALTS[value]}
                  >
                    <Image src={iconSrc} alt={FACE_ALTS[value]} className={imgClassNames} />
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

export default function Page() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
