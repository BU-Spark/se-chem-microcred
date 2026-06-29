'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';

import { LessonReminderModal } from './LessonReminderModal';
import RangeCalendar from '@/app/badge_creation/components/RangeCalendar';
import amethystAvatar from '@/public/edit_avatar/amethyst.svg';
import emeraldAvatar from '@/public/edit_avatar/emerald.svg';
import rubyAvatar from '@/public/edit_avatar/ruby.svg';
import sapphireAvatar from '@/public/edit_avatar/sapphire.svg';
import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';
import styles from './page.module.css';

type CourseContact = {
  id: string;
  type: 'INSTRUCTOR' | 'CHECKER';
  name: string;
  email: string;
  avatarUrl: string | null;
  avatarBase: string | null;
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
  code: string | null;
  assessorCode: string | null;
  title: string;
  description: string | null;
  sectionCount: number;
  createdAt: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string | null;
    buid: string | null;
    avatarBase: string | null;
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
  viewerRole: 'STUDENT' | 'INSTRUCTOR' | 'CHECKER';
  course: CourseDetail;
};

type AssignedBadge = CourseBadge & {
  lessonCount: number;
  thumbnailUrl: string | null;
};

type BadgeLibraryItem = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  assignedStudentCount: number;
  requirements: Array<{
    displayText: string;
    lesson: {
      course: {
        id: string;
        title: string;
      } | null;
    } | null;
  }>;
};

type BadgeLibraryResponse = {
  badges: BadgeLibraryItem[];
};

function avatarFor(base?: string | null): StaticImageData {
  switch (base) {
    case 'RUBY':
      return rubyAvatar as StaticImageData;
    case 'EMERALD':
      return emeraldAvatar as StaticImageData;
    case 'AMETHYST':
      return amethystAvatar as StaticImageData;
    case 'SAPPHIRE':
    default:
      return sapphireAvatar as StaticImageData;
  }
}

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

function formatLastFirst(name?: string | null, email?: string | null) {
  const resolved = formatPersonName(name, email);
  const parts = resolved.split(/\s+/).filter(Boolean);

  if (parts.length <= 1) {
    return resolved;
  }

  const last = parts[parts.length - 1];
  const first = parts.slice(0, parts.length - 1).join(' ');

  return `${last}, ${first}`;
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

  return { data, isLoading, error, refresh: fetchData };
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
  const display = formatLastFirst(name, email);

  return (
    <div className={styles.personCard}>
      {label ? <p className={styles.personLabel}>{label}</p> : null}
      <div className={styles.personRow}>
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
          <p className={styles.personName}>{display}</p>
          <p className={styles.personEmail}>{email?.trim() || 'Email unavailable'}</p>
        </div>
      </div>
    </div>
  );
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" width="40" height="40" className={styles.badgeIcon} aria-hidden="true">
      <path
        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function CreatedCourseDetailPage() {
  const params = useParams<{ courseId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [reminderBadge, setReminderBadge] = useState<{ id: string; name: string } | null>(null);
  // MVP test-cleanup affordance (remove before handoff).
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImportPanelOpen, setIsImportPanelOpen] = useState(false);
  const [badgeLibrary, setBadgeLibrary] = useState<BadgeLibraryItem[]>([]);
  const [selectedImportBadgeId, setSelectedImportBadgeId] = useState('');
  const [isLoadingBadgeLibrary, setIsLoadingBadgeLibrary] = useState(false);
  const [isImportingBadge, setIsImportingBadge] = useState(false);
  const [badgeImportError, setBadgeImportError] = useState('');
  const [badgeImportStatus, setBadgeImportStatus] = useState('');
  const [importAvailableOn, setImportAvailableOn] = useState('');
  const [importClosesOn, setImportClosesOn] = useState('');
  const [importNeverCloses, setImportNeverCloses] = useState(true);

  const courseId = resolveCourseId(params?.courseId);
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const { data, isLoading, error, refresh } = useCreatedCourseDetail(courseId, email);

  useEffect(() => {
    if (isLoaded && !isSignedIn && !isSigningOut) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, isSigningOut, router]);

  const handleSignOut = async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/splash');
    } catch (err) {
      console.error('Failed to sign out', err);
      setIsSigningOut(false);
    }
  };

  // MVP test-cleanup handlers — delete a whole test course or a test badge.
  // Remove these (and the buttons that call them) before handoff.
  const handleDeleteCourse = async () => {
    if (!data?.course || isDeleting) return;
    if (!window.confirm(`Delete the course "${data.course.title}" and all its content? This cannot be undone.`)) {
      return;
    }
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/courses/${encodeURIComponent(data.course.id)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Failed to delete course.');
      router.replace('/');
    } catch (err) {
      setIsDeleting(false);
      window.alert(err instanceof Error ? err.message : 'Failed to delete course.');
    }
  };

  const handleUnassignBadge = async (badge: { id: string; name: string }) => {
    if (!data?.course || isDeleting) return;
    if (
      !window.confirm(
        `Remove the badge "${badge.name}" from this course? The badge itself is not deleted and can be re-assigned later.`
      )
    ) {
      return;
    }
    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/courses/${encodeURIComponent(data.course.id)}/badges/${encodeURIComponent(badge.id)}`,
        { method: 'DELETE' }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Failed to unassign badge.');
      await refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to unassign badge.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteBadge = async (badge: { id: string; name: string }) => {
    if (isDeleting) return;
    if (!window.confirm(`Delete the badge "${badge.name}"? This removes it everywhere and cannot be undone.`)) {
      return;
    }
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/badges/${encodeURIComponent(badge.id)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Failed to delete badge.');
      await refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to delete badge.');
    } finally {
      setIsDeleting(false);
    }
  };

  const course = data?.course ?? null;
  const viewerRole = data?.viewerRole ?? null;
  const isAssessorView = searchParams.get('view') === 'assessor';
  const isInstructor = viewerRole === 'INSTRUCTOR' && !isAssessorView;
  const canAssess = isAssessorView && viewerRole !== 'STUDENT';
  const isStudent = viewerRole === 'STUDENT';
  const displayName = isInstructor ? course?.createdBy?.name || '' : user?.fullName || '';

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
            thumbnailUrl: lesson.thumbnailUrl ?? null,
          });
        } else if (!existing.thumbnailUrl && lesson.thumbnailUrl) {
          existing.thumbnailUrl = lesson.thumbnailUrl;
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

  const importableBadges = useMemo(
    () =>
      badgeLibrary.filter((badge) => {
        const isAlreadyInCourse = badge.requirements.some(
          (requirement) => requirement.lesson?.course?.id === course?.id
        );
        return !isAlreadyInCourse;
      }),
    [badgeLibrary, course?.id]
  );

  const loadBadgeLibrary = useCallback(async () => {
    if (!isInstructor) return;

    setIsLoadingBadgeLibrary(true);
    setBadgeImportError('');

    try {
      const response = await fetch('/api/badges', {
        headers: { Accept: 'application/json' },
      });
      const payload = (await response.json().catch(() => ({
        error: `Request failed: ${response.status}`,
      }))) as BadgeLibraryResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to load badge library.');
      }

      setBadgeLibrary(payload.badges ?? []);
    } catch (err) {
      setBadgeImportError(err instanceof Error ? err.message : 'Unable to load badge library.');
    } finally {
      setIsLoadingBadgeLibrary(false);
    }
  }, [isInstructor]);

  const openImportPanel = () => {
    setIsImportPanelOpen(true);
    setBadgeImportStatus('');
    setBadgeImportError('');
    setImportAvailableOn('');
    setImportClosesOn('');
    setImportNeverCloses(true);
    void loadBadgeLibrary();
  };

  const importSelectedBadge = async () => {
    if (!course?.id || !selectedImportBadgeId) return;

    setIsImportingBadge(true);
    setBadgeImportError('');
    setBadgeImportStatus('');

    try {
      const response = await fetch(`/api/courses/${encodeURIComponent(course.id)}/badges/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          badgeId: selectedImportBadgeId,
          availableOn: importAvailableOn || null,
          closesOn: importNeverCloses ? null : importClosesOn || null,
          neverCloses: importNeverCloses,
        }),
      });
      const payload = await response.json().catch(() => ({
        error: `Request failed: ${response.status}`,
      }));

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to import badge.');
      }

      setBadgeImportStatus('Badge imported successfully.');
      setSelectedImportBadgeId('');
      await refresh();
      await loadBadgeLibrary();
    } catch (err) {
      setBadgeImportError(err instanceof Error ? err.message : 'Unable to import badge.');
    } finally {
      setIsImportingBadge(false);
    }
  };

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
              <Link href="/" className={styles.inlineLink}>
                Back to home
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
                    label={isInstructor ? 'Instructor (You)' : 'Instructor'}
                    name={course.createdBy?.name}
                    email={course.createdBy?.email}
                    avatarSrc={avatarFor(course.createdBy?.avatarBase)}
                  />

                  <div className={styles.statLines}>
                    <p className={styles.statLine}>Number of Sections: {course.sectionCount}</p>
                    <p className={styles.statLine}>Number of Students Enrolled: {studentCount}</p>
                    {isInstructor && course.code ? (
                      <p className={styles.statLine}>
                        Course Code: <span className={styles.courseCode}>{course.code}</span>
                      </p>
                    ) : null}
                    {isInstructor && course.assessorCode ? (
                      <p className={styles.statLine}>
                        Assessor Code: <span className={styles.courseCode}>{course.assessorCode}</span>
                      </p>
                    ) : null}
                    {viewerRole ? (
                      <p className={styles.statLine}>Your Role: {isAssessorView ? 'ASSESSOR' : viewerRole}</p>
                    ) : null}
                  </div>

                  {!isStudent ? (
                    <div className={styles.actionRow}>
                      <Link href={`/roster?courseId=${course.id}&role=STUDENT`} className={styles.primaryButton}>
                        {canAssess ? 'View Students to Assess' : 'View Student Roster'}
                      </Link>
                    </div>
                  ) : null}
                </div>

                <div className={styles.heroDivider} aria-hidden="true" />

                <aside className={styles.heroSide}>
                  <h2 className={styles.sideTitle}>Checkers</h2>

                  {checkers.length > 0 ? (
                    <div className={styles.checkerList}>
                      {checkers.map((checker) => (
                        <PersonCard
                          key={checker.id}
                          name={checker.name}
                          email={checker.email}
                          avatarSrc={avatarFor(checker.avatarBase)}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className={styles.emptyMessage}>No checkers assigned yet.</p>
                  )}

                  {isInstructor ? (
                    <div className={styles.sideActionRow}>
                      <Link href={`/roster?courseId=${course.id}&role=CHECKER`} className={styles.primaryButton}>
                        View Assessor Roster
                      </Link>
                      <Link href={`/courses/new?courseId=${course.id}`} className={styles.primaryButton}>
                        Edit Course
                      </Link>
                      {/* MVP test-cleanup button — remove before handoff. */}
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={handleDeleteCourse}
                        disabled={isDeleting}
                      >
                        {isDeleting ? 'Deleting…' : 'Delete Course'}
                      </button>
                    </div>
                  ) : null}
                </aside>
              </section>

              <section className={styles.badgesCard}>
                <h2 className={styles.badgesTitle}>Assigned Badges</h2>

                {assignedBadges.length > 0 ? (
                  <div className={styles.badgeGrid}>
                    {assignedBadges.map((badge) => {
                      // Use the bar-free 16:9 thumbnail so the round center-crop has no black letterboxing.
                      const badgeImage = badge.thumbnailUrl?.replace('/hqdefault.jpg', '/mqdefault.jpg') ?? null;
                      return (
                        <div key={badge.id} className={styles.badgeItem}>
                          <Link href={`/courses/${course.id}/${badge.id}`} className={styles.badgeItemLink}>
                            <div
                              className={styles.badgeToken}
                              style={badgeImage ? { backgroundImage: `url(${badgeImage})` } : undefined}
                              aria-hidden="true"
                            />
                            <h3 className={styles.badgeName}>{badge.name.replace(/ Badge$/i, '')}</h3>
                          </Link>
                          {isInstructor ? (
                            <>
                              <button
                                type="button"
                                className={styles.badgeReminderButton}
                                onClick={() => setReminderBadge({ id: badge.id, name: badge.name })}
                                aria-label={`Send a lesson reminder for ${badge.name.replace(/ Badge$/i, '')}`}
                              >
                                <MessageIcon />
                              </button>
                              <button
                                type="button"
                                className={styles.badgeUnassignButton}
                                onClick={() => handleUnassignBadge({ id: badge.id, name: badge.name })}
                                disabled={isDeleting}
                              >
                                Unassign badge
                              </button>
                              {/* MVP test-cleanup button — remove before handoff. */}
                              <button
                                type="button"
                                className={styles.badgeDeleteButton}
                                onClick={() => handleDeleteBadge({ id: badge.id, name: badge.name })}
                                disabled={isDeleting}
                              >
                                Delete badge
                              </button>
                            </>
                          ) : (
                            <MessageIcon />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className={styles.emptyMessage}>No badges assigned yet.</p>
                )}

                {isInstructor ? (
                  <div className={styles.badgeActionRow}>
                    <button type="button" className={styles.primaryButton} onClick={openImportPanel}>
                      Import Existing Badge
                    </button>
                    <Link href={`/badge_creation?courseId=${course.id}`} className={styles.primaryButton}>
                      Create Badge
                    </Link>
                  </div>
                ) : null}

                {isInstructor && isImportPanelOpen ? (
                  <div className={styles.importPanel}>
                    <div className={styles.importPanelHeader}>
                      <div>
                        <h3 className={styles.importTitle}>Import Existing Badge</h3>
                        <p className={styles.importSubtitle}>Add a reusable badge to this course.</p>
                      </div>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => {
                          setIsImportPanelOpen(false);
                          setBadgeImportError('');
                          setBadgeImportStatus('');
                        }}
                      >
                        Close
                      </button>
                    </div>

                    {isLoadingBadgeLibrary ? <p className={styles.statusMessage}>Loading badge library...</p> : null}
                    {badgeImportError ? <p className={styles.errorText}>{badgeImportError}</p> : null}
                    {badgeImportStatus ? <p className={styles.successText}>{badgeImportStatus}</p> : null}

                    {!isLoadingBadgeLibrary ? (
                      <div className={styles.importControls}>
                        <label className={styles.importField}>
                          <span>Badge library</span>
                          <select
                            value={selectedImportBadgeId}
                            onChange={(event) => setSelectedImportBadgeId(event.target.value)}
                          >
                            <option value="">Select a badge</option>
                            {importableBadges.map((badge) => (
                              <option key={badge.id} value={badge.id}>
                                {badge.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        {selectedImportBadgeId ? (
                          <>
                            <div className={styles.importField}>
                              <span>Content Availability</span>
                              <RangeCalendar
                                availableOn={importAvailableOn}
                                closesOn={importClosesOn}
                                neverCloses={importNeverCloses}
                                onAvailableOnChange={setImportAvailableOn}
                                onClosesOnChange={setImportClosesOn}
                                onNeverClosesChange={setImportNeverCloses}
                              />
                            </div>
                            <button
                              type="button"
                              className={styles.primaryButton}
                              onClick={importSelectedBadge}
                              disabled={isImportingBadge}
                            >
                              {isImportingBadge ? 'Importing...' : 'Add to Course'}
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    {!isLoadingBadgeLibrary && importableBadges.length === 0 ? (
                      <p className={styles.emptyMessage}>No reusable badges are available to import.</p>
                    ) : null}
                  </div>
                ) : null}
              </section>
            </>
          ) : null}
        </div>
      </main>

      {reminderBadge && courseId ? (
        <LessonReminderModal
          courseId={courseId}
          badgeId={reminderBadge.id}
          badgeName={reminderBadge.name}
          onClose={() => setReminderBadge(null)}
        />
      ) : null}
    </div>
  );
}
