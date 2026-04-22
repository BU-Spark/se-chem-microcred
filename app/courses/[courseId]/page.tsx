'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';

import amethystAvatar from '@/public/edit_avatar/amethyst.svg';
import emeraldAvatar from '@/public/edit_avatar/emerald.svg';
import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';
import styles from './page.module.css';

type CourseContact = {
  id: string;
  type: 'INSTRUCTOR' | 'CHECKER';
  name: string;
  email: string;
  avatarUrl: string | null;
};

type EnrollmentSummary = {
  id: string;
  role: 'STUDENT' | 'INSTRUCTOR' | 'CHECKER';
  sections: string[];
  student: {
    id: string;
    name: string | null;
    email: string | null;
    buid: string | null;
  };
};

type CourseBadge = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
};

type CourseLesson = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  thumbnailUrl: string | null;
  sortOrder: number;
  badgeRequirements: Array<{
    id: string;
    summary: string | null;
    badge: CourseBadge;
  }>;
};

type CourseDetail = {
  id: string;
  title: string;
  description: string | null;
  sectionCount: number;
  createdAt: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string | null;
    buid: string | null;
  } | null;
  settings: {
    allowCooldownOverride: boolean;
    allowAssessorMessages: boolean;
    allowCrossSectionView: boolean;
  } | null;
  contacts: CourseContact[];
  enrollments: EnrollmentSummary[];
  lessons: CourseLesson[];
};

type CourseDetailResponse = {
  course: CourseDetail;
};

type AssignedBadge = CourseBadge & {
  lessonCount: number;
};

const CHECKER_AVATARS = [emeraldAvatar, amethystAvatar, emeraldAvatar];

function resolveCourseId(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function formatPersonName(name?: string | null, email?: string | null) {
  if (name?.trim()) return name.trim();
  if (email?.trim()) return email.trim();
  return 'Unassigned';
}

function initialsFor(name?: string | null, email?: string | null) {
  const source = formatPersonName(name, email);
  const parts = source
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean);

  if (parts.length === 0) return 'NA';

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function splitDisplayName(name?: string | null, email?: string | null) {
  const resolved = formatPersonName(name, email);
  const parts = resolved.split(/\s+/).filter(Boolean);

  if (parts.length <= 1) {
    return { primary: resolved, secondary: null as string | null };
  }

  return {
    primary: parts.slice(0, 2).join(' '),
    secondary: parts.slice(2).join(' ') || null,
  };
}

function useCreatedCourseDetail(courseId?: string | null, email?: string | null) {
  const [data, setData] = useState<CourseDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!courseId || !email) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/courses/${encodeURIComponent(courseId)}?email=${encodeURIComponent(email)}`, {
        headers: { Accept: 'application/json' },
      });

      const payload = await response.json().catch(() => ({
        error: `Request failed: ${response.status}`,
      }));

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to load course details.');
      }

      setData(payload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Unable to load course details.');
    } finally {
      setIsLoading(false);
    }
  }, [courseId, email]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, isLoading, error };
}

function PersonCard({
  label,
  name,
  email,
  avatarSrc,
}: {
  label?: string;
  name?: string | null;
  email?: string | null;
  avatarSrc?: StaticImageData;
}) {
  const display = splitDisplayName(name, email);

  return (
    <div className={styles.personCard}>
      <div className={styles.personAvatarShell}>
        {avatarSrc ? (
          <Image src={avatarSrc} alt="" width={88} height={88} className={styles.personAvatarImage} />
        ) : (
          <div className={styles.personAvatarFallback} aria-hidden="true">
            {initialsFor(name, email)}
          </div>
        )}
      </div>
      <div className={styles.personInfo}>
        {label ? <p className={styles.personLabel}>{label}</p> : null}
        <p className={styles.personName}>{display.primary}</p>
        {display.secondary ? <p className={styles.personName}>{display.secondary}</p> : null}
        <p className={styles.personEmail}>{email?.trim() || 'Email unavailable'}</p>
      </div>
    </div>
  );
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 40 40" width="28" height="28" className={styles.badgeIcon} aria-hidden="true">
      <path
        d="M20 6c7.732 0 14 5.596 14 12.5 0 6.904-6.268 12.5-14 12.5-1.663 0-3.258-.259-4.739-.733L8 34l2.688-6.122C7.788 25.59 6 22.246 6 18.5 6 11.596 12.268 6 20 6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function CreatedCourseDetailPage() {
  const params = useParams<{ courseId: string }>();
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();

  const [isSigningOut, setIsSigningOut] = useState(false);

  const courseId = resolveCourseId(params?.courseId);
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const { data, isLoading, error } = useCreatedCourseDetail(courseId, email);

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

  const course = data?.course ?? null;
  const displayName = course?.createdBy?.name || user?.fullName || 'Professor';

  const studentCount = useMemo(
    () => course?.enrollments.filter((enrollment) => enrollment.role === 'STUDENT').length ?? 0,
    [course]
  );

  const checkers = useMemo(() => course?.contacts.filter((contact) => contact.type === 'CHECKER') ?? [], [course]);

  const assignedBadges = useMemo<AssignedBadge[]>(() => {
    if (!course) return [];

    const badgeMap = new Map<string, AssignedBadge>();

    for (const lesson of course.lessons) {
      const lessonBadgeIds = new Set<string>();

      for (const requirement of lesson.badgeRequirements) {
        const badge = requirement.badge;
        const existing = badgeMap.get(badge.id);

        if (!existing) {
          badgeMap.set(badge.id, {
            ...badge,
            lessonCount: 0,
          });
        }

        if (!lessonBadgeIds.has(badge.id)) {
          lessonBadgeIds.add(badge.id);
          const current = badgeMap.get(badge.id);
          if (current) {
            current.lessonCount += 1;
          }
        }
      }
    }

    return Array.from(badgeMap.values());
  }, [course]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <div className={styles.page}>
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={styles.main}>
        <div className={styles.content}>
          <header className={styles.header}>
            <h1 className={styles.pageTitle}>{course?.title ?? 'Course'}</h1>
          </header>

          {isLoading ? <p className={styles.statusMessage}>Loading course details...</p> : null}

          {!isLoading && error ? (
            <div className={styles.statusBlock}>
              <p className={styles.statusMessage}>{error}</p>
              <Link href="/courses" className={styles.inlineLink}>
                Back to courses
              </Link>
            </div>
          ) : null}

          {!isLoading && !error && course ? (
            <>
              <section className={styles.heroCard}>
                <div className={styles.heroInfo}>
                  <p className={styles.sectionLabel}>Course Info</p>
                  <h2 className={styles.courseHeading}>{course.title}</h2>

                  <PersonCard
                    label="Instructor (You)"
                    name={course.createdBy?.name}
                    email={course.createdBy?.email}
                    avatarSrc={emeraldAvatar}
                  />

                  <div className={styles.statLines}>
                    <p className={styles.statLine}>Number of Sections: {course.sectionCount}</p>
                    <p className={styles.statLine}>Number of Students Enrolled: {studentCount}</p>
                  </div>

                  <div className={styles.actionRow}>
                    <Link href={`/roster?courseId=${course.id}`} className={styles.primaryButton}>
                      View Student Roster
                    </Link>
                  </div>
                </div>

                <div className={styles.heroDivider} aria-hidden="true" />

                <aside className={styles.heroSide}>
                  <h2 className={styles.sideTitle}>Checkers</h2>

                  {checkers.length > 0 ? (
                    <div className={styles.checkerList}>
                      {checkers.map((checker, index) => (
                        <PersonCard
                          key={checker.id}
                          name={checker.name}
                          email={checker.email}
                          avatarSrc={CHECKER_AVATARS[index % CHECKER_AVATARS.length]}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className={styles.emptyMessage}>No checkers assigned yet.</p>
                  )}

                  <div className={styles.sideActionRow}>
                    <Link href={`/roster?courseId=${course.id}&role=CHECKER`} className={styles.primaryButton}>
                      View Assessor Roster
                    </Link>
                    <Link href={`/courses/new?courseId=${course.id}`} className={styles.primaryButton}>
                      Edit Course
                    </Link>
                  </div>
                </aside>
              </section>

              <section className={styles.badgesCard}>
                <h2 className={styles.badgesTitle}>Assigned Badges</h2>

                {assignedBadges.length > 0 ? (
                  <div className={styles.badgeGrid}>
                    {assignedBadges.map((badge) => (
                      <article key={badge.id} className={styles.badgeItem}>
                        <div className={styles.badgeToken} aria-hidden="true" />
                        <h3 className={styles.badgeName}>{badge.name.replace(/ Badge$/i, '')}</h3>
                        <MessageIcon />
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className={styles.emptyMessage}>No badges assigned yet.</p>
                )}

                <div className={styles.badgeActionRow}>
                  <Link href={`/badges_creation?courseId=${course.id}`} className={styles.primaryButton}>
                    Edit Badges
                  </Link>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
