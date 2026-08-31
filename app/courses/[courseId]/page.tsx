'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import { generateInitials, getNameForProfile, type NamedPerson } from '@/lib/text/name';
import { isInstructor } from '@/lib/roles';
import { isBadgeClosed } from '@/lib/badgeAvailability';

import { CourseBlastModal } from './CourseBlastModal';
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
import BadgeToken from '@/app/components/BadgeToken/BadgeToken';
import { useCreatedCourseDetail, type CourseBadge } from './hooks/useCreatedCourseDetail';
import BadgeImage from '@/app/components/BadgeImage/BadgeImage';
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
  firstName,
  lastName,
  email,
  avatarSrc,
}: {
  label?: string;
  name?: string | null;
  // Issue #258: prefer the stored parts; `name` remains the fallback for rows
  // written before they existed.
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  avatarSrc?: StaticImageData;
}) {
  // Email stands in for someone with no name on file, and reads as a single token.
  const source: NamedPerson =
    name?.trim() || firstName?.trim() ? { name, firstName, lastName } : { name: email?.trim() || 'Unassigned' };
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

function availabilityLabel(badge: AssignedBadge) {
  const availableOn = badge.availableOn ? new Date(badge.availableOn) : null;
  const closesOn = badge.closesOn ? new Date(badge.closesOn) : null;
  const formatDate = (date: Date) =>
    date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  if (availableOn && availableOn.getTime() > Date.now()) {
    return { label: 'Scheduled', detail: `Available ${formatDate(availableOn)}`, tone: 'scheduled' };
  }
  if (closesOn && isBadgeClosed({ closesOn, neverCloses: badge.neverCloses })) {
    return { label: 'Closed', detail: `Closed ${formatDate(closesOn)}`, tone: 'closed' };
  }
  if (!badge.neverCloses && closesOn) {
    return { label: 'Available', detail: `Closes ${formatDate(closesOn)}`, tone: 'available' };
  }
  return {
    label: 'Available',
    detail: availableOn ? `Since ${formatDate(availableOn)}` : 'Open now',
    tone: 'available',
  };
}

export default function CreatedCourseDetailPage() {
  const params = useParams<{ courseId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn, user } = useUser();
  const signOut = useSignOut();

  const [isSigningOut, setIsSigningOut] = useState(false);
  // null = closed. { badge: null } = whole-course blast; { badge } = the
  // students who have not finished that badge.
  const [blast, setBlast] = useState<{ badge: { id: string; name: string } | null } | null>(null);
  // The badge whose settings popup is open (edit availability + unassign). Null when closed.
  const [badgePendingEdit, setBadgePendingEdit] = useState<AssignedBadge | null>(null);
  const [editAvailableOn, setEditAvailableOn] = useState('');
  const [editClosesOn, setEditClosesOn] = useState('');
  const [editNeverCloses, setEditNeverCloses] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  // Inline confirm step for the destructive unassign action inside the popup.
  const [showUnassignConfirm, setShowUnassignConfirm] = useState(false);
  const [isAssessmentCodeOpen, setIsAssessmentCodeOpen] = useState(false);
  const [isDeleteCourseOpen, setIsDeleteCourseOpen] = useState(false);
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
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/courses/${encodeURIComponent(data.course.id)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Failed to delete course.');
      setIsDeleteCourseOpen(false);
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

  // Badge availability dates are stored as DateTimes but edited as YYYY-MM-DD via
  // RangeCalendar. Slice the UTC date to mirror how import wrote them (new Date('YYYY-MM-DD')
  // is UTC midnight) and avoid a local-timezone off-by-one.
  const toDateInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

  const openBadgeSettings = (badge: AssignedBadge) => {
    setBadgePendingEdit(badge);
    setEditAvailableOn(toDateInput(badge.availableOn));
    setEditClosesOn(toDateInput(badge.closesOn));
    setEditNeverCloses(badge.neverCloses ?? true);
    setShowUnassignConfirm(false);
    setSettingsError('');
  };

  const closeBadgeSettings = () => {
    if (isSavingSettings || isDeleting) return;
    setBadgePendingEdit(null);
    setShowUnassignConfirm(false);
    setSettingsError('');
  };

  const saveBadgeSettings = async () => {
    if (!data?.course || !badgePendingEdit || isSavingSettings) return;
    setIsSavingSettings(true);
    setSettingsError('');
    try {
      const response = await fetch(
        `/api/courses/${encodeURIComponent(data.course.id)}/badges/${encodeURIComponent(badgePendingEdit.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            availableOn: editAvailableOn || null,
            closesOn: editNeverCloses ? null : editClosesOn || null,
            neverCloses: editNeverCloses,
          }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Failed to update badge settings.');
      setBadgePendingEdit(null);
      await refresh();
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to update badge settings.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const confirmUnassignBadge = async () => {
    if (!data?.course || !badgePendingEdit || isDeleting) return;
    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/courses/${encodeURIComponent(data.course.id)}/badges/${encodeURIComponent(badgePendingEdit.id)}`,
        { method: 'DELETE' }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Failed to unassign badge.');
      setBadgePendingEdit(null);
      setShowUnassignConfirm(false);
      await refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to unassign badge.');
    } finally {
      setIsDeleting(false);
    }
  };

  const course = data?.course ?? null;
  const viewerRole = data?.viewerRole ?? null;
  const isCheckerView = searchParams.get('view') === 'checker';
  const isInstructorFlag = isInstructor(viewerRole) && !isCheckerView;
  const canAssess = isCheckerView && viewerRole !== 'STUDENT';
  const isStudent = viewerRole === 'STUDENT';

  // The role this page is presenting as: an instructor previewing with
  // ?view=checker sees the checker's surface, messaging included.
  const effectiveRole = isCheckerView && viewerRole !== 'STUDENT' ? 'CHECKER' : viewerRole;
  // Checkers may message only while the course allows it; the send route
  // enforces the same rule independently.
  const canSendMessages =
    effectiveRole === 'INSTRUCTOR' || (effectiveRole === 'CHECKER' && course?.settings?.allowCheckerMessages === true);
  const displayName = isInstructorFlag ? course?.createdBy?.name || '' : user?.fullName || '';

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
    if (!isInstructorFlag) return;

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
  }, [isInstructorFlag]);

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
  const settingsModalRef = useFocusTrap<HTMLDivElement>(Boolean(badgePendingEdit), closeBadgeSettings);
  const assessmentModalRef = useFocusTrap<HTMLDivElement>(isAssessmentCodeOpen, closeAssessmentCodeModal);
  const deleteCourseModalRef = useFocusTrap<HTMLDivElement>(isDeleteCourseOpen, () => {
    if (!isDeleting) setIsDeleteCourseOpen(false);
  });

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
            <nav className={styles.breadcrumb} aria-label="Breadcrumb">
              <Link href="/">Courses</Link>
              <span aria-hidden="true">/</span>
              <span>{course?.title ?? 'Course'}</span>
            </nav>
            <h1 className="page-heading">{course?.title ?? 'Course'}</h1>
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
                  <div className={styles.overviewLead}>
                    <p className={styles.sectionLabel}>Course overview</p>
                    <PersonCard
                      label={isInstructorFlag ? 'Instructor (You)' : 'Instructor'}
                      name={course.createdBy?.name}
                      firstName={course.createdBy?.firstName}
                      lastName={course.createdBy?.lastName}
                      email={course.createdBy?.email}
                      avatarSrc={avatarFor(course.createdBy?.avatarBase)}
                    />
                  </div>

                  <div className={styles.statLines}>
                    <p className={styles.statLine}>
                      <strong>{course.sectionCount}</strong>
                      <span>{course.sectionCount === 1 ? 'Section' : 'Sections'}</span>
                    </p>
                    <p className={styles.statLine}>
                      <strong>{studentCount}</strong>
                      <span>Students</span>
                    </p>
                    {isInstructorFlag && course.code ? (
                      <p className={styles.statLine}>
                        <strong className={styles.courseCode}>{course.code}</strong>
                        <span>Course code</span>
                      </p>
                    ) : null}
                    {isInstructorFlag && course.checkerCode ? (
                      <p className={styles.statLine}>
                        <strong className={styles.courseCode}>{course.checkerCode}</strong>
                        <span>Checker code</span>
                      </p>
                    ) : null}
                    {viewerRole ? (
                      <p className={styles.statLine}>
                        <strong>{isCheckerView ? 'Checker' : viewerRole.toLowerCase()}</strong>
                        <span>Your role</span>
                      </p>
                    ) : null}
                  </div>

                  {!isStudent ? (
                    <div className={styles.actionRow}>
                      <div className={styles.actionGroup}>
                        <Link
                          href={`/roster?courseId=${course.id}&role=STUDENT${canAssess ? '&view=checker' : ''}`}
                          className={styles.primaryButton}
                        >
                          {canAssess ? 'Students to assess' : 'View roster'}
                        </Link>
                        {canAssess ? (
                          <button type="button" className={styles.primaryButton} onClick={openAssessmentCodeModal}>
                            Assess Student
                          </button>
                        ) : null}
                        {isInstructorFlag ? (
                          <button
                            type="button"
                            className={styles.primaryButton}
                            onClick={() => setBlast({ badge: null })}
                          >
                            Message students
                          </button>
                        ) : null}
                        {isInstructorFlag && email ? (
                          <ExportCsvDataButton courseId={course.id} email={email} className={styles.primaryButton} />
                        ) : null}
                      </div>
                      {isInstructorFlag ? (
                        <div className={styles.actionGroup}>
                          <Link href={`/courses/new?courseId=${course.id}`} className={styles.primaryButton}>
                            Edit course
                          </Link>
                          <button
                            type="button"
                            className={styles.dangerButton}
                            onClick={() => setIsDeleteCourseOpen(true)}
                            disabled={isDeleting}
                          >
                            {isDeleting ? 'Deleting…' : 'Delete course'}
                          </button>
                        </div>
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
                        <PersonCard
                          key={checker.id}
                          name={checker.name}
                          firstName={checker.firstName}
                          lastName={checker.lastName}
                          email={checker.email}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className={styles.emptyMessage}>No checkers assigned yet.</p>
                  )}

                  {isInstructorFlag ? (
                    <div className={styles.sideActionRow}>
                      <Link href={`/roster?courseId=${course.id}&role=CHECKER`} className={styles.primaryButton}>
                        Manage checkers
                      </Link>
                      <button
                        hidden
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => setIsDeleteCourseOpen(true)}
                        disabled={isDeleting}
                      >
                        {isDeleting ? 'Deleting…' : 'Delete Course'}
                      </button>
                    </div>
                  ) : null}
                </aside>
              </section>

              <section className={styles.badgesCard}>
                <div className={styles.badgesHeader}>
                  <div>
                    <h2 className={styles.badgesTitle}>Course badges</h2>
                    <p className={styles.badgesSubtitle}>
                      {assignedBadges.length} assigned {assignedBadges.length === 1 ? 'badge' : 'badges'}
                    </p>
                  </div>
                  {isInstructorFlag ? (
                    <button type="button" className={styles.primaryButton} onClick={openImportPanel}>
                      + Import badge
                    </button>
                  ) : null}
                </div>

                {assignedBadges.length > 0 ? (
                  <div className={styles.badgeGrid}>
                    {assignedBadges.map((badge) => {
                      // Use the bar-free 16:9 thumbnail so the round center-crop has no black letterboxing.
                      const fallbackImage = badge.thumbnailUrl?.replace('/hqdefault.jpg', '/mqdefault.jpg') ?? null;
                      const availability = availabilityLabel(badge);
                      return (
                        <div key={badge.id} className={styles.badgeItem}>
                          <Link href={`/courses/${course.id}/${badge.id}`} className={styles.badgeItemLink}>
                            <BadgeToken className={styles.badgeToken}>
                              <BadgeImage
                                imageUrl={badge.imageUrl}
                                imagePositionX={badge.imagePositionX}
                                imagePositionY={badge.imagePositionY}
                                imageScale={badge.imageScale}
                                videoUrl={badge.videoUrl}
                                fallbackThumbnailUrl={fallbackImage}
                                quality="mqdefault"
                                alt={`${badge.name} thumbnail`}
                                className={styles.badgeTokenImage}
                              />
                            </BadgeToken>
                            <div className={styles.badgeCopy}>
                              <h3 className={styles.badgeName}>{badge.name}</h3>
                            </div>
                          </Link>
                          <div className={styles.availability}>
                            <strong data-tone={availability.tone}>{availability.label}</strong>
                            <span>{availability.detail}</span>
                          </div>
                          {canSendMessages ? (
                            <button
                              type="button"
                              className={styles.badgeReminderButton}
                              onClick={() => setBlast({ badge: { id: badge.id, name: badge.name } })}
                              aria-label={`Send a lesson reminder for ${badge.name}`}
                            >
                              Remind
                            </button>
                          ) : null}
                          {isInstructorFlag ? (
                            <button
                              type="button"
                              className={styles.badgeUnassignButton}
                              onClick={() => openBadgeSettings(badge)}
                              disabled={isDeleting}
                            >
                              Settings
                            </button>
                          ) : isStudent ? (
                            <MessageIcon />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.badgesEmptyState}>
                    <p className={styles.emptyMessage}>No badges assigned yet.</p>
                    {isInstructorFlag ? <span>Import a badge to start building this course.</span> : null}
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </main>

      {blast && courseId ? (
        <CourseBlastModal
          courseId={courseId}
          courseName={course?.title ?? 'Your course'}
          badge={blast.badge}
          onClose={() => setBlast(null)}
        />
      ) : null}

      {isInstructorFlag && isImportPanelOpen ? (
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
          <div ref={assessmentModalRef} className={`${styles.confirmModal} ${styles.assessmentModal}`}>
            <button
              type="button"
              className={styles.modalCloseButton}
              onClick={closeAssessmentCodeModal}
              aria-label="Close assessment code dialog"
            >
              ×
            </button>

            <div className={styles.assessmentModalHeader}>
              <div className={styles.assessmentModalIcon} aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3M7 12h10" />
                </svg>
              </div>
              <div>
                <h2 className={styles.modalTitle}>Assess student</h2>
                <p className={styles.modalText}>Enter the code displayed beneath the student&apos;s QR code.</p>
              </div>
            </div>
            <label className={styles.assessmentCodeField}>
              <span>Assessment code</span>
              <input
                aria-label="Assessment code"
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
                autoComplete="off"
                autoFocus
                aria-invalid={Boolean(assessmentCodeError)}
                aria-describedby={assessmentCodeError ? 'assessment-code-error' : 'assessment-code-hint'}
              />
              <small id="assessment-code-hint">Enter letters and numbers; hyphens are optional.</small>
            </label>
            {assessmentCodeError ? (
              <p id="assessment-code-error" className={styles.assessmentCodeError}>
                {assessmentCodeError}
              </p>
            ) : null}

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

      {isDeleteCourseOpen && course ? (
        <div
          className={styles.importOverlay}
          role="presentation"
          onClick={() => !isDeleting && setIsDeleteCourseOpen(false)}
        >
          <div
            ref={deleteCourseModalRef}
            className={`${styles.importModal} ${styles.deleteCourseModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-course-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.importCloseButton}
              onClick={() => setIsDeleteCourseOpen(false)}
              aria-label="Close delete course dialog"
              disabled={isDeleting}
            >
              ×
            </button>
            <div className={styles.modalSystemHeader}>
              <div className={`${styles.modalSystemIcon} ${styles.modalSystemIconDanger}`} aria-hidden="true">
                !
              </div>
              <div>
                <h2 id="delete-course-title" className={styles.importTitle}>
                  Delete course?
                </h2>
                <p className={styles.importSubtitle}>This action cannot be undone.</p>
              </div>
            </div>
            <div className={styles.deleteCourseSummary}>
              <strong>{course.title}</strong>
              <span>
                {studentCount} students · {assignedBadges.length} badges
              </span>
            </div>
            <p className={styles.deleteCourseWarning}>
              This permanently removes the course and its content. Student progress associated with this course will no
              longer be available.
            </p>
            <div className={styles.importModalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setIsDeleteCourseOpen(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.deleteConfirmButton}
                onClick={handleDeleteCourse}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting…' : 'Delete course'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {badgePendingEdit ? (
        <div className={styles.importOverlay} onClick={closeBadgeSettings}>
          <div
            ref={settingsModalRef}
            className={styles.importModal}
            role="dialog"
            aria-modal="true"
            aria-label={`Edit settings for ${badgePendingEdit.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.importCloseButton}
              onClick={closeBadgeSettings}
              aria-label="Close badge settings"
              disabled={isSavingSettings || isDeleting}
            >
              ×
            </button>

            <div className={styles.importModalHeader}>
              <h3 className={styles.importTitle}>Edit badge settings</h3>
              <p className={styles.importSubtitle}>
                {badgePendingEdit.name} · Added{' '}
                {new Date(badgePendingEdit.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>

            {settingsError ? <p className={styles.errorText}>{settingsError}</p> : null}

            <div className={styles.importField}>
              <span>Content Availability</span>
              <RangeCalendar
                availableOn={editAvailableOn}
                closesOn={editClosesOn}
                neverCloses={editNeverCloses}
                onAvailableOnChange={setEditAvailableOn}
                onClosesOnChange={setEditClosesOn}
                onNeverClosesChange={setEditNeverCloses}
              />
            </div>

            <div className={styles.importModalActions}>
              {!showUnassignConfirm ? (
                <button
                  type="button"
                  className={styles.dangerSecondaryButton}
                  onClick={() => setShowUnassignConfirm(true)}
                  disabled={isSavingSettings || isDeleting}
                >
                  Unassign badge
                </button>
              ) : null}
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={closeBadgeSettings}
                disabled={isSavingSettings || isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={saveBadgeSettings}
                disabled={isSavingSettings || isDeleting}
              >
                {isSavingSettings ? 'Saving…' : 'Save changes'}
              </button>
            </div>

            {showUnassignConfirm ? (
              <div className={styles.dangerZone}>
                <p className={styles.dangerText}>
                  This removes the badge and its lesson from this course. The badge itself will not be deleted and can
                  be imported again later.
                </p>
                <div className={styles.importModalActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setShowUnassignConfirm(false)}
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
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
