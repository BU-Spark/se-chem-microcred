'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import Sidebar, { SIDEBAR_NAV } from '@/app/components/Navigation/Sidebar';
import SurveyModal from '@/app/components/SurveyModal';
import AssessmentCodeModal from '@/app/components/AssessmentCodeModal';
import { useStudentData, type BadgeRecord, type LessonRecord } from '../hooks/useStudentData';
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

function lessonRecordToCard(record: LessonRecord, assessedBadgeSlugs?: Set<string>): LessonCard {
  const due = formatDueDate(record.dueDate);
  const metaParts: string[] = [];
  if (due) {
    metaParts.push(`Due: ${due}`);
  }
  if (record.estimatedMinutes) {
    metaParts.push(`${record.estimatedMinutes} min`);
  }

  // Progress reads as a checkpoint count ("1 of 2 checkpoints") rather than a percent.
  const totalCheckpoints = record.checkpoints?.length ?? 0;
  const passedCheckpoints = record.completedCheckpointIds?.length ?? 0;
  const statusLabel =
    record.status === 'COMPLETED'
      ? 'Completed'
      : record.status === 'IN_PROGRESS'
        ? totalCheckpoints > 0
          ? `${passedCheckpoints} of ${totalCheckpoints} checkpoint${totalCheckpoints === 1 ? '' : 's'}`
          : 'In progress'
        : 'Not started';

  const actionLabel = record.status === 'COMPLETED' ? 'Review' : record.status === 'IN_PROGRESS' ? 'Continue' : 'Start';

  const variant: LessonCard['variant'] =
    record.status === 'COMPLETED' ? 'completed' : record.status === 'IN_PROGRESS' ? 'continue' : 'start';

  // A completed badge lesson's "Review" opens the badge feedback (assessment
  // results) page instead of replaying the lesson video — but only once the badge
  // has actually been assessed. Assessment outcome lives on the badge, not the
  // lesson: passing (COMPLETED) OR failing (IN_REVIEW/LOCKED) the in-person
  // assessment both belong here, while a lesson whose badge is only awaiting
  // assessment (READY_FOR_ASSESSMENT) has no feedback yet and stays on the lesson.
  const badgeSlug = record.badgeRequirements?.[0]?.badgeSlug ?? null;
  const badgeAssessed = badgeSlug ? (assessedBadgeSlugs?.has(badgeSlug) ?? false) : false;
  const href =
    record.status === 'COMPLETED' && badgeSlug && badgeAssessed
      ? `/badges/${encodeURIComponent(badgeSlug)}/feedback`
      : `/lessons/${record.slug}`;

  return {
    id: record.id,
    title: record.title,
    status: statusLabel,
    meta: metaParts.join(' • ') || 'No due date',
    actionLabel,
    variant,
    image: resolveLessonImage(record),
    href,
  };
}

type BadgeStatusTone = 'notStarted' | 'learning' | 'assess' | 'review' | 'finalize' | 'completed' | 'locked';

interface BadgeStatusDisplay {
  label: string;
  tone: BadgeStatusTone;
}

function formatBadgeDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Map a badge's assessment state to a student-facing label + a tone for the status pill.
 * IN_REVIEW splits on the latest attempt: a passing attempt awaits the student's rating
 * ("Ready to finalize"), a failing one awaits their feedback review ("Ready to be reviewed").
 */
function badgeStatusDisplay(badge: BadgeRecord): BadgeStatusDisplay {
  switch (badge.status) {
    case 'COMPLETED':
      return { label: 'Completed', tone: 'completed' };
    case 'READY_FOR_ASSESSMENT':
      return { label: 'Ready to be assessed', tone: 'assess' };
    case 'IN_REVIEW':
      return badge.latestAttemptPassed === true
        ? { label: 'Ready to finalize', tone: 'finalize' }
        : { label: 'Ready to be reviewed', tone: 'review' };
    case 'LOCKED': {
      const until = formatBadgeDate(badge.cooldownUntil);
      const future = badge.cooldownUntil ? Date.parse(badge.cooldownUntil) > Date.now() : false;
      return { label: until && future ? `Locked until ${until}` : 'Locked', tone: 'locked' };
    }
    case 'LEARNING':
      return { label: 'In progress', tone: 'learning' };
    case 'NOT_STARTED':
    default:
      return { label: 'Not started', tone: 'notStarted' };
  }
}

// Badges whose assessment feedback page is worth linking to (an attempt exists / is resolved).
const BADGE_STATUSES_WITH_FEEDBACK = new Set<BadgeRecord['status']>(['IN_REVIEW', 'COMPLETED', 'LOCKED']);

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
  // Currently selected badge tab (a badge id). null falls back to the first badge.
  // The Overview is rendered separately and is always visible, so it is not a tab.
  const [activeBadgeId, setActiveBadgeId] = useState<string | null>(null);
  // Badge whose in-person assessment code/QR modal is open (READY_FOR_ASSESSMENT only).
  const [codeBadge, setCodeBadge] = useState<BadgeRecord | null>(null);

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

  // Badges with an assessment outcome (passed → COMPLETED, failed → IN_REVIEW/LOCKED).
  // A completed lesson's "Review" only routes to feedback once its badge is in here.
  const assessedBadgeSlugs = useMemo(() => {
    const slugs = new Set<string>();
    const badges = studentData?.badges;
    if (badges) {
      for (const badge of [...(badges.completed ?? []), ...(badges.inReview ?? []), ...(badges.locked ?? [])]) {
        if (badge.slug) slugs.add(badge.slug);
      }
    }
    return slugs;
  }, [studentData]);

  // Group lessons under the badges they belong to. Driven from the lesson side because
  // every returned lesson carries its badge ids, whereas a never-started badge's own
  // `requirements` list comes back empty. In practice the link is 1:1, but a lesson
  // required by multiple badges is placed under each (many-to-many is schema-legal).
  const lessonsByBadgeId = useMemo(() => {
    const map = new Map<string, LessonRecord[]>();
    for (const lesson of studentData?.lessons.catalog ?? []) {
      for (const req of lesson.badgeRequirements ?? []) {
        const list = map.get(req.badgeId) ?? [];
        list.push(lesson);
        map.set(req.badgeId, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return map;
  }, [studentData]);

  // Flatten all badge buckets into one ordered list for the tab strip. A badge earns a
  // tab when it has at least one visible lesson OR the student has begun it (status other
  // than NOT_STARTED) — this suppresses empty tabs for never-started, unreleased badges.
  // Ordered by the badge's earliest lesson so tabs follow the course's learning sequence.
  const orderedBadges = useMemo(() => {
    const badges = studentData?.badges;
    if (!badges) return [] as BadgeRecord[];
    const all = [
      ...(badges.completed ?? []),
      ...(badges.readyForAssessment ?? []),
      ...(badges.inReview ?? []),
      ...(badges.learning ?? []),
      ...(badges.locked ?? []),
      ...(badges.notStarted ?? []),
    ];
    const earliestSort = (badge: BadgeRecord) =>
      lessonsByBadgeId.get(badge.id)?.[0]?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    return all
      .filter((badge) => (lessonsByBadgeId.get(badge.id)?.length ?? 0) > 0 || badge.status !== 'NOT_STARTED')
      .sort((a, b) => earliestSort(a) - earliestSort(b) || a.name.localeCompare(b.name));
  }, [studentData, lessonsByBadgeId]);

  // Overall course progress for the Overview tab.
  const badgeProgress = useMemo(() => {
    const completed = studentData?.badges.completed?.length ?? 0;
    return { completed, total: orderedBadges.length };
  }, [studentData, orderedBadges]);

  const lessonProgress = useMemo(() => {
    const all = studentData?.lessons.catalog ?? [];
    return { completed: all.filter((lesson) => lesson.status === 'COMPLETED').length, total: all.length };
  }, [studentData]);

  // If the selected badge disappears after a data refresh, fall back to the first badge.
  useEffect(() => {
    if (activeBadgeId !== null && !orderedBadges.some((badge) => badge.id === activeBadgeId)) {
      setActiveBadgeId(null);
    }
  }, [activeBadgeId, orderedBadges]);

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
        Review &amp; Finalize
      </button>
    </li>
  );

  const renderBadgePanel = (badge: BadgeRecord) => {
    const display = badgeStatusDisplay(badge);
    const cards = (lessonsByBadgeId.get(badge.id) ?? []).map((record) =>
      lessonRecordToCard(record, assessedBadgeSlugs)
    );
    const feedbackHref =
      BADGE_STATUSES_WITH_FEEDBACK.has(badge.status) && badge.slug
        ? courseId
          ? `/badges/${encodeURIComponent(badge.slug)}/feedback?courseId=${encodeURIComponent(courseId)}`
          : `/badges/${encodeURIComponent(badge.slug)}/feedback`
        : null;
    const feedbackLabel =
      badge.status === 'COMPLETED'
        ? 'View feedback'
        : badge.latestAttemptPassed
          ? 'Review & finalize'
          : 'Review feedback';

    return (
      <section className={styles.badgePanel}>
        <div className={styles.badgeHeader}>
          <div className={styles.badgeHeaderText}>
            <div className={styles.badgeHeaderTop}>
              <h2 className={styles.badgeHeaderTitle}>{badge.name}</h2>
              <span className={`${styles.statusPill} ${styles[`status_${display.tone}`]}`}>{display.label}</span>
            </div>
            {badge.description ? <p className={styles.badgeHeaderDescription}>{badge.description}</p> : null}
            <div className={styles.badgeHeaderMeta}>
              {badge.score != null ? <span>Score: {badge.score}%</span> : null}
              {badge.latestAttemptPassed != null ? (
                <span>Last attempt: {badge.latestAttemptPassed ? 'Passed' : 'Not passed'}</span>
              ) : null}
            </div>
          </div>
          {badge.status === 'READY_FOR_ASSESSMENT' ? (
            <button type="button" className={styles.badgeHeaderAction} onClick={() => setCodeBadge(badge)}>
              Show code
            </button>
          ) : feedbackHref ? (
            <Link href={feedbackHref} className={styles.badgeHeaderAction}>
              {feedbackLabel}
            </Link>
          ) : null}
        </div>

        {cards.length === 0 ? (
          <div className={styles.emptyState}>No lessons are available for this badge yet.</div>
        ) : (
          <div className={styles.cardGrid}>{cards.map(renderCard)}</div>
        )}
      </section>
    );
  };

  // The selected badge tab; defaults to the first badge when nothing is chosen yet.
  const selectedBadge = orderedBadges.find((badge) => badge.id === activeBadgeId) ?? orderedBadges[0] ?? null;

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

        <div className={styles.dashboardGrid}>
          {/* Left: badges — one tab per badge, the selected badge's lessons below. */}
          <div className={styles.mainColumn}>
            <section className={styles.badgesSection}>
              <h2 className={styles.sectionTitle}>Badges</h2>
              {isLoading ? (
                <div className={styles.emptyState}>Loading your badges…</div>
              ) : orderedBadges.length === 0 ? (
                <div className={styles.emptyState}>This course doesn&apos;t have any badges yet.</div>
              ) : (
                <>
                  <div className={styles.tabStrip} role="tablist" aria-label="Badges">
                    {orderedBadges.map((badge) => {
                      const isActive = selectedBadge?.id === badge.id;
                      const display = badgeStatusDisplay(badge);
                      return (
                        <button
                          key={badge.id}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
                          onClick={() => setActiveBadgeId(badge.id)}
                        >
                          <span className={styles.tabLabel}>{badge.name}</span>
                          <span className={`${styles.tabDot} ${styles[`status_${display.tone}`]}`} aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>

                  {selectedBadge ? renderBadgePanel(selectedBadge) : null}
                </>
              )}
            </section>
          </div>

          {/* Right: Overview + course info combined into one always-visible panel. */}
          <aside className={styles.sideColumn}>
            <section className={styles.panel}>
              <p className={styles.progressSummary}>
                <span>
                  <strong>
                    {badgeProgress.completed}/{badgeProgress.total}
                  </strong>{' '}
                  badges completed
                </span>
                <span>
                  <strong>
                    {lessonProgress.completed}/{lessonProgress.total}
                  </strong>{' '}
                  lessons completed
                </span>
                <span>
                  <strong>{readyBadgeAlerts.length}</strong> ready to finalize
                </span>
              </p>

              {readyBadgeAlerts.length > 0 ? (
                <div className={styles.panelSection}>
                  <h3 className={styles.panelSubtitle}>Ready to finalize</h3>
                  <ul className={styles.badgeList}>{readyBadgeAlerts.map(renderBadgeListItem)}</ul>
                </div>
              ) : null}

              {courseDescription || courseContacts.length > 0 ? (
                <div className={styles.panelSection}>
                  <h3 className={styles.panelSubtitle}>About this course</h3>
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
                </div>
              ) : null}
            </section>
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

      {codeBadge ? (
        <AssessmentCodeModal
          badgeId={codeBadge.id}
          badgeName={codeBadge.name}
          courseId={codeBadge.courseId ?? studentData?.course?.id ?? courseId}
          studentId={studentData?.student.id}
          onClose={() => setCodeBadge(null)}
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
