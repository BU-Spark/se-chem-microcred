'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useMyCourses } from './hooks/useMyCourses';
import { useCanCreateContent } from './hooks/useCanCreateContent';
import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
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
import BackButton from '@/app/components/BackButton/BackButton';
import CourseTileImage from '@/app/components/Courses/CourseTileImage';
import type { CourseImageFields } from '@/lib/courseImage';

interface EnrolledCourseCardData extends CourseImageFields {
  id: string;
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

type AssessorCourseEnrollment = {
  id: string;
  role: 'INSTRUCTOR' | 'CHECKER';
  sections: string[];
  course: CreatedCourse;
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

function CreatedCourseCard({ course, href }: { course: CreatedCourse; href?: string }) {
  const thumbnailUrl = resolveThumbnailUrl(course);

  return (
    <Link
      href={href ?? `/courses/${course.id}`}
      className={courseStyles.courseCard}
      data-testid="course-card"
      aria-label={`Open ${course.title}`}
    >
      <div className={courseStyles.courseMedia}>
        <CourseTileImage
          iconName={course.iconName}
          iconBgColor={course.iconBgColor}
          iconFgColor={course.iconFgColor}
          title={course.title}
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
      </div>

      <div className={courseStyles.courseText}>
        <h3 className={courseStyles.courseTitle}>{course.title}</h3>
      </div>
    </Link>
  );
}

function AddCourseCard() {
  return (
    <Link href="/courses/new" className={styles.addTile} data-testid="add-course-card" aria-label="Create a course">
      <div className={styles.addTileMedia}>
        <span className={styles.addTilePlus}>+</span>
      </div>
      <p className={styles.addTileLabel}>Create a Course</p>
    </Link>
  );
}

function enrollmentToCard(enrollment: EnrolledCourse): EnrolledCourseCardData {
  const course = enrollment.course;

  return {
    id: enrollment.id,
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
  const { signOut } = useAuth();
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
    assessor,
    isLoading,
    error: fetchError,
    mutate: refreshCourses,
  } = useMyCourses(isLoaded && isSignedIn);
  const { canCreateContent } = useCanCreateContent(isLoaded && isSignedIn);
  const coursesError = fetchError
    ? fetchError instanceof Error
      ? fetchError.message
      : 'Unable to load courses.'
    : null;

  const isLoadingCreated = isLoading;
  const createdError = coursesError;
  const isLoadingEnrolled = isLoading;
  const enrolledError = coursesError;
  const isLoadingAssessorCourses = isLoading;
  const assessorCoursesError = coursesError;

  const [isSigningOut, setIsSigningOut] = useState(false);
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
  const [joinMode, setJoinMode] = useState<'student' | 'assessor'>('student');
  // True after an assessor request is submitted (pending approval) — keeps the
  // modal open briefly to show the confirmation before it auto-closes.
  const [joinPending, setJoinPending] = useState(false);

  const openJoinModal = useCallback((mode: 'student' | 'assessor') => {
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

  // Auto-close the modal a few seconds after a pending assessor request lands.
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

  const createdCourses = useMemo<CreatedCourse[]>(() => created?.courses ?? [], [created]);
  const assessorEnrollments = useMemo<AssessorCourseEnrollment[]>(() => assessor?.enrollments ?? [], [assessor]);

  const enrolledCourseCards = useMemo(
    () => (enrolled?.enrollments ?? []).map((e: EnrolledCourse) => enrollmentToCard(e)),
    [enrolled]
  );

  // Role gating: the three course endpoints already segment by role, so data presence
  // is a reliable signal for which sections to surface.
  const hasCreated = createdCourses.length > 0;
  const hasAssessor = assessorEnrollments.length > 0;
  const hasEnrolled = enrolledCourseCards.length > 0;
  const isLoadingRoles = isLoadingCreated || isLoadingAssessorCourses || isLoadingEnrolled;
  // Instructors (and brand-new users with no role context) see "My Courses".
  const showMyCourses = hasCreated || (!hasAssessor && !hasEnrolled);
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/splash');
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    const slug = searchParams.get('surveyBadge');
    if (!slug) return;

    const match = pendingSurveyBadges.find((e) => e.badgeSlug === slug) ?? pendingSurveyBadges[0] ?? null;

    if (match) {
      setActiveSurvey(match);
      setSurveyRating(3);
      setSurveyError(null);
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
      setSurveyError(null);

      const params = new URLSearchParams(searchParams.toString());
      if (surveyTarget.badgeSlug) {
        params.set('surveyBadge', surveyTarget.badgeSlug);
      }

      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [readyBadgeAlerts, pathname, router, searchParams]
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
      // Assessor joins return a pending request — keep the modal open so the
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

    return (
      <Link
        key={course.id}
        href={course.href ?? '#'}
        className={courseStyles.courseCard}
        data-testid="enrolled-course-card"
        aria-label={`Open ${course.title}`}
      >
        <div className={courseStyles.courseMedia}>
          <CourseTileImage
            iconName={course.iconName}
            iconBgColor={course.iconBgColor}
            iconFgColor={course.iconFgColor}
            title={course.title}
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
        </div>

        <div className={courseStyles.courseText}>
          <h3 className={courseStyles.courseTitle}>{course.title}</h3>
        </div>
      </Link>
    );
  };

  return (
    <div className={`page ${styles.page}`}>
      <Sidebar navItems={navItems} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={`main ${styles.main}`}>
        <header className={styles.welcomeHeader}>
          <h1 className={styles.welcomeTitle}>Welcome, {displayName || 'Professor'}</h1>
          <p className={styles.welcomeSubtitle}>
            {isLoadingRoles
              ? 'Loading your courses…'
              : showMyCourses
                ? hasCreated
                  ? `You have ${createdCourses.length} course${createdCourses.length === 1 ? '' : 's'}.`
                  : 'You have no existing courses.'
                : hasEnrolled
                  ? `You are enrolled in ${enrolledCourseCards.length} course${enrolledCourseCards.length === 1 ? '' : 's'}.`
                  : `You are assessing ${assessorEnrollments.length} course${assessorEnrollments.length === 1 ? '' : 's'}.`}
          </p>
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
                    ? `Complete feedback for ${readyBadgeAlerts[0]?.badgeName ?? 'your badge'} to finalize it.`
                    : `You have ${readyBadgeAlerts.length} badges ready to finalize. Start the surveys to finish.`}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {/* All three role sections are shown together on Home — the client validated this
            combined professor/assessor/student view, so we intentionally do not role-gate them. */}
        <section className={courseStyles.section}>
          <div className={styles.sectionHeaderRow}>
            <h2 className={courseStyles.sectionTitle}>Instructor Courses</h2>
            <button
              type="button"
              className={styles.duplicateButton}
              aria-label="Duplicate course"
              onClick={() => {
                setDuplicateError(null);
                setIsDuplicateOpen(true);
              }}
            >
              <svg className={styles.duplicateIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="8" y="8" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
                <path d="M4 15.5V5a2 2 0 0 1 2-2h9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Duplicate Course
            </button>
          </div>

          <div className={styles.myCoursesGrid} data-testid="created-courses-grid">
            {canCreateContent ? <AddCourseCard /> : null}
            {createdCourses.map((course) => (
              <CreatedCourseCard key={course.id} course={course} />
            ))}
          </div>

          {isLoadingCreated ? <p className={courseStyles.statusMessage}>Loading created courses…</p> : null}

          {!isLoadingCreated && createdError ? <p className={courseStyles.statusMessage}>{createdError}</p> : null}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeaderRow}>
            <h2 className={courseStyles.sectionTitle}>My Enrolled Courses</h2>
            <button
              type="button"
              className={styles.joinButton}
              data-testid="join-course-card"
              aria-label="Join a course as a student"
              onClick={() => openJoinModal('student')}
            >
              <span className={styles.joinPlus} aria-hidden="true">
                +
              </span>
              Join
            </button>
          </div>

          {isLoadingEnrolled ? (
            <div className={styles.emptyState}>Loading enrolled courses…</div>
          ) : enrolledError ? (
            <div className={styles.emptyState}>{enrolledError}</div>
          ) : (
            <>
              <div className={styles.myCoursesGrid}>{enrolledCourseCards.map(renderEnrolledCourseCard)}</div>
              {joinStatus && !isJoinModalOpen ? <p className={styles.joinStatus}>{joinStatus}</p> : null}
            </>
          )}
        </section>

        <section className={courseStyles.section}>
          <div className={styles.sectionHeaderRow}>
            <h2 className={courseStyles.sectionTitle}>Assessor Courses</h2>
            <button
              type="button"
              className={styles.joinButton}
              aria-label="Join a course as an assessor"
              onClick={() => openJoinModal('assessor')}
            >
              <span className={styles.joinPlus} aria-hidden="true">
                +
              </span>
              Join
            </button>
          </div>

          <div className={styles.myCoursesGrid} data-testid="assessor-courses-grid">
            {assessorEnrollments.map((enrollment) => (
              <CreatedCourseCard
                key={enrollment.id}
                course={enrollment.course}
                href={`/courses/${enrollment.course.id}?view=assessor`}
              />
            ))}
          </div>

          {isLoadingAssessorCourses ? <p className={courseStyles.statusMessage}>Loading assessor courses...</p> : null}

          {!isLoadingAssessorCourses && assessorCoursesError ? (
            <p className={courseStyles.statusMessage}>{assessorCoursesError}</p>
          ) : null}

          {!isLoadingAssessorCourses && !assessorCoursesError && assessorEnrollments.length === 0 ? (
            <p className={courseStyles.statusMessage}>No assessor courses assigned yet.</p>
          ) : null}
        </section>
      </main>

      {isDuplicateOpen ? (
        <div className={styles.surveyOverlay} role="dialog" aria-modal="true" aria-label="Duplicate course">
          <div className={styles.dupModal}>
            <h2 className={styles.dupHeader}>Duplicate a course</h2>
            <p className={styles.dupSubhead}>
              Pick a course to copy. A new course is created with the same lessons and badges — students and progress
              are not copied.
            </p>

            {duplicateError ? <p className={styles.dupError}>{duplicateError}</p> : null}

            <div className={styles.dupList}>
              {createdCourses.length === 0 ? (
                <p className={styles.dupSubhead}>You haven&apos;t created any courses to duplicate yet.</p>
              ) : (
                createdCourses.map((course) => (
                  <div key={course.id} className={styles.dupItem}>
                    <span className={styles.dupItemTitle}>{course.title}</span>
                    <button
                      type="button"
                      className={styles.dupItemButton}
                      disabled={duplicatingId !== null}
                      onClick={() => handleDuplicateCourse(course.id)}
                    >
                      {duplicatingId === course.id ? 'Duplicating…' : 'Duplicate'}
                    </button>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              className={styles.dupClose}
              onClick={() => setIsDuplicateOpen(false)}
              disabled={duplicatingId !== null}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {isJoinModalOpen ? (
        <div className={styles.surveyOverlay} role="dialog" aria-modal="true" aria-labelledby="join-modal-title">
          <div className={styles.joinModal}>
            <h2 id="join-modal-title" className={styles.joinModalTitle}>
              {joinMode === 'assessor' ? 'Join as an assessor' : 'Join a course'}
            </h2>
            <p className={styles.joinModalHint}>
              {joinMode === 'assessor'
                ? 'Enter the assessor code your instructor shared. Your request is sent to the instructor for approval.'
                : 'Enter the course code your instructor shared to enroll as a student.'}
            </p>
            <div className={styles.joinControls}>
              <input
                type="text"
                className={styles.joinInput}
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder={joinMode === 'assessor' ? 'Enter assessor code' : 'Enter course code'}
                aria-label={joinMode === 'assessor' ? 'Assessor code' : 'Course code'}
                disabled={isJoiningCourse}
                autoFocus
              />
              <button type="button" className={styles.joinButton} onClick={handleJoinCourse} disabled={isJoiningCourse}>
                {isJoiningCourse ? 'Joining...' : 'Join'}
              </button>
            </div>
            {joinError ? <p className={styles.joinError}>{joinError}</p> : null}
            {joinStatus ? <p className={styles.joinStatus}>{joinStatus}</p> : null}
            <button type="button" className={styles.joinCancel} disabled={isJoiningCourse} onClick={closeJoinModal}>
              {joinStatus ? 'Done' : 'Cancel'}
            </button>
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

            {surveyError ? (
              <p className={styles.surveyError} role="alert">
                {surveyError}
              </p>
            ) : null}

            <button
              type="button"
              className={styles.surveySubmit}
              onClick={handleSubmitSurvey}
              disabled={isSubmittingSurvey}
            >
              {isSubmittingSurvey ? 'Submitting…' : 'Submit'}
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
