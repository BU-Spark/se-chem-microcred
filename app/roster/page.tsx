'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';

import Sidebar, { SIDEBAR_NAV } from '../_components/Sidebar';
import styles from './page.module.css';

type EnrollmentSummary = {
  id: string;
  role: 'STUDENT' | 'INSTRUCTOR' | 'CHECKER';
  status: 'PENDING' | 'ACTIVE';
  sections: string[];
  student: {
    id: string;
    name: string | null;
    email: string | null;
    buid: string | null;
  };
};

type CourseRoster = {
  id: string;
  title: string;
  createdBy: {
    name: string | null;
    email: string | null;
  } | null;
  enrollments: EnrollmentSummary[];
};

type CourseRosterResponse = {
  viewerRole?: 'STUDENT' | 'INSTRUCTOR' | 'CHECKER';
  course: CourseRoster;
};

type RosterRole = 'STUDENT' | 'CHECKER';

type RosterMemberRow = {
  enrollmentId: string;
  memberId: string;
  firstName: string;
  lastName: string;
  email: string;
  buid: string;
  sections: string[];
  sectionLabel: string;
};

type RosterFilters = {
  lastName: string;
  firstName: string;
  buid: string;
  email: string;
  section: string;
};

const EMPTY_FILTERS: RosterFilters = {
  lastName: '',
  firstName: '',
  buid: '',
  email: '',
  section: '',
};

function splitName(fullName?: string | null) {
  const parts = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];

  if (parts.length === 0) {
    return { firstName: '', lastName: '' };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts.at(-1) ?? '',
  };
}

function resolveRosterRole(role?: string | null): RosterRole {
  return role === 'CHECKER' ? 'CHECKER' : 'STUDENT';
}

function buildMemberProfileHref(courseId: string, memberId: string) {
  const params = new URLSearchParams({ courseId });

  return `/roster/${encodeURIComponent(memberId)}?${params.toString()}`;
}

function useCourseRoster(courseId?: string | null, email?: string | null) {
  const [data, setData] = useState<CourseRosterResponse | null>(null);
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
        throw new Error(payload.error ?? 'Unable to load course roster.');
      }

      setData(payload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Unable to load course roster.');
    } finally {
      setIsLoading(false);
    }
  }, [courseId, email]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refresh: fetchData };
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M16.5 16.5 21 21" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export default function StudentRosterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<RosterFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<RosterFilters>(EMPTY_FILTERS);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const courseId = searchParams.get('courseId');
  const rosterRole = resolveRosterRole(searchParams.get('role'));
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const { data, isLoading, error, refresh } = useCourseRoster(courseId, email);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const isCheckerRoster = rosterRole === 'CHECKER';
  const rosterLabel = isCheckerRoster ? 'Assessor' : 'Student';
  const rosterPluralLabel = isCheckerRoster ? 'assessors' : 'students';
  const searchAriaLabel = isCheckerRoster ? 'Search assessors' : 'Search students';
  const emptyResultsMessage = isCheckerRoster
    ? 'No assessors match the current search or filters.'
    : 'No students match the current search or filters.';

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
    } catch (error) {
      console.error('Failed to sign out', error);
      setIsSigningOut(false);
    }
  };

  // One-click section filter. Applies immediately (and mirrors into the draft so
  // the filter panel's Section control stays in sync). Passing '' (the "All"
  // chip) or re-clicking the active section clears the section filter.
  const handleSectionQuickFilter = (section: string) => {
    const next = appliedFilters.section === section ? '' : section;
    setAppliedFilters((current) => ({ ...current, section: next }));
    setDraftFilters((current) => ({ ...current, section: next }));
  };

  const course = data?.course ?? null;
  const isInstructor = data?.viewerRole === 'INSTRUCTOR';
  const displayName = course?.createdBy?.name || '';

  // Pending assessor requests an instructor can approve/decline (CHECKER roster only).
  const pendingAssessors = useMemo(() => {
    if (!course || !isCheckerRoster || !isInstructor) return [];
    return course.enrollments
      .filter((enrollment) => enrollment.role === 'CHECKER' && enrollment.status === 'PENDING')
      .map((enrollment) => {
        const { firstName, lastName } = splitName(enrollment.student.name);
        return {
          enrollmentId: enrollment.id,
          name: [firstName, lastName].filter(Boolean).join(' ') || enrollment.student.email || 'Unknown',
          email: enrollment.student.email?.trim() ?? '',
        };
      });
  }, [course, isCheckerRoster, isInstructor]);

  const handleAssessorDecision = useCallback(
    async (enrollmentId: string, action: 'approve' | 'decline') => {
      if (!courseId || pendingActionId) return;
      setPendingActionId(enrollmentId);
      try {
        const response = await fetch(
          `/api/courses/${encodeURIComponent(courseId)}/enrollments/${encodeURIComponent(enrollmentId)}`,
          { method: action === 'approve' ? 'PATCH' : 'DELETE', headers: { Accept: 'application/json' } }
        );
        if (!response.ok) throw new Error('Request failed');
        await refresh();
      } catch (err) {
        console.error(`Failed to ${action} assessor:`, err);
      } finally {
        setPendingActionId(null);
      }
    },
    [courseId, pendingActionId, refresh]
  );

  const rosterRows = useMemo<RosterMemberRow[]>(() => {
    if (!course) return [];

    return course.enrollments
      .filter((enrollment) => enrollment.role === rosterRole && enrollment.status !== 'PENDING')
      .map((enrollment) => {
        const { firstName, lastName } = splitName(enrollment.student.name);

        return {
          enrollmentId: enrollment.id,
          memberId: enrollment.student.id,
          firstName,
          lastName,
          email: enrollment.student.email?.trim() ?? '',
          buid: enrollment.student.buid?.trim() ?? '',
          sections: enrollment.sections,
          sectionLabel: enrollment.sections.join(', '),
        };
      });
  }, [course, rosterRole]);

  const sectionOptions = useMemo(() => {
    const sections = Array.from(
      new Set(rosterRows.flatMap((member) => member.sections).filter((section) => section.length > 0))
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    return ['ALL', ...sections];
  }, [rosterRows]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = searchValue.trim().toLowerCase();
    const normalizedLastName = appliedFilters.lastName.trim().toLowerCase();
    const normalizedFirstName = appliedFilters.firstName.trim().toLowerCase();
    const normalizedBuid = appliedFilters.buid.trim().toLowerCase();
    const normalizedEmail = appliedFilters.email.trim().toLowerCase();

    return rosterRows.filter((member) => {
      if (appliedFilters.section && !member.sections.includes(appliedFilters.section)) {
        return false;
      }

      if (normalizedLastName && !member.lastName.toLowerCase().includes(normalizedLastName)) {
        return false;
      }

      if (normalizedFirstName && !member.firstName.toLowerCase().includes(normalizedFirstName)) {
        return false;
      }

      if (normalizedBuid && !member.buid.toLowerCase().includes(normalizedBuid)) {
        return false;
      }

      if (normalizedEmail && !member.email.toLowerCase().includes(normalizedEmail)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [member.firstName, member.lastName, member.email, member.buid, member.sectionLabel]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [appliedFilters, rosterRows, searchValue]);

  const activeFilterPills = useMemo(() => {
    const pills: string[] = [];

    if (appliedFilters.lastName) {
      pills.push(`Last Name: ${appliedFilters.lastName}`);
    }
    if (appliedFilters.firstName) {
      pills.push(`First Name: ${appliedFilters.firstName}`);
    }
    if (appliedFilters.buid) {
      pills.push(`BUID: ${appliedFilters.buid}`);
    }
    if (appliedFilters.email) {
      pills.push(`Email: ${appliedFilters.email}`);
    }
    if (appliedFilters.section) {
      pills.push(`Section: ${appliedFilters.section}`);
    }

    return pills;
  }, [appliedFilters]);

  useEffect(() => {
    if (selectedMemberId && !filteredRows.some((member) => member.memberId === selectedMemberId)) {
      setSelectedMemberId(null);
    }
  }, [filteredRows, selectedMemberId]);

  const handleRosterRowClick = (memberId: string) => {
    if (!courseId) {
      return;
    }

    if (selectedMemberId === memberId) {
      router.push(buildMemberProfileHref(courseId, memberId));
      return;
    }

    setSelectedMemberId(memberId);
  };

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
    setIsFilterOpen(false);
  };

  const clearFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setIsFilterOpen(false);
  };

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <div className={styles.page}>
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={styles.main}>
        <div className={styles.content}>
          {courseId ? (
            <Link href={`/courses/${courseId}`} className={styles.backLink}>
              <span aria-hidden="true">←</span> Back to course
            </Link>
          ) : null}

          <header className={styles.header}>
            <h1 className={styles.pageTitle}>{rosterLabel} Roster</h1>
            <p className={styles.pageSubtitle}>
              {course ? (
                <>
                  Showing {rosterPluralLabel} enrolled in: <strong>{course.title}</strong>
                </>
              ) : (
                `Showing ${rosterPluralLabel} enrolled in the selected course`
              )}
            </p>
          </header>

          {!courseId && !isLoading ? (
            <p className={styles.statusMessage}>Select a course to view its {rosterPluralLabel} roster.</p>
          ) : null}

          {isLoading ? <p className={styles.statusMessage}>Loading course roster...</p> : null}

          {!isLoading && error ? <p className={styles.statusMessage}>{error}</p> : null}

          {!isLoading && !error && course ? (
            <>
              <div className={styles.toolbar}>
                <label className={styles.searchField}>
                  <span className={styles.searchIcon}>
                    <SearchIcon />
                  </span>
                  <input
                    type="search"
                    placeholder="Search"
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    className={styles.searchInput}
                    aria-label={searchAriaLabel}
                  />
                  <button
                    type="button"
                    className={styles.filterButton}
                    aria-label="Filters"
                    aria-expanded={isFilterOpen}
                    onClick={() => setIsFilterOpen((prev) => !prev)}
                  >
                    <FilterIcon />
                  </button>
                </label>

                <div className={styles.filters}>
                  <span className={styles.filtersLabel}>Filters applied:</span>
                  {activeFilterPills.length > 0 ? (
                    activeFilterPills.map((pill) => (
                      <span key={pill} className={[styles.filterPill, styles.filterPillActive].join(' ')}>
                        {pill}
                      </span>
                    ))
                  ) : (
                    <span className={styles.noFilters}>None</span>
                  )}
                </div>
              </div>

              {sectionOptions.length > 1 ? (
                <div className={styles.sectionFilters}>
                  <span className={styles.filtersLabel}>Section:</span>
                  <button
                    type="button"
                    className={[styles.filterPill, appliedFilters.section === '' ? styles.filterPillActive : ''].join(
                      ' '
                    )}
                    aria-pressed={appliedFilters.section === ''}
                    onClick={() => handleSectionQuickFilter('')}
                  >
                    All
                  </button>
                  {sectionOptions
                    .filter((section) => section !== 'ALL')
                    .map((section) => (
                      <button
                        key={section}
                        type="button"
                        className={[
                          styles.filterPill,
                          appliedFilters.section === section ? styles.filterPillActive : '',
                        ].join(' ')}
                        aria-pressed={appliedFilters.section === section}
                        onClick={() => handleSectionQuickFilter(section)}
                      >
                        {section}
                      </button>
                    ))}
                </div>
              ) : null}

              {isFilterOpen ? (
                <section className={styles.filterPanel}>
                  <div className={styles.filterPanelHeader}>
                    <h2 className={styles.filterPanelTitle}>Filters</h2>
                  </div>

                  <div className={styles.filterGrid}>
                    <label className={styles.filterField}>
                      <span className={styles.filterFieldLabel}>Last Name</span>
                      <input
                        type="text"
                        value={draftFilters.lastName}
                        onChange={(event) =>
                          setDraftFilters((current) => ({
                            ...current,
                            lastName: event.target.value,
                          }))
                        }
                        className={styles.filterInput}
                      />
                    </label>

                    <label className={styles.filterField}>
                      <span className={styles.filterFieldLabel}>First Name</span>
                      <input
                        type="text"
                        value={draftFilters.firstName}
                        onChange={(event) =>
                          setDraftFilters((current) => ({
                            ...current,
                            firstName: event.target.value,
                          }))
                        }
                        className={styles.filterInput}
                      />
                    </label>

                    <label className={styles.filterField}>
                      <span className={styles.filterFieldLabel}>BUID Number</span>
                      <input
                        type="text"
                        value={draftFilters.buid}
                        onChange={(event) =>
                          setDraftFilters((current) => ({
                            ...current,
                            buid: event.target.value,
                          }))
                        }
                        className={styles.filterInput}
                      />
                    </label>

                    <label className={styles.filterField}>
                      <span className={styles.filterFieldLabel}>Email</span>
                      <input
                        type="text"
                        value={draftFilters.email}
                        onChange={(event) =>
                          setDraftFilters((current) => ({
                            ...current,
                            email: event.target.value,
                          }))
                        }
                        className={styles.filterInput}
                      />
                    </label>

                    <label className={styles.filterField}>
                      <span className={styles.filterFieldLabel}>Section</span>
                      <select
                        value={draftFilters.section}
                        onChange={(event) =>
                          setDraftFilters((current) => ({
                            ...current,
                            section: event.target.value,
                          }))
                        }
                        className={styles.filterSelect}
                      >
                        <option value="">All Sections</option>
                        {sectionOptions
                          .filter((section) => section !== 'ALL')
                          .map((section) => (
                            <option key={section} value={section}>
                              {section}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>

                  <div className={styles.filterActions}>
                    <button type="button" className={styles.clearFiltersButton} onClick={clearFilters}>
                      Clear
                    </button>
                    <button type="button" className={styles.applyFiltersButton} onClick={applyFilters}>
                      Apply Filters
                    </button>
                  </div>
                </section>
              ) : null}

              {pendingAssessors.length > 0 ? (
                <section className={styles.pendingCard}>
                  <h2 className={styles.pendingTitle}>Pending Assessor Requests</h2>
                  <ul className={styles.pendingList}>
                    {pendingAssessors.map((request) => (
                      <li key={request.enrollmentId} className={styles.pendingItem}>
                        <div className={styles.pendingInfo}>
                          <span className={styles.pendingName}>{request.name}</span>
                          {request.email ? <span className={styles.pendingEmail}>{request.email}</span> : null}
                        </div>
                        <div className={styles.pendingActions}>
                          <button
                            type="button"
                            className={styles.approveButton}
                            disabled={pendingActionId === request.enrollmentId}
                            onClick={() => handleAssessorDecision(request.enrollmentId, 'approve')}
                          >
                            {pendingActionId === request.enrollmentId ? 'Working…' : 'Accept'}
                          </button>
                          <button
                            type="button"
                            className={styles.declineButton}
                            disabled={pendingActionId === request.enrollmentId}
                            onClick={() => handleAssessorDecision(request.enrollmentId, 'decline')}
                          >
                            Decline
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className={styles.tableCard}>
                <div className={styles.tableScroll}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Last Name</th>
                        <th>First Name</th>
                        <th>BUID Number</th>
                        <th>Email</th>
                        <th>Section</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.length > 0 ? (
                        filteredRows.map((member) => (
                          <tr
                            key={member.enrollmentId}
                            className={styles.selectableRow}
                            data-selected={selectedMemberId === member.memberId}
                            tabIndex={0}
                            onClick={() => handleRosterRowClick(member.memberId)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                handleRosterRowClick(member.memberId);
                              }
                            }}
                          >
                            <td>{member.lastName || '—'}</td>
                            <td>{member.firstName || '—'}</td>
                            <td>{member.buid || '—'}</td>
                            <td>{member.email || '—'}</td>
                            <td>{member.sectionLabel || '—'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className={styles.emptyCell} colSpan={5}>
                            {emptyResultsMessage}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
