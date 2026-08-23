'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import Sidebar, { SIDEBAR_NAV } from '@/app/components/Navigation/Sidebar';
import SurveyModal from '@/app/components/SurveyModal';
import { surveyFaceOptions } from '@/app/components/SurveyModal/faces';
import { useStudentData, type BadgeRecord, type LessonRecord } from '../hooks/useStudentData';
import styles from './page.module.css';

interface LessonCard {
  id: string;
  title: string;
  status: string;
  meta: string;
  actionLabel: string;
  variant?: 'start' | 'continue' | 'completed';
  image?: string;
  href?: string;
  section: 'upNext' | 'inProgress' | 'completed';
  // Set when an instructor waived the QEV requirement of a badge this lesson
  // backs. The waiver deliberately leaves lesson progress alone, so without this
  // the card sits in "Pick up where you left off" while the badge reports itself
  // ready to assess — two true statements that read as a contradiction.
  waivedNote?: string;
}

/**
 * Keep lesson cards in their three broad progress groups while explaining the
 * badge step that follows the video. The badge is the richer state machine:
 * lesson progress alone cannot distinguish assessment, feedback, cooldown, and
 * award states after a lesson has been completed.
 */
function describeLessonState(record: LessonRecord, badgesById?: Map<string, BadgeRecord>) {
  if (record.status !== 'COMPLETED') {
    if (record.status === 'IN_PROGRESS') {
      return 'Video lesson in progress';
    }
    return 'Lesson not started';
  }

  const badge = record.badgeRequirements
    ?.map((requirement) => badgesById?.get(requirement.badgeId))
    .find((candidate): candidate is BadgeRecord => Boolean(candidate));

  if (!badge || badge.status === 'COMPLETED' || badge.status === 'NOT_STARTED') return 'Completed';

  if (badge.status === 'LEARNING' || badge.status === 'LOCKED') return 'Video lesson in progress';

  if (badge.status === 'IN_REVIEW' || badge.status === 'READY_FOR_ASSESSMENT') return 'Assessment in progress';

  return 'Completed';
}

function resolveLessonSection(record: LessonRecord, badgesById?: Map<string, BadgeRecord>): LessonCard['section'] {
  if (record.status === 'NOT_STARTED') return 'upNext';
  if (record.status === 'IN_PROGRESS') return 'inProgress';

  const badge = record.badgeRequirements
    ?.map((requirement) => badgesById?.get(requirement.badgeId))
    .find((candidate): candidate is BadgeRecord => Boolean(candidate));

  if (badge?.status === 'LEARNING' || badge?.status === 'LOCKED') return 'inProgress';
  if (badge?.status === 'IN_REVIEW' || badge?.status === 'READY_FOR_ASSESSMENT') return 'inProgress';
  return 'completed';
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

function lessonRecordToCard(
  record: LessonRecord,
  startedBadgeSlugs?: Set<string>,
  waivedBadgeNamesById?: Map<string, string>,
  badgesById?: Map<string, BadgeRecord>
): LessonCard {
  const due = formatDueDate(record.dueDate);
  const metaParts: string[] = [];
  if (due) {
    metaParts.push(`Due: ${due}`);
  }
  if (record.estimatedMinutes) {
    metaParts.push(`${record.estimatedMinutes} min`);
  }

  const statusLabel = describeLessonState(record, badgesById);

  const actionLabel = record.status === 'COMPLETED' ? 'Review' : record.status === 'IN_PROGRESS' ? 'Continue' : 'Start';

  const variant: LessonCard['variant'] =
    record.status === 'COMPLETED' ? 'completed' : record.status === 'IN_PROGRESS' ? 'continue' : 'start';

  // Where the card's action button goes (issue #194). Neither destination is the
  // lesson preview page at /lessons/<slug> — the dashboard never wants that.
  //
  // Completed: the badge feedback page, which holds the review material and any
  // assessment results. This holds regardless of assessment state; see
  // startedBadgeSlugs for why only started badges qualify.
  //
  // Start/Continue: straight into the QEV route — the video plus its checkpoint
  // questions — rather than the preview. A completed lesson whose badge isn't
  // resolvable falls back here too; the QEV route re-enters it in review mode.
  const badgeSlug = record.badgeRequirements?.[0]?.badgeSlug ?? null;
  const badgeStarted = badgeSlug ? (startedBadgeSlugs?.has(badgeSlug) ?? false) : false;
  const href =
    record.status === 'COMPLETED' && badgeSlug && badgeStarted
      ? `/badges/${encodeURIComponent(badgeSlug)}/feedback`
      : `/lessons/${record.slug}/video`;

  // Name the badge rather than the lesson: the student's question is "why can I be
  // assessed when I haven't finished this?", and the badge is the thing that moved.
  const waivedBadgeName = record.badgeRequirements
    ?.map((requirement) => waivedBadgeNamesById?.get(requirement.badgeId))
    .find((name): name is string => Boolean(name));

  return {
    id: record.id,
    title: record.title,
    status: statusLabel,
    meta: metaParts.join(' • ') || 'No due date',
    actionLabel,
    variant,
    image: resolveLessonImage(record),
    href,
    section: resolveLessonSection(record, badgesById),
    waivedNote: waivedBadgeName
      ? `Your instructor cleared this requirement for ${waivedBadgeName} — you can be assessed without finishing it.`
      : undefined,
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
  // The submit button stayed live for the whole request plus the refresh that
  // follows it, so a student on a slow connection saw nothing happen and clicked
  // again. SurveyResponse has no unique key on (promptId, studentId) and the route
  // does find-then-write, so two overlapping submits each insert a row and the
  // student's rating counts twice. The badge route's IN_REVIEW → COMPLETED guard
  // already covers sequential clicks; this covers the concurrent ones.
  const [isSubmittingSurvey, setIsSubmittingSurvey] = useState(false);

  const displayName = studentData?.student?.name || user?.fullName || 'Student';
  const courseTitle = studentData?.course?.title ?? '';
  const courseCode = studentData?.course?.code ?? '';
  const courseSection = studentData?.course?.section ?? null;
  const courseDescription = studentData?.course?.description ?? '';
  const courseContacts = studentData?.course?.contacts ?? [];
  // Defence in depth behind the API's course scoping: this dashboard is one course,
  // so a badge earned in another one must never reach the finalize list. A badge with
  // no derivable course (no lesson-backed requirement) is kept — it belongs to no
  // other course either, and dropping it would strand the student.
  const belongsToThisCourse = useCallback(
    (badgeCourseId: string | null | undefined) => !courseId || !badgeCourseId || badgeCourseId === courseId,
    [courseId]
  );

  const pendingSurveyBadges = useMemo(
    () => (studentData?.surveys?.pendingBadge ?? []).filter((entry) => belongsToThisCourse(entry.courseId)),
    [studentData, belongsToThisCourse]
  );
  // Finalization is the pass-path of IN_REVIEW: a passing attempt awaiting the
  // student's acknowledge + rating. Fail-path IN_REVIEW badges are handled on the
  // feedback page, not here.
  const readyForFinalization = useMemo(
    () =>
      (studentData?.badges?.inReview ?? []).filter(
        (badge) => badge.latestAttemptPassed === true && belongsToThisCourse(badge.courseId)
      ),
    [studentData, belongsToThisCourse]
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
        courseId: badge.courseId,
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

  // Slugs of every badge the student has started. A completed lesson's "Review" routes
  // to the badge feedback page — that page is where the review material lives, whether
  // or not an assessment has happened yet — so this deliberately does NOT filter on
  // badge status or attempt history. Status would be the wrong signal regardless: a
  // failed badge only sits at IN_REVIEW until the student acknowledges the feedback,
  // then drops to READY_FOR_ASSESSMENT or LOCKED, and the state-machine backfill landed
  // every pre-existing failed badge at READY_FOR_ASSESSMENT.
  //
  // These are the same five buckets the feedback page resolves its badge from, so a
  // slug in this set is guaranteed to render there rather than bounce to /badges. A
  // badge with no StudentBadge row (NOT_STARTED) is excluded for exactly that reason.
  const startedBadgeSlugs = useMemo(() => {
    const slugs = new Set<string>();
    const badges = studentData?.badges;
    if (badges) {
      const started = [
        ...(badges.completed ?? []),
        ...(badges.inReview ?? []),
        ...(badges.locked ?? []),
        ...(badges.readyForAssessment ?? []),
        ...(badges.learning ?? []),
      ];
      for (const badge of started) {
        if (badge.slug) slugs.add(badge.slug);
      }
    }
    return slugs;
  }, [studentData]);

  // Badges whose QEV requirement an instructor waived, so the lesson cards backing
  // them can say why they became assessable while still unfinished.
  const waivedBadgeNamesById = useMemo(() => {
    const names = new Map<string, string>();
    const badges = studentData?.badges;
    if (badges) {
      const all = [
        ...(badges.completed ?? []),
        ...(badges.inReview ?? []),
        ...(badges.locked ?? []),
        ...(badges.readyForAssessment ?? []),
        ...(badges.learning ?? []),
      ];
      for (const badge of all) {
        if (badge.qevWaivedAt) {
          names.set(badge.id, badge.name);
        }
      }
    }
    return names;
  }, [studentData]);

  const badgesById = useMemo(() => {
    const result = new Map<string, BadgeRecord>();
    const badges = studentData?.badges;
    if (!badges) return result;

    const allBadges = [
      ...(badges.completed ?? []),
      ...(badges.inReview ?? []),
      ...(badges.locked ?? []),
      ...(badges.readyForAssessment ?? []),
      ...(badges.learning ?? []),
      ...(badges.notStarted ?? []),
    ];
    for (const badge of allBadges) result.set(badge.id, badge);
    return result;
  }, [studentData]);

  const upNextLessons = useMemo(() => {
    return (
      studentData?.lessons.upNext.map((record) =>
        lessonRecordToCard(record, undefined, waivedBadgeNamesById, badgesById)
      ) ?? []
    );
  }, [badgesById, studentData, waivedBadgeNamesById]);

  const { continueLessons, completedLessons } = useMemo(() => {
    const activeCards =
      studentData?.lessons.inProgress.map((record) =>
        lessonRecordToCard(record, undefined, waivedBadgeNamesById, badgesById)
      ) ?? [];
    const resolvedCompletedCards =
      studentData?.lessons.completed?.map((record) =>
        lessonRecordToCard(record, startedBadgeSlugs, waivedBadgeNamesById, badgesById)
      ) ?? [];

    return {
      continueLessons: [...activeCards, ...resolvedCompletedCards.filter((card) => card.section === 'inProgress')],
      completedLessons: resolvedCompletedCards.filter((card) => card.section === 'completed'),
    };
  }, [badgesById, startedBadgeSlugs, studentData, waivedBadgeNamesById]);

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

  // Finalization now happens on the badge review page: passing students must see
  // their assessment feedback before rating + finalizing. Route there instead of
  // opening the survey modal directly.
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

      router.push(
        surveyTarget.badgeSlug ? `/badges/${encodeURIComponent(surveyTarget.badgeSlug)}/feedback` : '/badges'
      );
    },
    [readyBadgeAlerts, router]
  );

  const handleSubmitSurvey = useCallback(async () => {
    // Belt and braces with the disabled button: a keyboard activation can still
    // land before React re-renders with the disabled attribute.
    if (!activeSurvey || !studentData?.student.email || isSubmittingSurvey) {
      return;
    }

    setIsSubmittingSurvey(true);

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
    } finally {
      // Reset on the failure path too, so a student whose submit genuinely failed
      // is not left with a permanently dead button.
      setIsSubmittingSurvey(false);
    }
  }, [activeSurvey, surveyRating, studentData, refresh, closeSurveyModal, isSubmittingSurvey]);

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
          {lesson.waivedNote ? <p className={styles.cardWaivedNote}>{lesson.waivedNote}</p> : null}
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
        Review &amp; Finalize
      </button>
    </li>
  );

  return (
    <div className={`page ${styles.page}`}>
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={`main ${styles.main}`}>
        <section
          className={`${styles.hero} ${courseDescription || courseContacts.length > 0 ? styles.heroWithDetails : styles.heroWithoutDetails}`}
        >
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
          {courseDescription || courseContacts.length > 0 ? (
            <div className={styles.heroDetails}>
              <h2 className={styles.heroDetailsTitle}>About this course</h2>
              {courseDescription ? <p className={styles.heroDetailsText}>{courseDescription}</p> : null}
              {courseContacts.length > 0 ? (
                <ul className={styles.heroContacts}>
                  {courseContacts.map((contact) => (
                    <li key={contact.id} className={styles.heroContactItem}>
                      <span className={styles.contactName}>{contact.name}</span>
                      <span className={styles.contactMeta}>{contact.type}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
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
          </aside>
        </div>
      </main>

      {activeSurvey ? (
        <SurveyModal
          title="Tell us about your experience."
          question={activeSurvey.question}
          options={surveyFaceOptions()}
          value={surveyRating}
          onChange={setSurveyRating}
          onSubmit={handleSubmitSurvey}
          onClose={closeSurveyModal}
          isSubmitting={isSubmittingSurvey}
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
