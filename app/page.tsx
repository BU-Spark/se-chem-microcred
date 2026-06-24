'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
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
import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';

interface EnrolledCourseCardData {
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

type EnrollmentSummary = {
  id: string;
  role: 'STUDENT' | 'INSTRUCTOR' | 'CHECKER';
};

type CreatedCourse = {
  id: string;
  title: string;
  description: string | null;
  section: string | null;
  sectionCount: number;
  createdAt: string;
  lessons: Array<{
    thumbnailUrl: string | null;
  }>;
  enrollments: EnrollmentSummary[];
};

type CreatedCoursesResponse = {
  user: {
    name: string | null;
    email: string;
  };
  count: number;
  courses: CreatedCourse[];
};

type EnrolledCourse = {
  id: string;
  role: 'STUDENT' | 'INSTRUCTOR' | 'CHECKER';
  course: {
    id: string;
    code: string;
    section: string | null;
    title: string;
    description: string | null;
    contacts: CourseContact[];
    lessons: CoursePreviewLesson[];
  };
};

type EnrolledCoursesResponse = {
  user: {
    name: string | null;
    email: string;
  };
  count: number;
  enrollments: EnrolledCourse[];
};

type AssessorCourseEnrollment = {
  id: string;
  role: 'INSTRUCTOR' | 'CHECKER';
  sections: string[];
  course: CreatedCourse;
};

type AssessorCoursesResponse = {
  user: {
    name: string | null;
    email: string;
  };
  count: number;
  enrollments: AssessorCourseEnrollment[];
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

function useCreatedCourses(email?: string | null) {
  const [data, setData] = useState<CreatedCoursesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!email) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/courses/created?email=${encodeURIComponent(email)}`, {
        headers: { Accept: 'application/json' },
      });

      const payload = await response.json().catch(() => ({ error: `Request failed: ${response.status}` }));

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to load created courses.');
      }

      setData(payload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Unable to load created courses.');
    } finally {
      setIsLoading(false);
    }
  }, [email]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, isLoading, error };
}

function useEnrolledCourses(email?: string | null) {
  const [data, setData] = useState<EnrolledCoursesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!email) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/courses/enrolled?email=${encodeURIComponent(email)}`, {
        headers: { Accept: 'application/json' },
      });

      const payload = await response.json().catch(() => ({ error: `Request failed: ${response.status}` }));

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to load enrolled courses.');
      }

      setData(payload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Unable to load enrolled courses.');
    } finally {
      setIsLoading(false);
    }
  }, [email]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, isLoading, error };
}

function useAssessorCourses(email?: string | null) {
  const [data, setData] = useState<AssessorCoursesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!email) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/courses/assessor?email=${encodeURIComponent(email)}`, {
        headers: { Accept: 'application/json' },
      });

      const payload = await response.json().catch(() => ({ error: `Request failed: ${response.status}` }));

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to load assessor courses.');
      }

      setData(payload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Unable to load assessor courses.');
    } finally {
      setIsLoading(false);
    }
  }, [email]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, isLoading, error };
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
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={`${course.title} preview`}
            fill
            sizes="(max-width: 768px) 100vw, 240px"
            className={courseStyles.courseImage}
          />
        ) : (
          <div className={courseStyles.coursePlaceholder} aria-hidden="true" />
        )}
      </div>

      <div className={courseStyles.courseText}>
        <h3 className={courseStyles.courseTitle}>{course.title}</h3>
      </div>
    </Link>
  );
}

function AddCourseCard() {
  return (
    <Link
      href="/courses/new"
      className={courseStyles.addCourseCard}
      data-testid="add-course-card"
      aria-label="Add course"
    >
      <div className={courseStyles.addCourseMedia}>
        <span className={courseStyles.addCoursePlus}>+</span>
      </div>
      <div className={courseStyles.addCourseText}>
        <h3 className={courseStyles.courseTitle}>Add Course</h3>
        <p className={courseStyles.courseMeta}>Create a course</p>
      </div>
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
  const { data: createdData, isLoading: isLoadingCreated, error: createdError } = useCreatedCourses(email);
  const { data: enrolledData, isLoading: isLoadingEnrolled, error: enrolledError } = useEnrolledCourses(email);
  const {
    data: assessorData,
    isLoading: isLoadingAssessorCourses,
    error: assessorCoursesError,
  } = useAssessorCourses(email);

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
  const displayName =
    createdData?.user.name || enrolledData?.user.name || assessorData?.user.name || studentData?.student?.name || '';

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

  const createdCourses = useMemo(() => createdData?.courses ?? [], [createdData]);
  const assessorEnrollments = useMemo(() => assessorData?.enrollments ?? [], [assessorData]);

  const enrolledCourseCards = useMemo(() => enrolledData?.enrollments.map(enrollmentToCard) ?? [], [enrolledData]);

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
          {isYouTubeThumb ? (
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
          )}
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

        <section className={courseStyles.section}>
          <h2 className={courseStyles.sectionTitle}>My Courses</h2>

          <div className={courseStyles.courseGrid} data-testid="created-courses-grid">
            <AddCourseCard />
            {createdCourses.map((course) => (
              <CreatedCourseCard key={course.id} course={course} />
            ))}
          </div>

          {isLoadingCreated ? <p className={courseStyles.statusMessage}>Loading created courses…</p> : null}

          {!isLoadingCreated && createdError ? <p className={courseStyles.statusMessage}>{createdError}</p> : null}

          {!isLoadingCreated && !createdError && createdCourses.length === 0 ? (
            <p className={courseStyles.statusMessage}>No courses yet. Add one from the first card.</p>
          ) : null}
        </section>

        <section className={courseStyles.section}>
          <h2 className={courseStyles.sectionTitle}>Assessor Courses</h2>

          <div className={courseStyles.courseGrid} data-testid="assessor-courses-grid">
            {assessorEnrollments.map((enrollment) => (
              <CreatedCourseCard
                key={enrollment.id}
                course={enrollment.course}
                href={`/courses/${enrollment.course.id}?view=assessor`}
              />
            ))}
          </div>

          {isLoadingAssessorCourses ? (
            <p className={courseStyles.statusMessage}>Loading assessor courses...</p>
          ) : null}

          {!isLoadingAssessorCourses && assessorCoursesError ? (
            <p className={courseStyles.statusMessage}>{assessorCoursesError}</p>
          ) : null}

          {!isLoadingAssessorCourses && !assessorCoursesError && assessorEnrollments.length === 0 ? (
            <p className={courseStyles.statusMessage}>No assessor courses assigned yet.</p>
          ) : null}
        </section>

        <section className={styles.section}>
          <h2 className={courseStyles.sectionTitle}>My Enrolled Courses</h2>

          {isLoadingEnrolled ? (
            <div className={styles.emptyState}>Loading enrolled courses…</div>
          ) : enrolledError ? (
            <div className={styles.emptyState}>{enrolledError}</div>
          ) : enrolledCourseCards.length === 0 ? (
            <div className={styles.emptyState}>You are not enrolled in any courses yet.</div>
          ) : (
            <div className={courseStyles.courseGrid}>{enrolledCourseCards.map(renderEnrolledCourseCard)}</div>
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
