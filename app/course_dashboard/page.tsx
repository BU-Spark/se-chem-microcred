'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';
import SurveyModal from '@/app/components/SurveyModal';
import { useStudentData, type LessonRecord } from '../hooks/useStudentData';
import styles from './page.module.css';
import veryUnhappy from '../../public/assets/survey_faces/very_unhappy.svg';
import slightlyUnhappy from '../../public/assets/survey_faces/slightly_unhappy.svg';
import neutral from '../../public/assets/survey_faces/neutral.svg';
import slightlyHappy from '../../public/assets/survey_faces/slightly_happy.svg';
import veryHappy from '../../public/assets/survey_faces/very_happy.svg';
import veryUnhappySelected from '../../public/assets/survey_faces/very_unhappy_selected.svg';
import slightlyUnhappySelected from '../../public/assets/survey_faces/slightly_unhappy_selected.svg';
import neutralSelected from '../../public/assets/survey_faces/neutral_selected.svg';
import slightlyHappySelected from '../../public/assets/survey_faces/slightly_happy_selected.svg';
import veryHappySelected from '../../public/assets/survey_faces/very_happy_selected.svg';

interface LessonCard {
  id: string;
  title: string;
  status: string;
  meta: string;
  actionLabel: string;
  variant?: 'start' | 'continue' | 'completed';
  image?: string;
  href?: string;
}

const DEFAULT_LESSON_IMAGE = 'https://dummyimage.com/320x200/EBF2FF/1F5FAB&text=ChemSkills';

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

/**
 * Robust YouTube ID extractor:
 * - https://www.youtube.com/watch?v=ID
 * - https://youtu.be/ID
 * - https://www.youtube.com/embed/ID
 * - with extra query params / playlists
 */
function extractYouTubeId(url?: string | null) {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const u = new URL(trimmed);

    // youtu.be/<id>
    if (u.hostname.includes('youtu.be')) {
      const pathId = u.pathname.replace('/', '').trim();
      if (pathId.length === 11) return pathId;
    }

    // ?v=<id>
    const v = u.searchParams.get('v');
    if (v && v.length === 11) return v;

    // /embed/<id>
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

/**
 * Decide which image to show for a lesson.
 * Priority:
 * 1. YouTube thumbnail derived from lesson/segment videoUrl
 * 2. record.thumbnailUrl
 * 3. first segment thumbnailUrl
 * 4. dummy fallback
 */
function resolveLessonImage(record: LessonRecord) {
  const clean = (u?: string | null) => {
    if (!u) return null;
    const trimmed = u.trim();
    if (!trimmed) return null;
    // normalize accidentally stored "/public/assets/..." paths to "/assets/..."
    if (trimmed.startsWith('/public/')) return trimmed.replace(/^\/public/, '');
    return trimmed;
  };

  // First try YouTube thumbnails from any video URLs
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

  // Badge videos live on the requirement summary, not the segment (see bug #14),
  // so include them or badge-only lessons fall through to the ChemSkills dummy.
  if (Array.isArray(record.badgeRequirements)) {
    for (const req of record.badgeRequirements) {
      candidateUrls.push(req?.youtubeUrl);
    }
  }

  for (const url of candidateUrls) {
    const id = extractYouTubeId(url);
    if (id) {
      return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    }
  }

  const fromRecordThumb = clean(record.thumbnailUrl);
  if (fromRecordThumb) return fromRecordThumb;

  const primarySegment = record.segments?.[0];
  const fromSegmentThumb = clean(primarySegment?.thumbnailUrl);
  if (fromSegmentThumb) return fromSegmentThumb;

  // 最后兜底 dummy
  return DEFAULT_LESSON_IMAGE;
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

  const statusLabel =
    record.status === 'COMPLETED'
      ? 'Completed'
      : record.status === 'IN_PROGRESS'
        ? `${Math.max(record.percentComplete, 1)}% complete`
        : 'Not started';

  const actionLabel = record.status === 'COMPLETED' ? 'Review' : record.status === 'IN_PROGRESS' ? 'Continue' : 'Start';

  const variant: LessonCard['variant'] =
    record.status === 'COMPLETED' ? 'completed' : record.status === 'IN_PROGRESS' ? 'continue' : 'start';

  return {
    id: record.id,
    title: record.title,
    status: statusLabel,
    meta: metaParts.join(' • ') || 'No due date',
    actionLabel,
    variant,
    image: resolveLessonImage(record),
    href: `/lessons/${record.slug}`,
  };
}

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn, user } = useUser();
  const signOut = useSignOut();
  const courseId = searchParams.get('courseId');
  const { data: studentData, isLoading, refresh } = useStudentData(user?.primaryEmailAddress?.emailAddress, courseId);
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

  const displayName = studentData?.student?.name || user?.fullName || 'Student';
  const courseTitle = studentData?.course?.title ?? '';
  const courseCode = studentData?.course?.code ?? '';
  const courseSection = studentData?.course?.section ?? null;
  const courseDescription = studentData?.course?.description ?? '';
  const courseContacts = studentData?.course?.contacts ?? [];
  const pendingSurveyBadges = useMemo(() => studentData?.surveys?.pendingBadge ?? [], [studentData]);
  // Finalization is the pass-path of IN_REVIEW: a passing attempt awaiting the
  // student's acknowledge + rating. Fail-path IN_REVIEW badges are handled on the
  // feedback page, not here.
  const readyForFinalization = useMemo(
    () => (studentData?.badges?.inReview ?? []).filter((badge) => badge.latestAttemptPassed === true),
    [studentData]
  );

  // Merge both "ready" sources so neither hides the other, deduping by badgeId.
  // Pending survey entries win — they carry the real promptId/question.
  const readyBadgeAlerts = useMemo(() => {
    const merged = [...pendingSurveyBadges];
    const seen = new Set(pendingSurveyBadges.map((entry) => entry.badgeId));

    for (const badge of readyForFinalization) {
      if (seen.has(badge.id)) {
        continue;
      }
      seen.add(badge.id);
      merged.push({
        promptId: `auto-${badge.id}`,
        badgeId: badge.id,
        badgeSlug: badge.slug,
        badgeName: badge.name,
        question: `Complete the final survey for ${badge.name}`,
      });
    }

    return merged;
  }, [pendingSurveyBadges, readyForFinalization]);

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

  const completedLessons = useMemo(() => {
    return studentData?.lessons.completed?.map(lessonRecordToCard) ?? [];
  }, [studentData]);

  useEffect(() => {
    if (isLoaded && !isSignedIn && !isSigningOut) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, isSigningOut, router]);

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/splash');
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
    [readyBadgeAlerts, pathname, router, searchParams]
  );

  const handleSubmitSurvey = useCallback(async () => {
    if (!activeSurvey || !studentData?.student.email) {
      return;
    }

    try {
      const response = await fetch(`/api/badges/${activeSurvey.badgeId}/survey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: studentData.student.email,
          rating: surveyRating,
        }),
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

    const imageSrc = lesson.image ?? DEFAULT_LESSON_IMAGE;
    const isYouTubeThumb = imageSrc.includes('ytimg.com') || imageSrc.includes('youtube.com');

    // Carry the dashboard's courseId into the lesson link so the lesson page
    // resolves data for THIS course; without it the student API falls back to
    // the student's first enrollment and can't find the lesson.
    const lessonHref =
      lesson.href && courseId ? `${lesson.href}?courseId=${encodeURIComponent(courseId)}` : lesson.href;

    return (
      <div key={lesson.id} className={styles.card}>
        <div className={styles.cardMedia}>
          {isYouTubeThumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageSrc} alt="Lesson preview" width={320} height={200} className={styles.cardMediaImage} />
          ) : (
            <Image src={imageSrc} alt="Lesson preview" width={320} height={200} className={styles.cardMediaImage} />
          )}
        </div>

        <div className={styles.cardTextBlock}>
          <div className={styles.cardTitle}>{lesson.title}</div>
          <div className={styles.cardStatus}>{lesson.status}</div>
          <div className={styles.cardMeta}>{lesson.meta}</div>
        </div>

        {lessonHref ? (
          <Link href={lessonHref} className={buttonClass}>
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

  const renderBadgeListItem = (alert: (typeof readyBadgeAlerts)[number]) => (
    <li key={alert.badgeId} className={styles.badgeListItem}>
      <div className={styles.badgeListInfo}>
        <Image
          src="/assets/survey_alarm/survey_alarm_x_icon.png"
          alt=""
          width={28}
          height={28}
          className={styles.badgeListIcon}
        />
        <div className={styles.badgeListText}>
          <span className={styles.badgeListName}>{alert.badgeName ?? 'Your badge'}</span>
          <span className={styles.badgeListMeta}>Ready to finalize</span>
        </div>
      </div>
      <button type="button" className={styles.badgeListAction} onClick={() => handleStartSurvey(alert)}>
        Finalize
      </button>
    </li>
  );

  return (
    <div className={`page ${styles.page}`}>
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={`main ${styles.main}`}>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <p className={styles.heroEyebrow}>Welcome back, {displayName}</p>
            <h1 className={styles.heroTitle}>{courseTitle || 'Your course'}</h1>
            {courseCode || courseSection ? (
              <p className={styles.heroMeta}>
                {courseCode}
                {courseCode && courseSection ? ' · ' : ''}
                {courseSection ? `Section ${courseSection}` : ''}
              </p>
            ) : null}
          </div>
        </section>

        <div className={styles.statRow}>
          <div className={styles.statCard}>
            <span className={styles.statNumber}>{upNextLessons.length}</span>
            <span className={styles.statLabel}>Lessons up next</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statNumber}>{continueLessons.length}</span>
            <span className={styles.statLabel}>In progress</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statNumber}>{readyBadgeAlerts.length}</span>
            <span className={styles.statLabel}>Ready to finalize</span>
          </div>
        </div>

        <div className={styles.dashboardGrid}>
          <div className={styles.mainColumn}>
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Up next</h2>
              {isLoading ? (
                <div className={styles.emptyState}>Loading lessons…</div>
              ) : upNextLessons.length === 0 ? (
                <div className={styles.emptyState}>No lessons ready to start.</div>
              ) : (
                <div className={styles.cardGrid}>{upNextLessons.map(renderCard)}</div>
              )}
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Pick up where you left off</h2>
              {isLoading ? (
                <div className={styles.emptyState}>Loading your progress…</div>
              ) : continueLessons.length === 0 ? (
                <div className={styles.emptyState}>There are no in-progress lessons right now.</div>
              ) : (
                <div className={styles.cardGrid}>{continueLessons.map(renderCard)}</div>
              )}
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Completed</h2>
              {isLoading ? (
                <div className={styles.emptyState}>Loading your progress…</div>
              ) : completedLessons.length === 0 ? (
                <div className={styles.emptyState}>You haven&apos;t completed any lessons yet.</div>
              ) : (
                <div className={styles.cardGrid}>{completedLessons.map(renderCard)}</div>
              )}
            </section>
          </div>

          <aside className={styles.sideColumn}>
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Ready to finalize</h2>
              {isLoading ? (
                <p className={styles.emptyState}>Loading your badges…</p>
              ) : readyBadgeAlerts.length === 0 ? (
                <p className={styles.emptyState}>No badges ready to finalize right now.</p>
              ) : (
                <ul className={styles.badgeList}>{readyBadgeAlerts.map(renderBadgeListItem)}</ul>
              )}
            </section>

            {courseDescription || courseContacts.length > 0 ? (
              <section className={styles.panel}>
                <h2 className={styles.panelTitle}>About this course</h2>
                {courseDescription ? <p className={styles.panelText}>{courseDescription}</p> : null}
                {courseContacts.length > 0 ? (
                  <ul className={styles.contactList}>
                    {courseContacts.map((contact) => (
                      <li key={contact.id} className={styles.contactItem}>
                        <span className={styles.contactName}>{contact.name}</span>
                        <span className={styles.contactMeta}>{contact.type}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}
          </aside>
        </div>
      </main>

      {activeSurvey ? (
        <SurveyModal
          title="Tell us about your experience."
          question={activeSurvey.question}
          options={[1, 2, 3, 4, 5].map((value) => ({
            value,
            label: FACE_ALTS[value],
            icon: FACE_IMAGES[value],
            selectedIcon: FACE_IMAGES_SELECTED[value],
          }))}
          value={surveyRating}
          onChange={setSurveyRating}
          onSubmit={handleSubmitSurvey}
          onClose={closeSurveyModal}
          classNames={{
            overlay: styles.surveyOverlay,
            modal: styles.surveyModal,
            close: styles.surveyClose,
            title: styles.surveyTitle,
            question: styles.surveyQuestion,
            options: styles.surveyFaces,
            option: styles.surveyFace,
            selectedOption: styles.surveyFaceSelected,
            optionImage: styles.surveyFaceImage,
            selectedOptionImage: styles.surveyFaceImageSelected,
            submit: styles.surveySubmit,
          }}
        />
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
