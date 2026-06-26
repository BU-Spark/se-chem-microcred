'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';

import Sidebar, { SIDEBAR_NAV } from '../_components/Sidebar';
import { useMyCourses } from '../hooks/useMyCourses';
import styles from './page.module.css';

type CourseLessonPreview = {
  thumbnailUrl: string | null;
};

type CreatedCourse = {
  id: string;
  title: string;
  description: string | null;
  section: string | null;
  sectionCount: number;
  createdAt: string;
  lessons: CourseLessonPreview[];
};

type AssessorCourseEnrollment = {
  id: string;
  role: 'INSTRUCTOR' | 'CHECKER';
  sections: string[];
  course: CreatedCourse;
};

type EnrolledCourse = {
  id: string;
  role: 'STUDENT' | 'INSTRUCTOR' | 'CHECKER';
  course: {
    id: string;
    title: string;
    lessons: Array<{
      thumbnailUrl: string | null;
      segments?: Array<{
        videoUrl: string | null;
        thumbnailUrl: string | null;
      }>;
    }>;
  };
};

function resolveThumbnailUrl(course: CreatedCourse) {
  const candidate = course.lessons[0]?.thumbnailUrl?.trim();
  return candidate ? candidate : null;
}

function CourseCard({ course, href }: { course: CreatedCourse; href?: string }) {
  const thumbnailUrl = resolveThumbnailUrl(course);

  return (
    <Link
      href={href ?? `/courses/${course.id}`}
      className={styles.courseCard}
      data-testid="course-card"
      aria-label={`Open ${course.title}`}
    >
      <div className={styles.courseMedia}>
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={`${course.title} preview`}
            fill
            sizes="(max-width: 768px) 100vw, 240px"
            className={styles.courseImage}
          />
        ) : (
          <div className={styles.coursePlaceholder} aria-hidden="true" />
        )}
      </div>

      <div className={styles.courseText}>
        <h3 className={styles.courseTitle}>{course.title}</h3>
      </div>
    </Link>
  );
}

function EnrolledCourseCard({ enrollment }: { enrollment: EnrolledCourse }) {
  const thumbnailUrl = enrollment.course.lessons[0]?.thumbnailUrl?.trim() || null;

  return (
    <Link
      href={`/course_dashboard?courseId=${enrollment.course.id}`}
      className={styles.courseCard}
      data-testid="enrolled-course-card"
      aria-label={`Open ${enrollment.course.title}`}
    >
      <div className={styles.courseMedia}>
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={`${enrollment.course.title} preview`}
            fill
            sizes="(max-width: 768px) 100vw, 240px"
            className={styles.courseImage}
          />
        ) : (
          <div className={styles.coursePlaceholder} aria-hidden="true" />
        )}
      </div>

      <div className={styles.courseText}>
        <h3 className={styles.courseTitle}>{enrollment.course.title}</h3>
      </div>
    </Link>
  );
}

function AddCourseCard() {
  return (
    <Link href="/courses/new" className={styles.addCourseCard} data-testid="add-course-card" aria-label="Add course">
      <div className={styles.addCourseMedia}>
        <span className={styles.addCoursePlus}>+</span>
      </div>
      <div className={styles.addCourseText}>
        <h3 className={styles.courseTitle}>Add Course</h3>
        <p className={styles.courseMeta}>Create a course</p>
      </div>
    </Link>
  );
}

export default function CoursesPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();
  const { signOut } = useAuth();

  const [isSigningOut, setIsSigningOut] = useState(false);

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
  } = useMyCourses(isLoaded && isSignedIn);
  const errorMessage = fetchError
    ? fetchError instanceof Error
      ? fetchError.message
      : 'Unable to load courses.'
    : null;

  const isLoadingEnrolledCourses = isLoading;
  const enrolledCoursesError = errorMessage;
  const isLoadingAssessorCourses = isLoading;
  const assessorCoursesError = errorMessage;
  const error = errorMessage;

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  const handleSignOut = async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/sign-in');
    } catch (err) {
      console.error('Failed to sign out', err);
      setIsSigningOut(false);
    }
  };

  if (!isLoaded || !isSignedIn) return null;

  const courses: CreatedCourse[] = created?.courses ?? [];
  const enrolledCourses: EnrolledCourse[] = enrolled?.enrollments ?? [];
  const assessorEnrollments: AssessorCourseEnrollment[] = assessor?.enrollments ?? [];
  const displayName = myCourses?.user.name || '';

  return (
    <div className={styles.page}>
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.pageTitle}>Welcome, Professor</h1>
          </div>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>My Courses</h2>

          <div className={styles.courseGrid} data-testid="courses-grid">
            <AddCourseCard />
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>

          {isLoading && <p className={styles.statusMessage}>Loading created courses…</p>}

          {!isLoading && error && <p className={styles.statusMessage}>{error}</p>}

          {!isLoading && !error && courses.length === 0 && (
            <p className={styles.statusMessage}>No courses yet. Add one from the first card.</p>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Assessor Courses</h2>

          <div className={styles.courseGrid} data-testid="assessor-courses-grid">
            {assessorEnrollments.map((enrollment) => (
              <CourseCard
                key={enrollment.id}
                course={enrollment.course}
                href={`/courses/${enrollment.course.id}?view=assessor`}
              />
            ))}
          </div>

          {isLoadingAssessorCourses && <p className={styles.statusMessage}>Loading assessor courses...</p>}

          {!isLoadingAssessorCourses && assessorCoursesError && (
            <p className={styles.statusMessage}>{assessorCoursesError}</p>
          )}

          {!isLoadingAssessorCourses && !assessorCoursesError && assessorEnrollments.length === 0 && (
            <p className={styles.statusMessage}>No assessor courses assigned yet.</p>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>My Enrolled Courses</h2>

          <div className={styles.courseGrid} data-testid="enrolled-courses-grid">
            {enrolledCourses.map((enrollment) => (
              <EnrolledCourseCard key={enrollment.id} enrollment={enrollment} />
            ))}
          </div>

          {isLoadingEnrolledCourses && <p className={styles.statusMessage}>Loading enrolled courses...</p>}

          {!isLoadingEnrolledCourses && enrolledCoursesError && (
            <p className={styles.statusMessage}>{enrolledCoursesError}</p>
          )}

          {!isLoadingEnrolledCourses && !enrolledCoursesError && enrolledCourses.length === 0 && (
            <p className={styles.statusMessage}>You are not enrolled in any courses yet.</p>
          )}
        </section>
      </main>
    </div>
  );
}
