'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import { useStudentData, type BadgeRecord } from '../hooks/useStudentData';
import { useMyCourses } from '../hooks/useMyCourses';
import { derivePassportNumber, formatPassportDate } from '@/lib/students/passport';
import styles from './page.module.css';
import Sidebar, { SIDEBAR_NAV } from '@/app/components/Navigation/Sidebar';
import PageHeading from '@/app/components/PageHeading/PageHeading';
import BadgeImage from '@/app/components/BadgeImage/BadgeImage';
import Modal from '@/app/components/Modal/Modal';
import EarnedBeforePicker from './EarnedBeforePicker';

// Completed badges whose course can't be resolved (no lesson-backed requirement,
// or a course the student is no longer enrolled in) collect under one option.
// Real options are course ids, so a non-uuid sentinel can never collide with one.
const OTHER_FILTER = 'other';

type CourseMeta = {
  id: string;
  title: string;
  code: string | null;
};

type PassportEntry = {
  badge: BadgeRecord;
  course: CourseMeta | null;
  awardedAtMs: number | null;
};

/**
 * End of the local day for a `YYYY-MM-DD` input value, so "earned on or before"
 * includes everything awarded during that day. Parsed field-by-field because
 * `new Date('2026-03-04')` is UTC midnight, which drops the whole day for
 * viewers behind UTC.
 */
function endOfLocalDay(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function avatarAsset(base?: string | null) {
  switch (base) {
    case 'RUBY':
      return '/edit_avatar/ruby.svg';
    case 'EMERALD':
      return '/edit_avatar/emerald.svg';
    case 'AMETHYST':
      return '/edit_avatar/amethyst.svg';
    case 'SAPPHIRE':
    default:
      return '/edit_avatar/sapphire.svg';
  }
}

// Fallback mark for a badge with no uploaded art: the screenshot's check-square.
function VerifiedCheck() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function BadgePassportPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const signOut = useSignOut();
  // No courseId: the passport is cross-course by design (see lib/students/badgeScope).
  const { data: studentData } = useStudentData(user?.primaryEmailAddress?.emailAddress);
  const { enrolled } = useMyCourses(isLoaded && isSignedIn);

  const [isSigningOut, setIsSigningOut] = useState(false);
  // Empty = every course. Storing the selection rather than an "all" sentinel keeps
  // "none checked" and "all checked" the same view, which is what students expect
  // from a checkbox list.
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [isCourseFilterOpen, setIsCourseFilterOpen] = useState(false);
  // `YYYY-MM-DD` from a native date input; '' = no upper bound.
  const [earnedBefore, setEarnedBefore] = useState('');
  const [activeBadgeId, setActiveBadgeId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn && !isSigningOut) router.replace('/sign-in');
  }, [isLoaded, isSignedIn, isSigningOut, router]);

  useEffect(() => {
    setExportStatus(null);
  }, [activeBadgeId]);

  const displayName = studentData?.student.name || '';

  // courseId -> title/code, from the student's own enrollments. The badge payload
  // carries only a courseId, so course labels have to come from this side.
  const courseById = useMemo(() => {
    const map = new Map<string, CourseMeta>();
    for (const enrollment of enrolled?.enrollments ?? []) {
      const course = enrollment?.course;
      if (!course?.id) continue;
      map.set(course.id, { id: course.id, title: course.title ?? 'Course', code: course.code ?? null });
    }
    // The single course on studentData is a cheap backstop for the very common
    // one-course student while /api/courses/mine is still in flight.
    const current = studentData?.course;
    if (current?.id && !map.has(current.id)) {
      map.set(current.id, { id: current.id, title: current.title, code: current.code ?? null });
    }
    return map;
  }, [enrolled, studentData?.course]);

  // The passport is a record of finished work only — no locked/in-review/learning
  // states. Those still live on the course dashboard, which owns the QR and
  // finalize flows.
  const entries = useMemo<PassportEntry[]>(() => {
    const completed = studentData?.badges?.completed ?? [];

    return completed
      .map((badge) => {
        const awarded = badge.awardedAt ? new Date(badge.awardedAt).getTime() : Number.NaN;
        return {
          badge,
          course: badge.courseId ? (courseById.get(badge.courseId) ?? null) : null,
          awardedAtMs: Number.isNaN(awarded) ? null : awarded,
        };
      })
      .sort((a, b) => {
        // Chronological, oldest first — it reads as a transcript. Undated badges
        // sink to the bottom rather than pretending to be the earliest entries.
        if (a.awardedAtMs === null && b.awardedAtMs === null) return a.badge.name.localeCompare(b.badge.name);
        if (a.awardedAtMs === null) return 1;
        if (b.awardedAtMs === null) return -1;
        return a.awardedAtMs - b.awardedAtMs;
      });
  }, [courseById, studentData?.badges?.completed]);

  // Only courses that actually contributed a completed badge get an option — an
  // option that filters to an empty list is just a dead end.
  const courseOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      const key = entry.course?.id ?? OTHER_FILTER;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const options = [...counts.entries()]
      .filter(([id]) => id !== OTHER_FILTER)
      .map(([id, count]) => ({ id, label: courseById.get(id)?.title ?? 'Course', count }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const otherCount = counts.get(OTHER_FILTER) ?? 0;
    // "Other" sorts last: it's a catch-all, not a course.
    return otherCount ? [...options, { id: OTHER_FILTER, label: 'Other', count: otherCount }] : options;
  }, [courseById, entries]);

  // A course can disappear under the user (badge data revalidates, enrollment
  // ends). Drop stale ids so the record never filters against something the
  // student can no longer see or uncheck.
  useEffect(() => {
    setSelectedCourseIds((current) => {
      if (!current.length) return current;
      const available = new Set(courseOptions.map((option) => option.id));
      const next = current.filter((id) => available.has(id));
      return next.length === current.length ? current : next;
    });
  }, [courseOptions]);

  const earnedBeforeMs = useMemo(() => (earnedBefore ? endOfLocalDay(earnedBefore) : null), [earnedBefore]);

  const visibleEntries = useMemo(() => {
    const courseFilter = new Set(selectedCourseIds);

    return entries.filter((entry) => {
      if (courseFilter.size && !courseFilter.has(entry.course?.id ?? OTHER_FILTER)) return false;
      // A badge with no award date can't be shown to fall on or before a chosen
      // day, so a date filter excludes it rather than guessing.
      if (earnedBeforeMs !== null && (entry.awardedAtMs === null || entry.awardedAtMs > earnedBeforeMs)) return false;
      return true;
    });
  }, [earnedBeforeMs, entries, selectedCourseIds]);

  const isFiltered = selectedCourseIds.length > 0 || Boolean(earnedBefore);

  const courseFilterLabel = useMemo(() => {
    if (!selectedCourseIds.length) return 'All courses';
    if (selectedCourseIds.length === 1) {
      return courseOptions.find((option) => option.id === selectedCourseIds[0])?.label ?? '1 course';
    }
    return `${selectedCourseIds.length} courses`;
  }, [courseOptions, selectedCourseIds]);

  const toggleCourse = (id: string) => {
    setSelectedCourseIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );
  };

  const clearFilters = () => {
    setSelectedCourseIds([]);
    setEarnedBefore('');
  };

  const courseCount = useMemo(() => new Set(entries.map((entry) => entry.course?.id).filter(Boolean)).size, [entries]);

  const activeEntry = entries.find((entry) => entry.badge.id === activeBadgeId) ?? null;

  const passportNumber = derivePassportNumber(studentData?.student.id);
  const issuedOn = formatPassportDate(studentData?.student.createdAt);
  const avatarSrc = avatarAsset(studentData?.student.avatar?.base);
  const studentEmail = studentData?.student?.email || user?.primaryEmailAddress?.emailAddress || null;

  if (!isLoaded || !isSignedIn) return null;

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/splash');
    } catch (e) {
      console.error('Failed to sign out', e);
      setIsSigningOut(false);
    }
  };

  const reviewFeedback = (badge: BadgeRecord) => {
    setActiveBadgeId(null);
    const courseParam = badge.courseId ? `?courseId=${encodeURIComponent(badge.courseId)}` : '';
    router.push(`/badges/${badge.slug}/feedback${courseParam}`);
  };

  const exportBadgeToLinkedIn = async (badge: BadgeRecord) => {
    if (!studentEmail) {
      setExportStatus('Please sign in again to export badges.');
      return;
    }

    setIsExporting(true);
    setExportStatus(null);

    try {
      const response = await fetch(`/api/badges/export/${badge.id}?email=${encodeURIComponent(studentEmail)}`);

      const body = (await response.json().catch(() => ({}))) as {
        linkedInUrl?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error || 'Unable to prepare LinkedIn export.');
      }

      if (!body.linkedInUrl) {
        throw new Error('LinkedIn URL unavailable.');
      }

      window.open(body.linkedInUrl, '_blank', 'noopener,noreferrer');

      setExportStatus('LinkedIn window opened. After you sign in, confirm the fields and save the certificate.');
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : 'Failed to create LinkedIn export.');
    } finally {
      setIsExporting(false);
    }
  };

  const summaryLine = [
    `${entries.length} ${entries.length === 1 ? 'badge' : 'badges'}`,
    courseCount ? `across ${courseCount} ${courseCount === 1 ? 'course' : 'courses'}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const renderEntry = (entry: PassportEntry) => {
    const { badge, course } = entry;
    const hasArt = Boolean(badge.imageUrl || badge.youtubeUrl);

    return (
      <li key={badge.id} className={styles.entry}>
        <button type="button" className={styles.entryButton} onClick={() => setActiveBadgeId(badge.id)}>
          <span className={styles.entryMark}>
            {hasArt ? (
              <BadgeImage
                imageUrl={badge.imageUrl}
                imagePositionX={badge.imagePositionX}
                imagePositionY={badge.imagePositionY}
                imageScale={badge.imageScale}
                videoUrl={badge.youtubeUrl}
                alt=""
                className={styles.entryImage}
              />
            ) : (
              <span className={styles.entryCheck}>
                <VerifiedCheck />
              </span>
            )}
            <span className={styles.entryDot} aria-hidden="true" />
          </span>

          <span className={styles.entryText}>
            <span className={styles.entryName}>{badge.name}</span>
            <span className={styles.entryCourse}>{course?.title ?? 'Independent badge'}</span>
          </span>

          <span className={styles.entryMeta}>
            <span className={styles.entryDate}>{formatPassportDate(badge.awardedAt) ?? '—'}</span>
            {course?.code ? <span className={styles.entryCode}>{course.code}</span> : null}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="page">
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className="main">
        <div className={styles.passportRoot}>
          <PageHeading title="Badge Passport" eyebrow="Skills passport · Verified record" />

          <header className={styles.identityCard}>
            <div className={styles.identityLeft}>
              <div className={styles.avatarFrame}>
                <Image src={avatarSrc} alt="" width={72} height={72} className={styles.avatarImage} />
              </div>
              <div>
                <p className={styles.identityName}>{displayName || 'Your passport'}</p>
                <p className={styles.identityMeta}>{summaryLine}</p>
              </div>
            </div>

            {passportNumber || issuedOn ? (
              <div className={styles.identityRight}>
                {passportNumber ? (
                  <>
                    <span className={styles.identityLabel}>Passport no.</span>
                    <span className={styles.identityNumber}>{passportNumber}</span>
                  </>
                ) : null}
                {issuedOn ? <span className={styles.identityIssued}>Issued {issuedOn}</span> : null}
              </div>
            ) : null}
          </header>

          <div className={styles.filterRow}>
            {courseOptions.length > 1 ? (
              <button
                type="button"
                className={[styles.filterControl, selectedCourseIds.length ? styles.filterControlActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setIsCourseFilterOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={isCourseFilterOpen}
              >
                <span className={styles.filterControlLabel}>Courses</span>
                <span className={styles.filterControlValue}>{courseFilterLabel}</span>
              </button>
            ) : null}

            <EarnedBeforePicker value={earnedBefore} onChange={setEarnedBefore} />

            {isFiltered ? (
              <button type="button" className={styles.filterClear} onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}

            {/* Only while filtered: unfiltered, this would just repeat the count
                already in the identity strip. */}
            {isFiltered ? (
              <span className={styles.filterSummary} role="status">
                Showing {visibleEntries.length} of {entries.length}
              </span>
            ) : null}
          </div>

          <section className={styles.recordCard} aria-label="Completed badges">
            {visibleEntries.length ? (
              <ul className={styles.entryGrid}>{visibleEntries.map(renderEntry)}</ul>
            ) : (
              <p className={styles.emptyState}>
                {entries.length
                  ? 'No completed badges match these filters.'
                  : "You haven't completed any badges yet. Finish a lesson and pass its assessment to add your first entry."}
              </p>
            )}

            <p className={styles.recordFootnote}>
              <span className={styles.footnoteDot} aria-hidden="true" />
              Every entry is a passed assessment. Nothing here is self-reported.
            </p>
          </section>
        </div>

        {isCourseFilterOpen ? (
          <Modal
            onClose={() => setIsCourseFilterOpen(false)}
            overlayClassName={styles.detailOverlay}
            className={styles.filterModal}
            ariaLabel="Filter badges by course"
          >
            <div className={styles.filterModalHeader}>
              <h2 className={styles.detailTitle}>Courses</h2>
              <button
                type="button"
                className={styles.detailClose}
                onClick={() => setIsCourseFilterOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <p className={styles.filterModalHint}>
              {selectedCourseIds.length ? 'Showing the checked courses.' : 'Nothing checked shows every course.'}
            </p>

            <ul className={styles.filterOptionList}>
              {courseOptions.map((option) => (
                <li key={option.id}>
                  <label className={styles.filterOption}>
                    <input
                      type="checkbox"
                      checked={selectedCourseIds.includes(option.id)}
                      onChange={() => toggleCourse(option.id)}
                    />
                    <span className={styles.filterOptionLabel}>{option.label}</span>
                    <span className={styles.filterCount}>{option.count}</span>
                  </label>
                </li>
              ))}
            </ul>

            <div className={styles.detailActions}>
              <button type="button" className={styles.detailPrimary} onClick={() => setIsCourseFilterOpen(false)}>
                Done
              </button>
              <button
                type="button"
                className={styles.detailLink}
                onClick={() => setSelectedCourseIds([])}
                disabled={!selectedCourseIds.length}
              >
                Clear selection
              </button>
            </div>
          </Modal>
        ) : null}

        {activeEntry ? (
          <Modal
            onClose={() => setActiveBadgeId(null)}
            overlayClassName={styles.detailOverlay}
            className={styles.detailCard}
            ariaLabel={`${activeEntry.badge.name} details`}
          >
            <button
              type="button"
              className={styles.detailClose}
              onClick={() => setActiveBadgeId(null)}
              aria-label="Close"
            >
              ×
            </button>

            <div className={styles.detailHeader}>
              <span className={styles.detailMark}>
                {activeEntry.badge.imageUrl || activeEntry.badge.youtubeUrl ? (
                  <BadgeImage
                    imageUrl={activeEntry.badge.imageUrl}
                    imagePositionX={activeEntry.badge.imagePositionX}
                    imagePositionY={activeEntry.badge.imagePositionY}
                    imageScale={activeEntry.badge.imageScale}
                    videoUrl={activeEntry.badge.youtubeUrl}
                    alt=""
                    className={styles.entryImage}
                  />
                ) : (
                  <span className={styles.entryCheck}>
                    <VerifiedCheck />
                  </span>
                )}
              </span>
              <div>
                <h2 className={styles.detailTitle}>{activeEntry.badge.name}</h2>
                <p className={styles.detailMeta}>
                  {activeEntry.course?.title ?? 'Independent badge'}
                  {activeEntry.badge.awardedAt ? ` · Earned ${formatPassportDate(activeEntry.badge.awardedAt)}` : ''}
                </p>
              </div>
            </div>

            {activeEntry.badge.description ? (
              <p className={styles.detailDescription}>{activeEntry.badge.description}</p>
            ) : null}

            <div className={styles.detailActions}>
              <button
                type="button"
                className={styles.detailPrimary}
                onClick={() => exportBadgeToLinkedIn(activeEntry.badge)}
                disabled={isExporting}
              >
                {isExporting ? 'Preparing LinkedIn package…' : 'Export to LinkedIn'}
              </button>
              <button type="button" className={styles.detailLink} onClick={() => reviewFeedback(activeEntry.badge)}>
                Review feedback
              </button>
            </div>

            {exportStatus ? <p className={styles.detailStatus}>{exportStatus}</p> : null}
          </Modal>
        ) : null}
      </main>
    </div>
  );
}
