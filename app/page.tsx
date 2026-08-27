'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useMyCourses } from './hooks/useMyCourses';
import { useDashboardAnalytics } from './hooks/useDashboardAnalytics';
import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { Icon } from '@iconify/react';
import { useSignOut } from '@/app/hooks/useSignOut';
import { useStudentData, type StudentData } from './hooks/useStudentData';
import styles from './page.module.css';
import courseStyles from './courses/page.module.css';
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
import Sidebar, { SIDEBAR_NAV } from '@/app/components/Navigation/Sidebar';

const COURSE_TAB_STORAGE_KEY = 'dashboardCourseTab';
type CourseTab = 'instructor' | 'enrolled' | 'checker';
const isCourseTab = (value: string): value is CourseTab =>
  value === 'instructor' || value === 'enrolled' || value === 'checker';
import BackButton from '@/app/components/BackButton/BackButton';
import CourseTileImage from '@/app/components/Courses/CourseTileImage';
import SurveyModal from '@/app/components/SurveyModal/SurveyModal';
import type { CourseImageFields } from '@/lib/courseImage';

interface EnrolledCourseCardData extends CourseImageFields {
  id: string;
  courseId: string;
  title: string;
  image?: string;
  href?: string;
}

type CourseContact = NonNullable<StudentData['course']>['contacts'][number];

type CoursePreviewLesson = {
  thumbnailUrl: string | null;
  segments: Array<{
    videoUrl: string | null;
    thumbnailUrl: string | null;
  }>;
};

type CreatedCourse = CourseImageFields & {
  id: string;
  title: string;
  description: string | null;
  section: string | null;
  sectionCount: number;
  createdAt: string;
  lessons: Array<{
    thumbnailUrl: string | null;
  }>;
};

const formatCourseCreatedDate = (createdAt: string) => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
    timeZone: 'UTC',
  });
};

type EnrolledCourse = {
  id: string;
  role: 'STUDENT' | 'INSTRUCTOR' | 'CHECKER';
  course: CourseImageFields & {
    id: string;
    code: string;
    section: string | null;
    title: string;
    description: string | null;
    contacts: CourseContact[];
    lessons: CoursePreviewLesson[];
  };
};

type CheckerCourseEnrollment = {
  id: string;
  role: 'INSTRUCTOR' | 'CHECKER';
  sections: string[];
  course: CreatedCourse;
};

type CourseCardMetric = {
  label: string;
  value: number | string;
  compact?: boolean;
};

type AnalyticsMetric = CourseCardMetric & {
  detail: string;
  icon: string;
  tone?: 'blue' | 'green' | 'amber' | 'slate';
};

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

function resolvePreviewImage(record?: CoursePreviewLesson | null) {
  if (!record) return DEFAULT_LESSON_IMAGE;

  const clean = (u?: string | null) => {
    if (!u) return null;
    const trimmed = u.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('/public/')) return trimmed.replace(/^\/public/, '');
    return trimmed;
  };

  const candidateUrls: (string | null | undefined)[] = [];

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

function resolveThumbnailUrl(course: CreatedCourse) {
  const candidate = course.lessons[0]?.thumbnailUrl?.trim();
  return candidate ? candidate : null;
}

function CreatedCourseCard({
  course,
  href,
  metrics,
}: {
  course: CreatedCourse;
  href?: string;
  metrics?: CourseCardMetric[];
}) {
  const thumbnailUrl = resolveThumbnailUrl(course);

  return (
    <Link
      href={href ?? `/courses/${course.id}`}
      className={`${courseStyles.courseCard} ${metrics?.length ? styles.courseCardWithMetrics : ''}`}
      data-testid="course-card"
      aria-label={`Open ${course.title}`}
    >
      <div className={courseStyles.courseMedia}>
        <CourseTileImage
          iconName={course.iconName}
          iconBgColor={course.iconBgColor}
          iconFgColor={course.iconFgColor}
          title={course.title}
          iconScale={0.38}
          fallback={
            thumbnailUrl ? (
              <Image
                src={thumbnailUrl}
                alt={`${course.title} preview`}
                fill
                sizes="(max-width: 768px) 100vw, 240px"
                className={courseStyles.courseImage}
              />
            ) : (
              <div className={courseStyles.coursePlaceholder} aria-hidden="true" />
            )
          }
        />
        <div className={courseStyles.courseCardOverlay}>
          <h3 className={courseStyles.courseCardTitle}>{course.title}</h3>
          <Icon icon="lucide:arrow-up-right" className={courseStyles.courseCardArrow} aria-hidden="true" />
        </div>
      </div>
      {metrics?.length ? (
        <div className={styles.courseCardMetrics} aria-label={`${course.title} analytics`}>
          {metrics.map((metric) => (
            <span
              key={metric.label}
              className={`${styles.courseCardMetric} ${metric.compact ? styles.courseCardMetricCompact : ''}`}
            >
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}

function enrollmentToCard(enrollment: EnrolledCourse): EnrolledCourseCardData {
  const course = enrollment.course;

  return {
    id: enrollment.id,
    courseId: course.id,
    title: course.title,
    image: resolvePreviewImage(course.lessons[0]),
    href: `/course_dashboard?courseId=${course.id}`,
    iconName: course.iconName,
    iconBgColor: course.iconBgColor,
    iconFgColor: course.iconFgColor,
  };
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();
  const signOut = useSignOut();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;

  const { data: studentData, refresh } = useStudentData(email);

  // One consolidated SWR-cached fetch replaces the three per-role fetches. The
  // single loading/error state applies to all sections, matching the prior
  // behaviour where the three calls always resolved together. Gated on Clerk
  // auth so we never fetch before the user is known to be signed in.
  const {
    data: myCourses,
    created,
    enrolled,
    checker,
    isLoading,
    error: fetchError,
    mutate: refreshCourses,
  } = useMyCourses(isLoaded && isSignedIn);
  const {
    data: dashboardAnalytics,
    isLoading: isLoadingDashboardAnalytics,
    error: dashboardAnalyticsError,
  } = useDashboardAnalytics(isLoaded && isSignedIn);
  const coursesError = fetchError
    ? fetchError instanceof Error
      ? fetchError.message
      : 'Unable to load courses.'
    : null;

  const isLoadingCreated = isLoading;
  const createdError = coursesError;
  const isLoadingEnrolled = isLoading;
  const enrolledError = coursesError;
  const isLoadingCheckerCourses = isLoading;
  const checkerCoursesError = coursesError;

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [activeCourseTab, setActiveCourseTab] = useState<CourseTab>('enrolled');
  useEffect(() => {
    const stored = window.localStorage.getItem(COURSE_TAB_STORAGE_KEY);
    if (stored && isCourseTab(stored)) setActiveCourseTab(stored);
  }, []);
  const selectCourseTab = useCallback((tab: CourseTab) => {
    setActiveCourseTab(tab);
    window.localStorage.setItem(COURSE_TAB_STORAGE_KEY, tab);
  }, []);
  const [activeSurvey, setActiveSurvey] = useState<{
    promptId: string;
    badgeId: string;
    badgeSlug: string | null;
    badgeName: string | null;
    question: string;
  } | null>(null);
  const [surveyRating, setSurveyRating] = useState(3);
  const [isSubmittingSurvey, setIsSubmittingSurvey] = useState(false);
  const [surveyError, setSurveyError] = useState<string | null>(null);
  const [isDuplicateOpen, setIsDuplicateOpen] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [joinStatus, setJoinStatus] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoiningCourse, setIsJoiningCourse] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  // Which entry point opened the join modal — drives the modal's copy. The
  // backend still resolves the actual role from whichever code is entered.
  const [joinMode, setJoinMode] = useState<'student' | 'checker'>('student');
  // True after a checker request is submitted (pending approval) — keeps the
  // modal open briefly to show the confirmation before it auto-closes.
  const [joinPending, setJoinPending] = useState(false);

  const openJoinModal = useCallback((mode: 'student' | 'checker') => {
    setJoinMode(mode);
    setJoinError(null);
    setJoinStatus(null);
    setJoinPending(false);
    setIsJoinModalOpen(true);
  }, []);

  const closeJoinModal = useCallback(() => {
    setIsJoinModalOpen(false);
    setJoinError(null);
    setJoinStatus(null);
    setJoinPending(false);
  }, []);

  // Auto-close the modal a few seconds after a pending checker request lands.
  useEffect(() => {
    if (!isJoinModalOpen || !joinPending || !joinStatus) return;
    const timer = setTimeout(() => closeJoinModal(), 3000);
    return () => clearTimeout(timer);
  }, [isJoinModalOpen, joinPending, joinStatus, closeJoinModal]);

  const navItems = SIDEBAR_NAV;
  const displayName = myCourses?.user.name || studentData?.student?.name || '';
  const assessmentAccessMessage = searchParams.get('assessmentMessage');
  const showAssessmentAccessModal = Boolean(searchParams.get('assessmentAccess'));

  const pendingSurveyBadges = useMemo(() => studentData?.surveys?.pendingBadge ?? [], [studentData]);

  // Finalization is the pass-path of IN_REVIEW: a passing attempt awaiting the
  // student's acknowledge + rating. Fail-path IN_REVIEW badges are handled on the
  // feedback page, not here.
  const readyForFinalization = useMemo(
    () => (studentData?.badges?.inReview ?? []).filter((badge) => badge.latestAttemptPassed === true),
    [studentData]
  );

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

  const createdCourses = useMemo<CreatedCourse[]>(() => created?.courses ?? [], [created]);
  const checkerEnrollments = useMemo<CheckerCourseEnrollment[]>(() => checker?.enrollments ?? [], [checker]);

  const enrolledCourseCards = useMemo(
    () => (enrolled?.enrollments ?? []).map((e: EnrolledCourse) => enrollmentToCard(e)),
    [enrolled]
  );

  const instructorAnalytics = useMemo<AnalyticsMetric[]>(
    () => [
      {
        label: 'Need assessment',
        value: dashboardAnalytics?.instructor.readyForAssessment ?? 0,
        detail: 'students ready for an in-person assessment',
        icon: 'lucide:clipboard-check',
        tone: 'amber',
      },
      {
        label: 'Awaiting student review',
        value: dashboardAnalytics?.instructor.awaitingStudentReview ?? 0,
        detail: 'assessments submitted with feedback to review',
        icon: 'lucide:message-square-text',
        tone: 'blue',
      },
      {
        label: 'Checker requests',
        value: dashboardAnalytics?.instructor.pendingCheckerRequests ?? 0,
        detail: 'pending checker access requests',
        icon: 'lucide:user-round-check',
        tone: 'green',
      },
      {
        label: 'Upcoming deadlines',
        value: dashboardAnalytics?.instructor.upcomingDeadlines ?? 0,
        detail: `lesson deadlines in the next ${dashboardAnalytics?.windowDays ?? 14} days`,
        icon: 'lucide:calendar-clock',
        tone: 'slate',
      },
    ],
    [dashboardAnalytics]
  );

  const enrolledAnalytics = useMemo<AnalyticsMetric[]>(
    () => [
      {
        label: 'Lessons to start',
        value: dashboardAnalytics?.student.lessonsNotStarted ?? 0,
        detail: 'assigned lessons not yet started',
        icon: 'lucide:play-circle',
        tone: 'amber',
      },
      {
        label: 'Continue learning',
        value: dashboardAnalytics?.student.lessonsInProgress ?? 0,
        detail: 'lessons currently in progress',
        icon: 'lucide:book-open-check',
        tone: 'blue',
      },
      {
        label: 'Ready for assessment',
        value: dashboardAnalytics?.student.readyForAssessment ?? 0,
        detail: 'badges ready for in-person assessment',
        icon: 'lucide:circle-check-big',
        tone: 'green',
      },
      {
        label: 'Due soon',
        value: dashboardAnalytics?.student.upcomingDeadlines ?? 0,
        detail: `${dashboardAnalytics?.student.overdueLessons ?? 0} overdue · next ${dashboardAnalytics?.windowDays ?? 14} days`,
        icon: 'lucide:calendar-clock',
        tone: dashboardAnalytics?.student.overdueLessons ? 'amber' : 'slate',
      },
    ],
    [dashboardAnalytics]
  );

  const checkerAnalytics = useMemo<AnalyticsMetric[]>(
    () => [
      {
        label: 'Need assessment',
        value: dashboardAnalytics?.checker.readyForAssessment ?? 0,
        detail: 'students ready within your assigned sections',
        icon: 'lucide:clipboard-check',
        tone: 'amber',
      },
      {
        label: 'Awaiting student review',
        value: dashboardAnalytics?.checker.awaitingStudentReview ?? 0,
        detail: 'submitted assessments awaiting acknowledgement',
        icon: 'lucide:message-square-text',
        tone: 'blue',
      },
      {
        label: 'Upcoming deadlines',
        value: dashboardAnalytics?.checker.upcomingDeadlines ?? 0,
        detail: `assigned-course deadlines in the next ${dashboardAnalytics?.windowDays ?? 14} days`,
        icon: 'lucide:calendar-clock',
        tone: 'slate',
      },
    ],
    [dashboardAnalytics]
  );
  void instructorAnalytics;
  void enrolledAnalytics;
  void checkerAnalytics;

  const isLoadingRoles = isLoadingCreated || isLoadingCheckerCourses || isLoadingEnrolled;
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/splash');
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    const slug = searchParams.get('surveyBadge');
    if (!slug) return;

    const target = pendingSurveyBadges.find((entry) => entry.badgeSlug === slug)?.badgeSlug ?? slug;
    router.replace(`/badges/${encodeURIComponent(target)}/feedback`);
  }, [pendingSurveyBadges, router, searchParams]);

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
      router.replace('/splash');
    } catch (error) {
      console.error('Failed to sign out', error);
      setIsSigningOut(false);
    }
  };

  const closeSurveyModal = useCallback(() => {
    setActiveSurvey(null);
    setSurveyError(null);

    const params = new URLSearchParams(searchParams.toString());
    params.delete('surveyBadge');
    const nextPath = params.size ? `${pathname}?${params.toString()}` : pathname;

    router.replace(nextPath, { scroll: false });
  }, [pathname, router, searchParams]);

  const closeAssessmentAccessModal = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('assessmentAccess');
    params.delete('assessmentMessage');
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
      if (!surveyTarget) return;

      router.push(
        surveyTarget.badgeSlug ? `/badges/${encodeURIComponent(surveyTarget.badgeSlug)}/feedback` : '/badges'
      );
    },
    [readyBadgeAlerts, router]
  );

  const handleSubmitSurvey = useCallback(async () => {
    if (!activeSurvey || !studentData?.student.email || isSubmittingSurvey) return;

    setIsSubmittingSurvey(true);
    setSurveyError(null);

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
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? 'Failed to submit survey.');
      }

      await refresh();
      closeSurveyModal();
    } catch (error) {
      console.error('Failed to submit survey', error);
      setSurveyError(error instanceof Error ? error.message : 'Failed to submit survey. Please try again.');
    } finally {
      setIsSubmittingSurvey(false);
    }
  }, [activeSurvey, surveyRating, studentData, refresh, closeSurveyModal, isSubmittingSurvey]);

  const handleDuplicateCourse = useCallback(
    async (courseId: string) => {
      setDuplicatingId(courseId);
      setDuplicateError(null);
      try {
        const response = await fetch(`/api/courses/${courseId}/duplicate`, { method: 'POST' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? 'Failed to duplicate course.');
        router.push(`/courses/${payload.course.id}`);
      } catch (error) {
        setDuplicateError(error instanceof Error ? error.message : 'Failed to duplicate course.');
        setDuplicatingId(null);
      }
    },
    [router]
  );

  const handleJoinCourse = useCallback(async () => {
    if (isJoiningCourse) return;

    setJoinError(null);
    setJoinStatus(null);

    const code = joinCode.trim();
    if (!code) {
      setJoinError('Enter a course code to join.');
      return;
    }

    setIsJoiningCourse(true);
    try {
      const response = await fetch('/api/courses/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ code }),
      });
      const payload = await response.json().catch(() => ({
        error: `Request failed: ${response.status}`,
      }));

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to join course.');
      }

      setJoinCode('');
      setJoinStatus(payload.message ?? `You joined ${payload.course?.title ?? 'the course'}.`);
      // Checker joins return a pending request — keep the modal open so the
      // confirmation is visible (it auto-closes after a few seconds). Direct
      // (student) joins close the modal right away.
      setJoinPending(Boolean(payload.pending));
      if (!payload.pending) {
        setIsJoinModalOpen(false);
      }
      await refreshCourses();
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Unable to join course.');
    } finally {
      setIsJoiningCourse(false);
    }
  }, [isJoiningCourse, joinCode, refreshCourses]);

  if (!isLoaded || !isSignedIn) return null;

  const renderEnrolledCourseCard = (course: EnrolledCourseCardData) => {
    const imageSrc = course.image ?? DEFAULT_LESSON_IMAGE;
    const isYouTubeThumb =
      imageSrc.includes('ytimg.com') || imageSrc.includes('youtube.com') || imageSrc.includes('img.youtube.com');
    const analytics = dashboardAnalytics?.byCourse?.student?.[course.courseId] ?? {};

    return (
      <Link
        key={course.id}
        href={course.href ?? '#'}
        className={`${courseStyles.courseCard} ${styles.courseCardWithMetrics}`}
        data-testid="enrolled-course-card"
        aria-label={`Open ${course.title}`}
      >
        <div className={courseStyles.courseMedia}>
          <CourseTileImage
            iconName={course.iconName}
            iconBgColor={course.iconBgColor}
            iconFgColor={course.iconFgColor}
            title={course.title}
            iconScale={0.38}
            fallback={
              isYouTubeThumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageSrc} alt={`${course.title} preview`} className={courseStyles.courseImage} />
              ) : (
                <Image
                  src={imageSrc}
                  alt={`${course.title} preview`}
                  fill
                  sizes="(max-width: 768px) 100vw, 240px"
                  className={courseStyles.courseImage}
                />
              )
            }
          />
          <div className={courseStyles.courseCardOverlay}>
            <h3 className={courseStyles.courseCardTitle}>{course.title}</h3>
            <Icon icon="lucide:arrow-up-right" className={courseStyles.courseCardArrow} aria-hidden="true" />
          </div>
        </div>
        {!isLoadingDashboardAnalytics ? (
          <div className={styles.courseCardMetrics} aria-label={`${course.title} analytics`}>
            <span className={styles.courseCardMetric}>
              <strong>{analytics.lessonsNotStarted ?? 0}</strong>
              <span>Not started</span>
            </span>
            <span className={styles.courseCardMetric}>
              <strong>{analytics.lessonsInProgress ?? 0}</strong>
              <span>In progress</span>
            </span>
            <span className={styles.courseCardMetric}>
              <strong>{analytics.lessonsCompleted ?? 0}</strong>
              <span>Completed</span>
            </span>
          </div>
        ) : null}
      </Link>
    );
  };

  return (
    <div className={`page ${styles.page}`}>
      <Sidebar navItems={navItems} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={`main ${styles.main}`}>
        <header className={styles.welcomeHeader}>
          <h1 className="page-heading">Dashboard</h1>
          <p className={styles.welcomeSubtitle}>Manage the courses you teach, take, and review.</p>
        </header>

        {readyBadgeAlerts.length > 0 ? (
          <div className={styles.topRow}>
            <div className={styles.alertWrapper}>
              <div className={styles.alert} data-active="true" onClick={() => handleStartSurvey()}>
                <Image
                  src="/assets/survey_alarm/survey_alarm_x_icon.png"
                  alt="Survey reminder"
                  className={styles.alertIcon}
                  width={24}
                  height={24}
                />
                <span className={styles.alertText}>
                  {readyBadgeAlerts.length === 1
                    ? `Review feedback for ${readyBadgeAlerts[0]?.badgeName ?? 'your badge'} to finalize it.`
                    : `You have ${readyBadgeAlerts.length} badges ready to finalize. Review them to finish.`}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        <section className={styles.courseWorkspace} aria-label="Courses by permission">
          <div className={styles.courseTabs} role="tablist" aria-label="Course permissions">
            {(
              [
                { id: 'enrolled', label: 'Student', icon: 'lucide:user-round', count: enrolledCourseCards.length },
                { id: 'checker', label: 'Checker', icon: 'lucide:shield-check', count: checkerEnrollments.length },
                { id: 'instructor', label: 'Instructor', icon: 'lucide:graduation-cap', count: createdCourses.length },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`course-tab-${tab.id}`}
                aria-selected={activeCourseTab === tab.id}
                aria-controls={`course-panel-${tab.id}`}
                className={`${styles.courseTab} ${activeCourseTab === tab.id ? styles.courseTabActive : ''}`}
                onClick={() => selectCourseTab(tab.id)}
              >
                <Icon icon={tab.icon} className={styles.courseTabIcon} aria-hidden="true" />
                <span>{tab.label}</span>
                <span className={styles.courseTabCount}>{isLoadingRoles ? '—' : tab.count}</span>
              </button>
            ))}
          </div>

          <div
            className={styles.coursePanel}
            role="tabpanel"
            id={`course-panel-${activeCourseTab}`}
            aria-labelledby={`course-tab-${activeCourseTab}`}
          >
            <div className={styles.coursePanelHeader}>
              <div>
                <h2 className={styles.coursePanelTitle}>
                  {activeCourseTab === 'instructor'
                    ? 'Courses you teach'
                    : activeCourseTab === 'enrolled'
                      ? 'Courses you take'
                      : 'Courses you review'}
                </h2>
                <p className={styles.coursePanelDescription}>
                  {activeCourseTab === 'instructor'
                    ? 'Create, organize, and manage your course content.'
                    : activeCourseTab === 'enrolled'
                      ? 'Continue learning in courses where you are enrolled.'
                      : 'Open courses where you support assessment and feedback.'}
                </p>
              </div>

              <div className={styles.courseActions}>
                {activeCourseTab === 'instructor' ? (
                  <>
                    <Link href="/courses/new" className={styles.primaryCourseAction} data-testid="add-course-card">
                      <Icon icon="lucide:plus" aria-hidden="true" />
                      Create course
                    </Link>
                    <button
                      type="button"
                      className={styles.secondaryCourseAction}
                      onClick={() => {
                        setDuplicateError(null);
                        setIsDuplicateOpen(true);
                      }}
                    >
                      <Icon icon="lucide:copy" aria-hidden="true" />
                      Duplicate
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={styles.primaryCourseAction}
                    data-testid={activeCourseTab === 'enrolled' ? 'join-course-card' : undefined}
                    onClick={() => openJoinModal(activeCourseTab === 'checker' ? 'checker' : 'student')}
                  >
                    <Icon icon="lucide:log-in" aria-hidden="true" />
                    Join course
                  </button>
                )}
              </div>
            </div>

            {!isLoadingDashboardAnalytics && dashboardAnalyticsError ? (
              <p className={styles.analyticsError}>
                Action items could not be loaded. Your course list is still available.
              </p>
            ) : null}

            {activeCourseTab === 'instructor' ? (
              <>
                <div className={styles.myCoursesGrid} data-testid="created-courses-grid">
                  {createdCourses.map((course) => (
                    <CreatedCourseCard
                      key={course.id}
                      course={course}
                      metrics={
                        isLoadingDashboardAnalytics
                          ? undefined
                          : [
                              {
                                label: 'Students enrolled',
                                value: dashboardAnalytics?.byCourse?.instructor?.[course.id]?.students ?? 0,
                              },
                              {
                                label: 'Checkers enrolled',
                                value: dashboardAnalytics?.byCourse?.instructor?.[course.id]?.checkers ?? 0,
                              },
                              {
                                label: 'Badges active',
                                value: dashboardAnalytics?.byCourse?.instructor?.[course.id]?.activeBadges ?? 0,
                              },
                              {
                                label: 'Date created',
                                value: formatCourseCreatedDate(course.createdAt),
                                compact: true,
                              },
                            ]
                      }
                    />
                  ))}
                </div>
                {isLoadingCreated ? <p className={courseStyles.statusMessage}>Loading instructor courses…</p> : null}
                {!isLoadingCreated && createdError ? (
                  <p className={courseStyles.statusMessage}>{createdError}</p>
                ) : null}
                {!isLoadingCreated && !createdError && createdCourses.length === 0 ? (
                  <div className={styles.courseEmptyState}>
                    <Icon icon="lucide:book-open" aria-hidden="true" />
                    <h3>No instructor courses yet</h3>
                    <p>Create your first course to start building lessons and badges.</p>
                  </div>
                ) : null}
              </>
            ) : null}

            {activeCourseTab === 'enrolled' ? (
              isLoadingEnrolled ? (
                <div className={styles.courseEmptyState}>Loading enrolled courses…</div>
              ) : enrolledError ? (
                <div className={styles.courseEmptyState}>{enrolledError}</div>
              ) : enrolledCourseCards.length > 0 ? (
                <>
                  <div className={styles.myCoursesGrid}>{enrolledCourseCards.map(renderEnrolledCourseCard)}</div>
                  {joinStatus && !isJoinModalOpen ? <p className={styles.joinStatus}>{joinStatus}</p> : null}
                </>
              ) : (
                <div className={styles.courseEmptyState}>
                  <Icon icon="lucide:book-open" aria-hidden="true" />
                  <h3>No enrolled courses yet</h3>
                  <p>Use a course code from your instructor to join a course.</p>
                </div>
              )
            ) : null}

            {activeCourseTab === 'checker' ? (
              <>
                {checkerEnrollments.length > 0 ? (
                  <div className={styles.myCoursesGrid} data-testid="checker-courses-grid">
                    {checkerEnrollments.map((enrollment) => (
                      <CreatedCourseCard
                        key={enrollment.id}
                        course={enrollment.course}
                        href={`/courses/${enrollment.course.id}?view=checker`}
                        metrics={
                          isLoadingDashboardAnalytics
                            ? undefined
                            : [
                                {
                                  label: 'Assigned sections',
                                  value: dashboardAnalytics?.byCourse?.checker?.[enrollment.course.id]?.sections ?? 0,
                                },
                                {
                                  label: 'Students to assess',
                                  value:
                                    dashboardAnalytics?.byCourse?.checker?.[enrollment.course.id]?.studentsToAssess ??
                                    0,
                                },
                                {
                                  label: 'Badges active',
                                  value:
                                    dashboardAnalytics?.byCourse?.checker?.[enrollment.course.id]?.activeBadges ?? 0,
                                },
                              ]
                        }
                      />
                    ))}
                  </div>
                ) : null}
                {isLoadingCheckerCourses ? (
                  <p className={courseStyles.statusMessage}>Loading checker courses…</p>
                ) : null}
                {!isLoadingCheckerCourses && checkerCoursesError ? (
                  <p className={courseStyles.statusMessage}>{checkerCoursesError}</p>
                ) : null}
                {!isLoadingCheckerCourses && !checkerCoursesError && checkerEnrollments.length === 0 ? (
                  <div className={styles.courseEmptyState}>
                    <Icon icon="lucide:shield-check" aria-hidden="true" />
                    <h3>No checker courses yet</h3>
                    <p>Join with a checker code to request access to a course.</p>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </section>
      </main>

      {isDuplicateOpen ? (
        <div className={styles.surveyOverlay} role="dialog" aria-modal="true" aria-label="Duplicate course">
          <div className={styles.dupModal}>
            <div className={styles.modalHeader}>
              <div className={styles.modalHeadingGroup}>
                <span className={styles.modalIcon} aria-hidden="true">
                  <Icon icon="lucide:copy" />
                </span>
                <div>
                  <h2 className={styles.dupHeader}>Duplicate a course</h2>
                  <p className={styles.dupSubhead}>
                    Copy lessons and badges into a new course. Students and progress stay with the original.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={styles.modalCloseButton}
                aria-label="Close duplicate course modal"
                onClick={() => setIsDuplicateOpen(false)}
                disabled={duplicatingId !== null}
              >
                <Icon icon="lucide:x" aria-hidden="true" />
              </button>
            </div>

            {duplicateError ? <p className={styles.dupError}>{duplicateError}</p> : null}

            <div className={styles.dupList}>
              {createdCourses.length === 0 ? (
                <p className={styles.dupSubhead}>You haven&apos;t created any courses to duplicate yet.</p>
              ) : (
                createdCourses.map((course) => (
                  <div key={course.id} className={styles.dupItem}>
                    <span className={styles.dupItemIdentity}>
                      <span className={styles.dupItemIcon} aria-hidden="true">
                        <Icon icon="lucide:book-open" />
                      </span>
                      <span className={styles.dupItemTitle}>{course.title}</span>
                    </span>
                    <button
                      type="button"
                      className={styles.dupItemButton}
                      disabled={duplicatingId !== null}
                      onClick={() => handleDuplicateCourse(course.id)}
                    >
                      <Icon
                        icon={duplicatingId === course.id ? 'lucide:loader-circle' : 'lucide:copy'}
                        aria-hidden="true"
                      />
                      {duplicatingId === course.id ? 'Duplicating…' : 'Duplicate'}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.modalSecondaryButton}
                onClick={() => setIsDuplicateOpen(false)}
                disabled={duplicatingId !== null}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isJoinModalOpen ? (
        <div className={styles.surveyOverlay} role="dialog" aria-modal="true" aria-labelledby="join-modal-title">
          <div className={styles.joinModal}>
            <div className={styles.modalHeader}>
              <div className={styles.modalHeadingGroup}>
                <span className={styles.modalIcon} aria-hidden="true">
                  <Icon icon={joinMode === 'checker' ? 'lucide:shield-check' : 'lucide:log-in'} />
                </span>
                <div>
                  <h2 id="join-modal-title" className={styles.joinModalTitle}>
                    {joinMode === 'checker' ? 'Join as a checker' : 'Join a course'}
                  </h2>
                  <p className={styles.joinModalHint}>
                    {joinMode === 'checker'
                      ? 'Enter the checker code your instructor shared. Your request will be sent for approval.'
                      : 'Enter the course code your instructor shared to enroll as a student.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={styles.modalCloseButton}
                aria-label="Close join course modal"
                disabled={isJoiningCourse}
                onClick={closeJoinModal}
              >
                <Icon icon="lucide:x" aria-hidden="true" />
              </button>
            </div>
            <div className={styles.joinControls}>
              <label className={styles.joinLabel} htmlFor="join-course-code">
                {joinMode === 'checker' ? 'Checker code' : 'Course code'}
              </label>
              <div className={styles.joinInputShell}>
                <Icon icon="lucide:key-round" aria-hidden="true" />
                <input
                  id="join-course-code"
                  type="text"
                  className={styles.joinInput}
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value)}
                  placeholder={joinMode === 'checker' ? 'Enter checker code' : 'Enter course code'}
                  aria-label={joinMode === 'checker' ? 'Checker code' : 'Course code'}
                  disabled={isJoiningCourse}
                  autoFocus
                />
              </div>
            </div>
            {joinError ? <p className={styles.joinError}>{joinError}</p> : null}
            {joinStatus ? <p className={styles.joinStatus}>{joinStatus}</p> : null}
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.modalSecondaryButton}
                disabled={isJoiningCourse}
                onClick={closeJoinModal}
              >
                {joinStatus ? 'Done' : 'Cancel'}
              </button>
              {!joinStatus ? (
                <button
                  type="button"
                  className={styles.modalPrimaryButton}
                  onClick={handleJoinCourse}
                  disabled={isJoiningCourse}
                >
                  <Icon icon={isJoiningCourse ? 'lucide:loader-circle' : 'lucide:log-in'} aria-hidden="true" />
                  {isJoiningCourse ? 'Joining…' : 'Join course'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showAssessmentAccessModal ? (
        <div className={styles.surveyOverlay} role="dialog" aria-modal="true" aria-label="Assessment access">
          <div className={styles.accessModal}>
            <h2 className={styles.accessTitle}>Assessment unavailable</h2>
            <p className={styles.accessText}>
              {assessmentAccessMessage ||
                'You are not authorized to assess this badge, or the badge is not ready for assessment yet.'}
            </p>
            <BackButton inline label="Back to home" onClick={closeAssessmentAccessModal} />
          </div>
        </div>
      ) : null}

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
          isSubmitting={isSubmittingSurvey}
          error={surveyError}
          errorAfterOptions
          classNames={{
            overlay: styles.surveyOverlay,
            modal: styles.surveyModal,
            close: styles.surveyClose,
            title: styles.surveyTitle,
            question: styles.surveyQuestion,
            error: styles.surveyError,
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

export default function Page() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
