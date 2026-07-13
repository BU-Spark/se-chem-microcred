'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import { generateInitials, getNameForProfile } from '@/lib/text/name';

import { LessonReminderModal } from './LessonReminderModal';
import RangeCalendar from '@/app/badge_creation/components/RangeCalendar';
import { youtubeUrlFromSummary } from '@/lib/video';
import { useFocusTrap } from '@/app/hooks/useFocusTrap';
import amethystAvatar from '@/public/edit_avatar/amethyst.svg';
import emeraldAvatar from '@/public/edit_avatar/emerald.svg';
import rubyAvatar from '@/public/edit_avatar/ruby.svg';
import sapphireAvatar from '@/public/edit_avatar/sapphire.svg';
import Sidebar, { SIDEBAR_NAV } from '@/app/components/Navigation/Sidebar';
import BackButton from '@/app/components/BackButton/BackButton';
import ExportCsvDataButton from '@/app/components/Export/ExportToCsv';
import BadgeToken from '@/app/components/BadgeToken';
import { useCreatedCourseDetail, type CourseBadge } from './hooks/useCreatedCourseDetail';
import YoutubeThumbnail from '@/app/components/Video/Youtube/YoutubeThumbnail';
import styles from './page.module.css';

type AssignedBadge = CourseBadge & {
  lessonCount: number;
  thumbnailUrl: string | null;
  videoUrl: string | null;
};

type BadgeLibraryItem = {
  id: string;
  name: string;
  description: string | null;
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
  const source = name?.trim() || email?.trim() || 'Unassigned';
  const display = getNameForProfile(source);

  return (
    <div className={styles.personCard}>
      {label ? <p className={styles.personLabel}>{label}</p> : null}
      <div className={styles.personRow}>
        <div className={styles.personAvatarShell}>
          {avatarSrc ? (
            <Image src={avatarSrc} alt="" width={88} height={88} className={styles.personAvatarImage} />
          ) : (
            <div className={styles.personAvatarFallback} aria-hidden="true">
              {generateInitials(source)}
            </div>
          )}
        </div>
        <div className={styles.personInfo}>
          <p className={styles.personName}>
            {display.headlineBottom ? `${display.headlineTop} ${display.headlineBottom}` : display.headlineTop}
          </p>
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
  const signOut = useSignOut();

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [reminderBadge, setReminderBadge] = useState<{ id: string; name: string } | null>(null);
  const [badgePendingUnassign, setBadgePendingUnassign] = useState<{ id: string; name: string } | null>(null);
  const [isAssessmentCodeOpen, setIsAssessmentCodeOpen] = useState(false);
  const [assessmentCodeInput, setAssessmentCodeInput] = useState('');
  const [assessmentCodeError, setAssessmentCodeError] = useState('');
  // MVP test-cleanup affordance (remove before handoff).
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImportPanelOpen, setIsImportPanelOpen] = useState(false);
  const [badgeLibrary, setBadgeLibrary] = useState<BadgeLibraryItem[]>([]);
  const [selectedImportBadgeId, setSelectedImportBadgeId] = useState('');
  const [isLoadingBadgeLibrary, setIsLoadingBadgeLibrary] = useState(false);
  const [isImportingBadge, setIsImportingBadge] = useState(false);
  const [badgeImportError, setBadgeImportError] = useState('');
  const [importAvailableOn, setImportAvailableOn] = useState('');
  const [importClosesOn, setImportClosesOn] = useState('');
  const [importNeverCloses, setImportNeverCloses] = useState(true);
  // The import flow is a two-step popup: 'select' (pick a badge) -> 'schedule'
  // (pick availability) -> 'confirm' (success notice that auto-closes).
  const [importStep, setImportStep] = useState<'select' | 'schedule' | 'confirm'>('select');
  const [confirmCountdown, setConfirmCountdown] = useState(3);

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

  const openAssessmentCodeModal = () => {
    setAssessmentCodeInput('');
    setAssessmentCodeError('');
    setIsAssessmentCodeOpen(true);
  };

  const closeAssessmentCodeModal = () => {
    setIsAssessmentCodeOpen(false);
    setAssessmentCodeInput('');
    setAssessmentCodeError('');
  };

  const submitAssessmentCode = useCallback(() => {
    const code = assessmentCodeInput.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!code) {
      setAssessmentCodeError('Enter an assessment code.');
      return;
    }

    router.push(`/qr/assessment-code?code=${encodeURIComponent(code)}`);
  }, [assessmentCodeInput, router]);

  const requestUnassignBadge = (badge: { id: string; name: string }) => {
    if (isDeleting) return;
    setBadgePendingUnassign(badge);
  };

  const confirmUnassignBadge = async () => {
    if (!data?.course || !badgePendingUnassign || isDeleting) return;
    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/courses/${encodeURIComponent(data.course.id)}/badges/${encodeURIComponent(badgePendingUnassign.id)}`,
        { method: 'DELETE' }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Failed to unassign badge.');
      setBadgePendingUnassign(null);
      await refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to unassign badge.');
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

  const checkers = useMemo(
    () =>
      course?.enrollments
        .filter((enrollment) => enrollment.role === 'CHECKER' && enrollment.status === 'ACTIVE')
        .map((enrollment) => enrollment.student) ?? [],
    [course]
  );

  const assignedBadges = useMemo<AssignedBadge[]>(() => {
    if (!course) return [];

    const badgeMap = new Map<string, AssignedBadge>();

    for (const lesson of course.lessons) {
      const lessonBadgeIds = new Set<string>();

      for (const requirement of lesson.badgeRequirements) {
        const badge = requirement.badge;
        const existing = badgeMap.get(badge.id);

        // A badge's video URL lives in its requirement summary (like every other
        // badge surface); fall back to the lesson's first segment.
        const lessonVideoUrl = youtubeUrlFromSummary(requirement.summary) ?? lesson.segments?.[0]?.videoUrl ?? null;

        if (!existing) {
          badgeMap.set(badge.id, {
            ...badge,
            lessonCount: 0,
            thumbnailUrl: lesson.thumbnailUrl ?? null,
            videoUrl: lessonVideoUrl,
          });
        } else {
          if (!existing.thumbnailUrl && lesson.thumbnailUrl) {
            existing.thumbnailUrl = lesson.thumbnailUrl;
          }
          if (!existing.videoUrl && lessonVideoUrl) {
            existing.videoUrl = lessonVideoUrl;
          }
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
    setImportStep('select');
    setBadgeImportError('');
    setSelectedImportBadgeId('');
    setImportAvailableOn('');
    setImportClosesOn('');
    setImportNeverCloses(true);
    void loadBadgeLibrary();
  };

  const closeImportModal = useCallback(() => {
    setIsImportPanelOpen(false);
    setImportStep('select');
    setSelectedImportBadgeId('');
    setImportAvailableOn('');
    setImportClosesOn('');
    setImportNeverCloses(true);
    setBadgeImportError('');
  }, []);

  const importModalRef = useFocusTrap<HTMLDivElement>(isImportPanelOpen, closeImportModal);

  // Auto-dismiss the confirmation step after a short, visible countdown. The
  // interval drives the on-screen notice; the timeout performs the actual close.
  useEffect(() => {
    if (!isImportPanelOpen || importStep !== 'confirm') return;

    setConfirmCountdown(3);
    const interval = setInterval(() => {
      setConfirmCountdown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    const timeout = setTimeout(() => {
      closeImportModal();
    }, 3000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isImportPanelOpen, importStep, closeImportModal]);

  const importSelectedBadge = async () => {
    if (!course?.id || !selectedImportBadgeId) return;

    setIsImportingBadge(true);
    setBadgeImportError('');

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

      setImportStep('confirm');
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
              <BackButton href="/" />
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
                      {canAssess ? (
                        <button type="button" className={styles.primaryButton} onClick={openAssessmentCodeModal}>
                          Assess Student
                        </button>
                      ) : null}
                      {isInstructor && email ? (
                        <ExportCsvDataButton courseId={course.id} email={email} className={styles.primaryButton} />
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className={styles.heroDivider} aria-hidden="true" />

                <aside className={styles.heroSide}>
                  <h2 className={styles.sideTitle}>Checkers</h2>

                  {checkers.length > 0 ? (
                    <div className={styles.checkerList}>
                      {checkers.map((checker) => (
                        <PersonCard key={checker.id} name={checker.name} email={checker.email} />
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
                      {/* MVP test-cleanup button - remove before handoff. */}
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
                      const fallbackImage = badge.thumbnailUrl?.replace('/hqdefault.jpg', '/mqdefault.jpg') ?? null;
                      return (
                        <div key={badge.id} className={styles.badgeItem}>
                          <Link href={`/courses/${course.id}/${badge.id}`} className={styles.badgeItemLink}>
                            <BadgeToken className={styles.badgeToken}>
                              <YoutubeThumbnail
                                videoUrl={badge.videoUrl}
                                fallbackThumbnailUrl={fallbackImage}
                                quality="mqdefault"
                                alt={`${badge.name.replace(/ Badge$/i, '')} thumbnail`}
                                className={styles.badgeTokenImage}
                              />
                            </BadgeToken>
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
                                onClick={() => requestUnassignBadge({ id: badge.id, name: badge.name })}
                                disabled={isDeleting}
                              >
                                Unassign badge
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
          courseName={course?.title ?? 'Course'}
          onClose={() => setReminderBadge(null)}
        />
      ) : null}

      {isInstructor && isImportPanelOpen ? (
        <div className={styles.importOverlay} onClick={closeImportModal}>
          <div
            ref={importModalRef}
            className={styles.importModal}
            role="dialog"
            aria-modal="true"
            aria-label="Import existing badge"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.importCloseButton}
              onClick={closeImportModal}
              aria-label="Close import"
            >
              ×
            </button>

            {importStep === 'confirm' ? (
              <div className={styles.importConfirm}>
                <div className={styles.importConfirmIcon} aria-hidden="true">
                  ✓
                </div>
                <h3 className={styles.importTitle}>Badge imported</h3>
                <p className={styles.importSubtitle}>The badge has been added to this course.</p>
                <p className={styles.importCountdown}>
                  Closing automatically in {confirmCountdown} second{confirmCountdown === 1 ? '' : 's'}…
                </p>
                <button type="button" className={styles.primaryButton} onClick={closeImportModal}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className={styles.importModalHeader}>
                  <h3 className={styles.importTitle}>Import Existing Badge</h3>
                  <p className={styles.importSubtitle}>
                    {importStep === 'select'
                      ? 'Choose a reusable badge to add to this course.'
                      : 'Set when this badge’s content is available, then finish.'}
                  </p>
                </div>

                <ol className={styles.importSteps}>
                  <li className={importStep === 'select' ? styles.importStepActive : styles.importStepMuted}>
                    1. Select badge
                  </li>
                  <li className={importStep === 'schedule' ? styles.importStepActive : styles.importStepMuted}>
                    2. Availability
                  </li>
                </ol>

                {badgeImportError ? <p className={styles.errorText}>{badgeImportError}</p> : null}

                {importStep === 'select' ? (
                  <>
                    {isLoadingBadgeLibrary ? (
                      <p className={styles.statusMessage}>Loading badge library…</p>
                    ) : importableBadges.length === 0 ? (
                      <p className={styles.emptyMessage}>No reusable badges are available to import.</p>
                    ) : (
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
                    )}

                    <div className={styles.importModalActions}>
                      <button type="button" className={styles.secondaryButton} onClick={closeImportModal}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => setImportStep('schedule')}
                        disabled={!selectedImportBadgeId}
                      >
                        Next
                      </button>
                    </div>
                  </>
                ) : (
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

                    <div className={styles.importModalActions}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => setImportStep('select')}
                        disabled={isImportingBadge}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={importSelectedBadge}
                        disabled={isImportingBadge}
                      >
                        {isImportingBadge ? 'Importing…' : 'Finish'}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}

      {isAssessmentCodeOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Assess student by code">
          <div className={styles.confirmModal}>
            <button
              type="button"
              className={styles.modalCloseButton}
              onClick={closeAssessmentCodeModal}
              aria-label="Close assessment code dialog"
            >
              x
            </button>

            <h2 className={styles.modalTitle}>Assess student</h2>
            <p className={styles.modalText}>Enter the assessment code shown under the student&apos;s QR code.</p>
            <label className={styles.assessmentCodeField}>
              <span>Assessment code</span>
              <input
                value={assessmentCodeInput}
                onChange={(event) => {
                  setAssessmentCodeInput(event.target.value);
                  setAssessmentCodeError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    submitAssessmentCode();
                  }
                }}
                placeholder="ABCD-1234"
                autoCapitalize="characters"
                autoFocus
              />
            </label>
            {assessmentCodeError ? <p className={styles.errorText}>{assessmentCodeError}</p> : null}

            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={closeAssessmentCodeModal}>
                Cancel
              </button>
              <button type="button" className={styles.confirmButton} onClick={submitAssessmentCode}>
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {badgePendingUnassign ? (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={`Unassign ${badgePendingUnassign.name}`}
        >
          <div className={styles.confirmModal}>
            <button
              type="button"
              className={styles.modalCloseButton}
              onClick={() => setBadgePendingUnassign(null)}
              aria-label="Close unassign confirmation"
              disabled={isDeleting}
            >
              x
            </button>

            <h2 className={styles.modalTitle}>Unassign badge?</h2>
            <div className={styles.modalBadgeCircle} aria-hidden="true" />
            <p className={styles.modalBadgeName}>{badgePendingUnassign.name}</p>
            <p className={styles.modalText}>
              This removes the badge and its lesson from this course. The badge itself will not be deleted and can be
              imported again later.
            </p>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setBadgePendingUnassign(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmButton}
                onClick={confirmUnassignBadge}
                disabled={isDeleting}
              >
                {isDeleting ? 'Unassigning...' : 'Unassign Badge'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
