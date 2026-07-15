'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';

import Sidebar, { SIDEBAR_NAV } from '../_components/Sidebar';
import BackButton from '../_components/BackButton';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useCourseRoster } from './hooks/useCourseRoster';
import styles from './page.module.css';

type RosterRole = 'STUDENT' | 'CHECKER';
type AddMode = 'single' | 'csv';

type NewRosterMember = {
  firstName: string;
  lastName: string;
  email: string;
  buid: string;
  sections: string;
};

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

const EMPTY_NEW_MEMBER: NewRosterMember = {
  firstName: '',
  lastName: '',
  email: '',
  buid: '',
  sections: '',
};

function parseRosterCsv(csv: string): NewRosterMember[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error('CSV must contain a header and at least one roster member.');
  const headers = lines[0].split(',').map((header) => header.trim().toLowerCase());
  const indexOf = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const indices = {
    lastName: indexOf('lastname'),
    firstName: indexOf('firstname'),
    buid: indexOf('buid'),
    email: indexOf('email'),
    sections: indexOf('sections', 'section'),
  };
  if (Object.values(indices).some((index) => index < 0)) {
    throw new Error('CSV must contain headers: lastName, firstName, buid, email, sections.');
  }
  return lines.slice(1).map((line) => {
    const columns = line.split(',').map((column) => column.trim());
    return {
      lastName: columns[indices.lastName] || '',
      firstName: columns[indices.firstName] || '',
      buid: columns[indices.buid] || '',
      email: columns[indices.email] || '',
      sections: columns[indices.sections] || '',
    };
  });
}

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
  const signOut = useSignOut();

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
  const [memberToRemove, setMemberToRemove] = useState<RosterMemberRow | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('single');
  const [newMember, setNewMember] = useState<NewRosterMember>(EMPTY_NEW_MEMBER);
  const [selectedCsv, setSelectedCsv] = useState<File | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [sectionMember, setSectionMember] = useState<RosterMemberRow | null>(null);
  const [sectionValue, setSectionValue] = useState('');
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [isSavingSection, setIsSavingSection] = useState(false);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
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
  // Only instructors can remove students, and only on the student roster.
  const canRemoveMembers = isInstructor;
  const canAddMembers = isInstructor;
  const canManageSections = isInstructor;
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

  const closeRemoveModal = useCallback(() => {
    if (removingId) return;
    setMemberToRemove(null);
    setRemoveError(null);
  }, [removingId]);

  const removeModalRef = useFocusTrap<HTMLDivElement>(Boolean(memberToRemove), closeRemoveModal);

  const closeAddModal = useCallback(() => {
    if (isAdding) return;
    setIsAddModalOpen(false);
    setAddMode('single');
    setNewMember(EMPTY_NEW_MEMBER);
    setSelectedCsv(null);
    setAddError(null);
  }, [isAdding]);

  const addModalRef = useFocusTrap<HTMLDivElement>(isAddModalOpen, closeAddModal);

  const openAddModal = () => {
    setAddMode('single');
    setNewMember(EMPTY_NEW_MEMBER);
    setSelectedCsv(null);
    setAddError(null);
    setIsAddModalOpen(true);
  };

  const addRosterMembers = async (members: NewRosterMember[]) => {
    if (!courseId) return;
    setIsAdding(true);
    setAddError(null);
    try {
      const response = await fetch(`/api/courses/${encodeURIComponent(courseId)}/members`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: rosterRole, members }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Unable to add roster members.');
      setIsAddModalOpen(false);
      setNewMember(EMPTY_NEW_MEMBER);
      setSelectedCsv(null);
      await refresh();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Unable to add roster members.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddSubmit = async () => {
    if (addMode === 'single') {
      if (!newMember.email.trim() && !newMember.buid.trim()) {
        setAddError('Enter an email or BUID.');
        return;
      }
      await addRosterMembers([newMember]);
      return;
    }
    if (!selectedCsv) {
      setAddError('Choose a CSV file to upload.');
      return;
    }
    try {
      const members = parseRosterCsv(await selectedCsv.text());
      if (members.some((member) => !member.email.trim() && !member.buid.trim())) {
        throw new Error('Every CSV row must include an email or BUID.');
      }
      await addRosterMembers(members);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Unable to read the CSV file.');
    }
  };

  const handleRemoveStudent = useCallback(async () => {
    if (!courseId || !memberToRemove) return;
    setRemovingId(memberToRemove.memberId);
    setRemoveError(null);
    try {
      const response = await fetch(
        `/api/courses/${encodeURIComponent(courseId)}/${isCheckerRoster ? 'assessors' : 'students'}/${encodeURIComponent(memberToRemove.memberId)}`,
        { method: 'DELETE', headers: { Accept: 'application/json' } }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? 'Failed to remove student from course.');
      }
      setMemberToRemove(null);
      await refresh();
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Failed to remove student from course.');
    } finally {
      setRemovingId(null);
    }
  }, [courseId, isCheckerRoster, memberToRemove, refresh]);

  const closeSectionModal = useCallback(() => {
    if (isSavingSection) return;
    setSectionMember(null);
    setSectionError(null);
  }, [isSavingSection]);
  const sectionModalRef = useFocusTrap<HTMLDivElement>(Boolean(sectionMember), closeSectionModal);

  const openSectionModal = (member: RosterMemberRow) => {
    setSectionMember(member);
    setSectionValue(member.sections.join(' | '));
    setSectionError(null);
  };

  const saveSections = async () => {
    if (!courseId || !sectionMember) return;
    const sections = sectionValue
      .split('|')
      .map((section) => section.trim())
      .filter(Boolean);
    if (!isCheckerRoster && sections.length > 1) {
      setSectionError('Students can only belong to one section.');
      return;
    }
    setIsSavingSection(true);
    setSectionError(null);
    try {
      const response = await fetch(
        `/api/courses/${encodeURIComponent(courseId)}/enrollments/${encodeURIComponent(sectionMember.enrollmentId)}/sections`,
        {
          method: 'PUT',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ sections }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Unable to update sections.');
      setSectionMember(null);
      await refresh();
    } catch (error) {
      setSectionError(error instanceof Error ? error.message : 'Unable to update sections.');
    } finally {
      setIsSavingSection(false);
    }
  };

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
          {courseId ? <BackButton href={`/courses/${courseId}`} /> : null}

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

                {canAddMembers ? (
                  <button type="button" className={styles.addMembersButton} onClick={openAddModal}>
                    + Add {isCheckerRoster ? 'assessors' : 'students'}
                  </button>
                ) : null}

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
                        {canRemoveMembers ? <th className={styles.actionsHeader}>Actions</th> : null}
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
                            <td>
                              {canManageSections ? (
                                <div className={styles.sectionCell}>
                                  {member.sectionLabel ? <span>{member.sectionLabel}</span> : null}
                                  <button
                                    type="button"
                                    className={
                                      member.sectionLabel ? styles.editSectionButton : styles.assignSectionButton
                                    }
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openSectionModal(member);
                                    }}
                                  >
                                    {member.sectionLabel ? 'Edit' : 'Assign section'}
                                  </button>
                                </div>
                              ) : (
                                member.sectionLabel || '—'
                              )}
                            </td>
                            {canRemoveMembers ? (
                              <td className={styles.actionsCell}>
                                <button
                                  type="button"
                                  className={styles.removeButton}
                                  disabled={removingId === member.memberId}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setRemoveError(null);
                                    setMemberToRemove(member);
                                  }}
                                >
                                  Remove
                                </button>
                              </td>
                            ) : null}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className={styles.emptyCell} colSpan={canRemoveMembers ? 6 : 5}>
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

          {isAddModalOpen ? (
            <div className={styles.modalOverlay} role="presentation" onMouseDown={closeAddModal}>
              <div
                ref={addModalRef}
                className={`${styles.modal} ${styles.addModal}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-members-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <h2 id="add-members-title" className={styles.modalTitle}>
                  Add {isCheckerRoster ? 'assessors' : 'students'}
                </h2>
                <div className={styles.addModeTabs} role="tablist" aria-label="Add roster members">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={addMode === 'single'}
                    className={`${styles.addModeTab} ${addMode === 'single' ? styles.addModeTabActive : ''}`}
                    onClick={() => {
                      setAddMode('single');
                      setAddError(null);
                    }}
                  >
                    Single user
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={addMode === 'csv'}
                    className={`${styles.addModeTab} ${addMode === 'csv' ? styles.addModeTabActive : ''}`}
                    onClick={() => {
                      setAddMode('csv');
                      setAddError(null);
                    }}
                  >
                    CSV upload
                  </button>
                </div>

                {addMode === 'single' ? (
                  <div className={styles.addMemberGrid}>
                    {(['firstName', 'lastName', 'email', 'buid', 'sections'] as const).map((field) => {
                      const labels = {
                        firstName: 'First name',
                        lastName: 'Last name',
                        email: 'Email',
                        buid: 'BUID',
                        sections: isCheckerRoster ? 'Sections' : 'Section',
                      };
                      return (
                        <label key={field} className={styles.filterField}>
                          <span className={styles.filterFieldLabel}>{labels[field]}</span>
                          <input
                            className={styles.filterInput}
                            type={field === 'email' ? 'email' : 'text'}
                            value={newMember[field]}
                            placeholder={field === 'sections' ? (isCheckerRoster ? 'A1 | A2' : 'A1') : undefined}
                            onChange={(event) =>
                              setNewMember((current) => ({ ...current, [field]: event.target.value }))
                            }
                          />
                        </label>
                      );
                    })}
                    {isCheckerRoster ? (
                      <p className={styles.addHint}>
                        Email or BUID is required. Separate multiple assessor sections with |.
                      </p>
                    ) : (
                      <p className={styles.addHint}>
                        Email or BUID is required. Students can only be assigned to one section.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className={styles.csvPanel}>
                    <p className={styles.modalBody}>
                      Upload a CSV with headers: lastName, firstName, buid, email, sections.
                    </p>
                    <input
                      ref={csvInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className={styles.csvInput}
                      onChange={(event) => setSelectedCsv(event.target.files?.[0] ?? null)}
                    />
                    {selectedCsv ? <p className={styles.selectedFile}>{selectedCsv.name}</p> : null}
                  </div>
                )}

                {addError ? <p className={styles.modalError}>{addError}</p> : null}
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.clearFiltersButton}
                    onClick={closeAddModal}
                    disabled={isAdding}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.applyFiltersButton}
                    disabled={isAdding}
                    onClick={() => void handleAddSubmit()}
                  >
                    {isAdding ? 'Adding…' : addMode === 'single' ? `Add ${rosterLabel.toLowerCase()}` : 'Upload CSV'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {sectionMember ? (
            <div className={styles.modalOverlay} role="presentation" onMouseDown={closeSectionModal}>
              <div
                ref={sectionModalRef}
                className={styles.modal}
                role="dialog"
                aria-modal="true"
                aria-labelledby="section-modal-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <h2 id="section-modal-title" className={styles.modalTitle}>
                  {sectionMember.sectionLabel ? 'Change' : 'Assign'}{' '}
                  {isCheckerRoster ? 'assessor sections' : 'student section'}
                </h2>
                <label className={styles.filterField}>
                  <span className={styles.filterFieldLabel}>{isCheckerRoster ? 'Sections' : 'Section'}</span>
                  <input
                    className={styles.filterInput}
                    value={sectionValue}
                    onChange={(event) => setSectionValue(event.target.value)}
                    placeholder={isCheckerRoster ? 'A1 | A2' : 'A1'}
                    autoFocus
                  />
                </label>
                <p className={styles.addHint}>
                  {isCheckerRoster
                    ? 'Separate multiple sections with |. You can enter a new section name.'
                    : 'You can enter an existing or new section name.'}
                </p>
                {sectionError ? <p className={styles.modalError}>{sectionError}</p> : null}
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.clearFiltersButton}
                    onClick={closeSectionModal}
                    disabled={isSavingSection}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.applyFiltersButton}
                    onClick={() => void saveSections()}
                    disabled={isSavingSection}
                  >
                    {isSavingSection ? 'Saving…' : 'Save sections'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>

      {memberToRemove ? (
        <div className={styles.modalOverlay} role="presentation" onClick={closeRemoveModal}>
          <div
            ref={removeModalRef}
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-member-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="remove-member-title" className={styles.modalTitle}>
              Remove {isCheckerRoster ? 'assessor' : 'student'}?
            </h2>
            <p className={styles.modalBody}>
              Remove{' '}
              <strong>
                {[memberToRemove.firstName, memberToRemove.lastName].filter(Boolean).join(' ') ||
                  memberToRemove.email ||
                  `this ${isCheckerRoster ? 'assessor' : 'student'}`}
              </strong>{' '}
              from <strong>{course?.title}</strong>? They will lose access to this course. This cannot be undone.
            </p>
            {removeError ? <p className={styles.modalError}>{removeError}</p> : null}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.clearFiltersButton}
                disabled={Boolean(removingId)}
                onClick={closeRemoveModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.removeConfirmButton}
                disabled={Boolean(removingId)}
                onClick={handleRemoveStudent}
              >
                {removingId ? 'Removing…' : `Remove ${isCheckerRoster ? 'assessor' : 'student'}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
