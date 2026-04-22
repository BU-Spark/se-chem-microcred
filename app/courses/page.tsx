'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';

import Sidebar, { SIDEBAR_NAV } from '../_components/Sidebar';
import styles from './page.module.css';

type EnrollmentSummary = {
  id: string;
  role: 'STUDENT' | 'INSTRUCTOR' | 'CHECKER';
};

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

function resolveThumbnailUrl(course: CreatedCourse) {
  const candidate = course.lessons[0]?.thumbnailUrl?.trim();
  return candidate ? candidate : null;
}

function CourseCard({ course }: { course: CreatedCourse }) {
  const thumbnailUrl = resolveThumbnailUrl(course);

  return (
    <Link
      href={`/courses/${course.id}`}
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
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();

  const [isSigningOut, setIsSigningOut] = useState(false);

  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const { data, isLoading, error } = useCreatedCourses(email);

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

  const courses = data?.courses ?? [];
  const displayName = data?.user.name || user?.fullName || 'Professor';

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
      </main>
    </div>
  );
}
