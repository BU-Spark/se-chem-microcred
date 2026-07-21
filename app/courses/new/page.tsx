'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import Sidebar, { SIDEBAR_NAV } from '../../_components/Sidebar';
import BackButton from '../../_components/BackButton';
import styles from './page.module.css';
import Image from 'next/image';
import { useStudentData } from '../../hooks/useStudentData';
import { CourseRole } from '@prisma/client';
import CourseImagePicker from './components/CourseImagePicker';
import CourseTileImage from '../../_components/CourseTileImage';
import { COURSE_COLORS, ICON_FG_LIGHT } from '@/lib/courseImage';

const steps = ['Course Info', 'Course Image', 'Upload Class Roster', 'Upload Assessor Roster', 'Review'];

// Named step indices so the wizard's conditionals and edit links stay readable
// (and survive future reordering) rather than depending on bare numbers.
const STEP_INFO = 0;
const STEP_IMAGE = 1;
const STEP_ROSTER = 2;
const STEP_ASSESSOR = 3;
const STEP_REVIEW = 4;

// Old Student row and assessor row types were the exact same colsolidating
type RosterRow = {
  lastName: string;
  firstName: string;
  externalId: string;
  email: string;
  sections: string[] | null;
};
// General declaration a person that could be a part of a course
interface Person {
  name: string;
  email: string;
  externalId: string | null;
  sections: string[] | null;
}

type UploadTarget = 'student' | 'assessor';

type UploadDialogState =
  | {
      type: 'warning';
      target: UploadTarget;
    }
  | {
      type: 'error';
      target: UploadTarget;
      message: string;
    };

type ConfigRowProps = {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  infoText?: React.ReactNode;
};

type EditableCourseResponse = {
  course: {
    id: string;
    title: string;
    sectionCount: number;
    iconName: string | null;
    iconBgColor: string | null;
    iconFgColor: string | null;
    settings: {
      allowCooldownOverride: boolean;
      allowAssessorMessages: boolean;
      allowCrossSectionView: boolean;
    } | null;
    contacts: Array<{
      id: string;
      type: 'INSTRUCTOR' | 'CHECKER';
      name: string;
      email: string;
    }>;
    enrollments: Array<{
      id: string;
      role: 'STUDENT' | 'INSTRUCTOR' | 'CHECKER';
      sections: string[];
      student: {
        id: string;
        name: string;
        email: string;
        externalId: string;
      };
    }>;
  };
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

function toRosterRow(person: Person): RosterRow {
  const { firstName, lastName } = splitName(person.name);

  return {
    firstName,
    lastName,
    externalId: person.externalId?.trim() ?? '',
    email: person.email.trim(),
    sections: person.sections,
  };
}

function parseSections(sectionValue?: string | null): string[] {
  return (sectionValue ?? '')
    .split('|')
    .map((section) => section.trim())
    .filter(Boolean);
}

// Stable identity for a roster row: prefer email, fall back to ID, then name.
// Used to dedupe on CSV upload so re-uploading (or uploading in edit mode) never
// creates duplicate enrollments for the same person.
function rosterKey(row: RosterRow): string {
  return row.email.trim().toLowerCase() || row.externalId.trim() || `${row.firstName.trim()}|${row.lastName.trim()}`;
}

// Append incoming rows to the existing roster instead of replacing it. If a person
// already exists (by rosterKey), keep the existing row untouched and skip the
// incoming duplicate. This is the fix for #168: uploading a CSV in edit mode must
// not wipe students already enrolled in the course.
function mergeRosterRows(existing: RosterRow[], incoming: RosterRow[]): RosterRow[] {
  const seen = new Map<string, RosterRow>();
  for (const row of existing) {
    seen.set(rosterKey(row), row);
  }

  const merged = [...existing];
  for (const row of incoming) {
    const key = rosterKey(row);
    if (seen.has(key)) continue;
    seen.set(key, row);
    merged.push(row);
  }
  return merged;
}

// made change to remove putting multiple sections for an assessor in the during the csv upload going to give that responsiblity to an assessor update in the future
function mergeAssessorRows(rows: RosterRow[]) {
  return Array.from(
    rows.reduce((map, row) => {
      const email = row.email.trim().toLowerCase();
      const externalId = row.externalId.trim();
      const key = email || externalId || `${row.firstName.trim()}|${row.lastName.trim()}`;
      const existing = map.get(key);

      if (!existing) {
        map.set(key, {
          ...row,
          email,
          externalId,
          sections: Array.from(new Set(row.sections ?? [])),
        });
        return map;
      }
      return map;
    }, new Map<string, RosterRow>())
  ).map(([, row]) => row);
}

export default function CourseNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn, user } = useUser();
  const signOut = useSignOut();

  const { data: studentData } = useStudentData(user?.primaryEmailAddress?.emailAddress);

  const editCourseId = searchParams.get('courseId');
  const isEditMode = Boolean(editCourseId);

  const [isSigningOut, setIsSigningOut] = useState(false);
  // In edit mode, land directly on the Review step (the last step) so editing an
  // existing course opens on the review screen rather than walking the wizard from step 0.
  const [currentStep, setCurrentStep] = useState(isEditMode ? STEP_REVIEW : STEP_INFO);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  // Guards against the preload effect re-running (e.g. when Clerk's `user` object
  // identity changes) and overwriting rosters the user has since uploaded/edited.
  // Tracks which course id we've already hydrated so we only load once. (#168)
  const loadedCourseIdRef = useRef<string | null>(null);
  const [isLoadingCourse, setIsLoadingCourse] = useState(false);
  const [loadError, setLoadError] = useState('');

  // course info
  const [courseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [sections, setSections] = useState('');

  // course image (Iconify icon + background color)
  const [iconName, setIconName] = useState<string | null>(null);
  const [iconBgColor, setIconBgColor] = useState<string>(COURSE_COLORS[0]);
  const [iconFgColor, setIconFgColor] = useState<string>(ICON_FG_LIGHT);

  // settings
  const [allowCooldownOverride, setAllowCooldownOverride] = useState(true);
  const [allowAssessorMessages, setAllowAssessorMessages] = useState(true);
  const [allowCrossSectionView, setAllowCrossSectionView] = useState(true);

  // csv upload
  const [studentRows, setStudentRows] = useState<RosterRow[]>([]);
  const [assessorRows, setAssessorRows] = useState<RosterRow[]>([]);

  const [visibleCount, setVisibleCount] = useState(10);
  const [showDropdown, setShowDropdown] = useState(false);

  const [assessorVisibleCount, setAssessorVisibleCount] = useState(10);
  const [showAssessorDropdown, setShowAssessorDropdown] = useState(false);

  const studentFileInputRef = useRef<HTMLInputElement | null>(null);
  const assessorFileInputRef = useRef<HTMLInputElement | null>(null);

  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Synchronous guard against double/triple submission. The `isSubmitting` state flag
  // only disables the button after a re-render, leaving a race window where rapid clicks
  // (or clicks during a slow request) fire multiple create requests → duplicate courses.
  // A ref mutates immediately, so it blocks re-entrant calls within the same tick.
  const isSubmittingRef = useRef(false);
  const [uploadDialog, setUploadDialog] = useState<UploadDialogState | null>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn && !isSigningOut) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, isSigningOut, router]);

  useEffect(() => {
    const userEmail = user?.primaryEmailAddress?.emailAddress ?? null;

    if (!editCourseId || !userEmail) {
      setEditingCourseId(null);
      setLoadError('');
      setIsLoadingCourse(false);
      return;
    }

    // Already hydrated this course — don't refetch and clobber in-progress edits.
    if (loadedCourseIdRef.current === editCourseId) {
      return;
    }

    let isCancelled = false;

    const preloadCourse = async () => {
      setIsLoadingCourse(true);
      setLoadError('');

      try {
        const response = await fetch(
          `/api/courses/${encodeURIComponent(editCourseId)}?email=${encodeURIComponent(userEmail)}`,
          {
            headers: { Accept: 'application/json' },
          }
        );

        const payload = (await response.json().catch(() => ({
          error: `Request failed with status ${response.status}`,
        }))) as EditableCourseResponse & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to load course details.');
        }

        if (isCancelled) return;

        loadedCourseIdRef.current = editCourseId;
        const course = payload.course;

        const studentEnrollments = course.enrollments.filter((enrollment) => enrollment.role === 'STUDENT');
        const checkerEnrollments = course.enrollments.filter((enrollment) => enrollment.role === 'CHECKER');

        setEditingCourseId(course.id);
        setCourseName(course.title ?? '');
        setSections(String(course.sectionCount ?? ''));
        if (course.iconName) setIconName(course.iconName);
        if (course.iconBgColor) setIconBgColor(course.iconBgColor);
        if (course.iconFgColor) setIconFgColor(course.iconFgColor);
        setAllowCooldownOverride(course.settings?.allowCooldownOverride ?? false);
        setAllowAssessorMessages(course.settings?.allowAssessorMessages ?? false);
        setAllowCrossSectionView(course.settings?.allowCrossSectionView ?? false);
        setStudentRows(
          studentEnrollments.map((enrollment) =>
            toRosterRow({
              name: enrollment.student.name,
              email: enrollment.student.email,
              externalId: enrollment.student.externalId,
              sections: enrollment.sections,
            })
          )
        );
        setAssessorRows(
          checkerEnrollments.length > 0
            ? checkerEnrollments.map((enrollment) =>
                toRosterRow({
                  name: enrollment.student.name,
                  email: enrollment.student.email,
                  externalId: enrollment.student.externalId,
                  sections: enrollment.sections,
                })
              )
            : course.contacts
                .filter((contact) => contact.type === 'CHECKER')
                .map((contact) =>
                  toRosterRow({
                    name: contact.name,
                    email: contact.email,
                    externalId: null,
                    sections: [],
                  })
                )
        );
      } catch (error) {
        if (isCancelled) return;
        setLoadError(error instanceof Error ? error.message : 'Unable to load course details.');
      } finally {
        if (!isCancelled) {
          setIsLoadingCourse(false);
        }
      }
    };

    void preloadCourse();

    return () => {
      isCancelled = true;
    };
  }, [editCourseId, user?.primaryEmailAddress?.emailAddress]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  const displayName = studentData?.student?.name || '';

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

  // The same person (by email or ID) can't be both a student and an assessor in one
  // course (one enrollment per person per course). Catch it here with a clear message
  // instead of letting the server reject it with a cryptic error.
  const findRosterRoleConflict = () => {
    const studentKeys = new Map<string, string>();
    for (const student of studentRows) {
      const label = `${student.firstName} ${student.lastName}`.trim() || student.email || student.externalId;
      for (const key of [student.email.trim().toLowerCase(), student.externalId.trim()].filter(Boolean)) {
        studentKeys.set(key, label);
      }
    }

    const conflicts = new Set<string>();
    for (const assessor of assessorRows) {
      const keys = [assessor.email.trim().toLowerCase(), assessor.externalId.trim()].filter(Boolean);
      if (keys.some((key) => studentKeys.has(key))) {
        conflicts.add(`${assessor.firstName} ${assessor.lastName}`.trim() || assessor.email || assessor.externalId);
      }
    }

    if (conflicts.size === 0) return null;

    const names = Array.from(conflicts);
    return `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} listed as both a student and an assessor. Each person can have only one role per course — remove the duplicate from one roster to continue.`;
  };

  const hasAtLeastOneSection = () => Number(sections) >= 1;

  const goNext = async () => {
    if (currentStep === STEP_INFO && !hasAtLeastOneSection()) {
      setSubmitError('Course must have at least 1 section.');
      return;
    }
    setSubmitError('');
    if (currentStep === STEP_REVIEW) {
      // Re-entrancy guard: ignore clicks while a save is already in flight.
      if (isSubmittingRef.current) return;

      setSubmitError('');

      if (!hasAtLeastOneSection()) {
        setSubmitError('Course must have at least 1 section.');
        return;
      }

      const rosterConflict = findRosterRoleConflict();
      if (rosterConflict) {
        setSubmitError(rosterConflict);
        return;
      }

      isSubmittingRef.current = true;
      setIsSubmitting(true);
      try {
        const result = await handleCreateCourse();
        const savedCourseId = result?.course?.id ?? editingCourseId;
        router.push(savedCourseId ? `/courses/${savedCourseId}` : '/');
      } catch (error) {
        console.error(error);
        setSubmitError(error instanceof Error ? error.message : 'Failed to save course.');
      } finally {
        setIsSubmitting(false);
        isSubmittingRef.current = false;
      }
      return;
    }

    setCurrentStep((prev) => Math.min(prev + 1, STEP_REVIEW));
  };

  const goBack = () => {
    setSubmitError('');
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const goToStep = (stepIndex: number) => {
    setSubmitError('');
    setCurrentStep(stepIndex);
  };

  const handleRosterUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    target: UploadTarget,
    setRows: React.Dispatch<React.SetStateAction<RosterRow[]>>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsedRows = parseCsv(text);
      const incoming = target === 'assessor' ? mergeAssessorRows(parsedRows) : parsedRows;
      // Append to whatever's already loaded (DB roster in edit mode, or a prior
      // upload) rather than replacing it, deduping by person. (#168)
      setRows((prev) => mergeRosterRows(prev, incoming));
    } catch (error) {
      console.error('Failed to parse CSV:', error);
      const message = error instanceof Error ? error.message : 'Failed to read CSV file.';
      setUploadDialog({
        type: 'error',
        target,
        message,
      });
    }

    event.target.value = '';
  };

  function parseCsv(text: string): RosterRow[] {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim());

    const lastNameIndex = headers.findIndex((h) => h.toLowerCase() === 'lastname');
    const firstNameIndex = headers.findIndex((h) => h.toLowerCase() === 'firstname');
    // The ID column may be named anything containing "id" (BUID, Student ID, ID, …).
    const externalIdIndex = headers.findIndex((h) =>
      h
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .includes('id')
    );
    const emailIndex = headers.findIndex((h) => h.toLowerCase() === 'email');
    const sectionsIndex = headers.findIndex((h) => h.toLowerCase() === 'sections' || h.toLowerCase() === 'section');

    if (
      lastNameIndex === -1 ||
      firstNameIndex === -1 ||
      externalIdIndex === -1 ||
      emailIndex === -1 ||
      sectionsIndex === -1
    ) {
      throw new Error(
        'CSV must contain headers: lastName, firstName, an ID column (e.g. BUID or Student ID), email, sections'
      );
    }

    return lines.slice(1).map((line) => {
      const cols = line.split(',').map((col) => col.trim());

      return {
        lastName: cols[lastNameIndex] || '',
        firstName: cols[firstNameIndex] || '',
        externalId: cols[externalIdIndex] || '',
        email: cols[emailIndex] || '',
        sections: parseSections(cols[sectionsIndex]),
      };
    });
  }

  async function handleCreateCourse() {
    const payload = {
      id: editingCourseId ?? undefined,
      code: courseCode.trim().toUpperCase(),
      sectionCount: sections,
      title: courseName.trim(),
      iconName,
      iconBgColor,
      iconFgColor,
      settings: {
        allowCooldownOverride,
        allowAssessorMessages,
        allowCrossSectionView,
      },
      contacts: assessorRows.map((assessor) => ({
        type: 'CHECKER',
        name: `${assessor.firstName} ${assessor.lastName}`.trim(),
        email: assessor.email.trim().toLowerCase(),
        avatarUrl: null,
      })),
      roster: [
        ...studentRows.map((student) => ({
          email: student.email.trim().toLowerCase(),
          name: `${student.firstName} ${student.lastName}`.trim(),
          externalId: student.externalId || null,
          role: CourseRole.STUDENT,
          sections: student.sections ?? [],
        })),
        ...assessorRows.map((assessor) => ({
          email: assessor.email.trim().toLowerCase(),
          name: `${assessor.firstName} ${assessor.lastName}`.trim(),
          externalId: assessor.externalId || null,
          role: CourseRole.CHECKER,
          sections: assessor.sections ?? [],
        })),
      ],
    };

    const res = await fetch('/api/courses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to create course');
    }

    return data;
  }

  const openUploadWarning = (target: UploadTarget) => {
    setUploadDialog({
      type: 'warning',
      target,
    });
  };

  const closeUploadDialog = () => {
    setUploadDialog(null);
  };

  const confirmUploadWarning = () => {
    if (!uploadDialog || uploadDialog.type !== 'warning') {
      return;
    }

    const targetInput = uploadDialog.target === 'assessor' ? assessorFileInputRef.current : studentFileInputRef.current;

    setUploadDialog(null);
    targetInput?.click();
  };

  // Unique section names found across the uploaded roster — populates the per-student
  // section dropdowns so the prof can reassign a student's section inline.
  const availableSections = Array.from(new Set(studentRows.flatMap((student) => student.sections ?? []))).sort();

  const updateStudentSection = (index: number, value: string) => {
    setStudentRows((prev) => prev.map((row, i) => (i === index ? { ...row, sections: value ? [value] : [] } : row)));
  };

  // Same inline-section-reassignment for the assessor roster.
  const availableAssessorSections = Array.from(
    new Set(assessorRows.flatMap((assessor) => assessor.sections ?? []))
  ).sort();

  const updateAssessorSection = (index: number, value: string) => {
    setAssessorRows((prev) => prev.map((row, i) => (i === index ? { ...row, sections: value ? [value] : [] } : row)));
  };

  function ConfigRow({ label, checked, onChange, infoText }: ConfigRowProps) {
    return (
      <div className={styles.configItem}>
        <div className={styles.configHeader}>
          <div className={styles.configLabelWrap}>
            <span className={styles.configLabel}>{label}</span>

            {infoText && (
              <div className={styles.infoWrapper}>
                <button type="button" className={styles.infoButton} aria-label={`Info for ${label}`}>
                  i
                </button>

                <div className={styles.infoPopover} role="tooltip">
                  {infoText}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.toggleRow}>
          <span className={styles.toggleText}>Don’t allow</span>

          <button
            type="button"
            className={`${styles.switch} ${checked ? styles.switchOn : ''}`}
            onClick={() => onChange(!checked)}
            aria-pressed={checked}
          >
            <span className={styles.switchThumb} />
          </button>

          <span className={styles.toggleText}>Allow</span>
        </div>
      </div>
    );
  }

  const assessorConfigs: Array<{
    label: string;
    checked: boolean;
    setChecked: React.Dispatch<React.SetStateAction<boolean>>;
    infoText?: React.ReactNode;
  }> = [
    {
      label: 'Allow manual override for cooldown?',
      checked: allowCooldownOverride,
      setChecked: setAllowCooldownOverride,
      infoText: (
        <>
          <p>
            If a student does not complete a satisfactory in-person assessment, they must wait during a cooldown period
            before they are able to reassess.
          </p>
          <p>Enabling manual override allows assessors to override this cooldown period and assess students earlier.</p>
        </>
      ),
    },
    {
      label: 'Allow assessor messages?',
      checked: allowAssessorMessages,
      setChecked: setAllowAssessorMessages,
    },
    {
      label: 'Allow assessors to view other sections?',
      checked: allowCrossSectionView,
      setChecked: setAllowCrossSectionView,
    },
  ];

  return (
    <div className={`page ${styles.page}`}>
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={`main ${styles.main}`}>
        <div className={styles.topRow}>
          <h1 className={styles.pageTitle}>{isEditMode ? 'Edit course' : 'Create a course'}</h1>
        </div>

        {isLoadingCourse && <p className={styles.tableMeta}>Loading course data...</p>}

        {loadError && <p className={styles.errorText}>{loadError}</p>}

        <div className={styles.stepper}>
          <div className={styles.stepLine} />
          {steps.map((step, index) => {
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;

            return (
              <div key={step} className={styles.stepItem}>
                <div
                  className={[
                    styles.stepCircle,
                    isActive ? styles.stepCircleActive : '',
                    isCompleted ? styles.stepCircleCompleted : '',
                  ].join(' ')}
                />
                <span className={styles.stepLabel}>{step}</span>
              </div>
            );
          })}
        </div>

        {submitError && <p className={styles.errorText}>{submitError}</p>}

        {currentStep === STEP_INFO && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Course information</h2>

            <form className={styles.form}>
              <div className={styles.field}>
                <input
                  id="courseName"
                  type="text"
                  className={styles.courseNameInput}
                  placeholder="Course Name"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                />
              </div>

              <div className={styles.sectionsRow}>
                <label htmlFor="sections" className={styles.sectionsLabel}>
                  Number of Sections:
                </label>
                <input
                  id="sections"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className={styles.sectionsInput}
                  value={sections}
                  onChange={(e) => setSections(e.target.value.replace(/\D/g, ''))}
                />
              </div>
            </form>
          </section>
        )}

        {currentStep === STEP_IMAGE && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Course image</h2>
            <p className={styles.cardSubtitle}>
              Pick a background color and search for an icon to represent this course.
            </p>

            <CourseImagePicker
              title={courseName}
              iconName={iconName}
              iconBgColor={iconBgColor}
              iconFgColor={iconFgColor}
              onIconNameChange={setIconName}
              onBgColorChange={setIconBgColor}
              onFgColorChange={setIconFgColor}
            />
          </section>
        )}

        {currentStep === STEP_ROSTER && (
          <>
            <div className={styles.uploadRow}>
              <button type="button" className={styles.uploadButton} onClick={() => openUploadWarning('student')}>
                Upload CSV file
              </button>

              <input
                ref={studentFileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => handleRosterUpload(e, 'student', setStudentRows)}
              />
            </div>

            <section className={styles.card}>
              <div className={styles.tableHeaderRow}>
                <h2 className={styles.rosterTitle}>Student Roster</h2>
                <span className={styles.tableMeta}>
                  Showing: {Math.min(visibleCount, studentRows.length)} of {studentRows.length}
                </span>
              </div>

              {studentRows.length === 0 ? (
                <p>No CSV uploaded yet.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Last Name</th>
                        <th>First Name</th>
                        <th>ID Number</th>
                        <th>Email</th>
                        <th>Sections</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentRows.slice(0, visibleCount).map((student, index) => {
                        const primarySection = student.sections?.[0] ?? '';
                        const sectionOptions = Array.from(
                          new Set([...availableSections, primarySection].filter(Boolean))
                        );
                        return (
                          <tr key={index}>
                            <td>{student.lastName}</td>
                            <td>{student.firstName}</td>
                            <td>{student.externalId}</td>
                            <td>{student.email}</td>
                            <td>
                              <select
                                className={styles.sectionSelect}
                                value={primarySection}
                                onChange={(e) => updateStudentSection(index, e.target.value)}
                                aria-label={`Section for ${student.firstName} ${student.lastName}`}
                              >
                                {sectionOptions.length === 0 ? <option value="">—</option> : null}
                                {sectionOptions.map((section) => (
                                  <option key={section} value={section}>
                                    {section}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className={styles.showMoreWrapper}>
                {!showDropdown ? (
                  <button
                    type="button"
                    className={styles.showMore}
                    onClick={() => setShowDropdown(true)}
                    aria-expanded={showDropdown}
                  >
                    <span>Show more items</span>
                    <svg className={styles.showMoreChevron} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M6 9l6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ) : (
                  <select
                    className={styles.dropdown}
                    value={visibleCount}
                    onChange={(e) => setVisibleCount(Number(e.target.value))}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                )}
              </div>
            </section>
          </>
        )}

        {currentStep === STEP_ASSESSOR && (
          <>
            <div className={styles.topUploadBar}>
              <button type="button" className={styles.uploadButton} onClick={() => openUploadWarning('assessor')}>
                Upload Assessor CSV
              </button>

              <input
                ref={assessorFileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => handleRosterUpload(e, 'assessor', setAssessorRows)}
              />
            </div>

            <section className={styles.card}>
              <div className={styles.tableHeaderRow}>
                <h2 className={styles.rosterTitle}>Assessor Roster</h2>
                <span className={styles.tableMeta}>
                  Showing: {Math.min(assessorVisibleCount, assessorRows.length)} of {assessorRows.length}
                </span>
              </div>

              {assessorRows.length === 0 ? (
                <p className={styles.emptyState}>No assessor roster uploaded yet.</p>
              ) : (
                <>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Last Name</th>
                          <th>First Name</th>
                          <th>ID Number</th>
                          <th>Email</th>
                          <th>Section</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assessorRows.slice(0, assessorVisibleCount).map((assessor, index) => {
                          const primarySection = assessor.sections?.[0] ?? '';
                          const sectionOptions = Array.from(
                            new Set([...availableAssessorSections, primarySection].filter(Boolean))
                          );
                          return (
                            <tr key={index}>
                              <td>{assessor.lastName}</td>
                              <td>{assessor.firstName}</td>
                              <td>{assessor.externalId}</td>
                              <td>{assessor.email}</td>
                              <td>
                                <select
                                  className={styles.sectionSelect}
                                  value={primarySection}
                                  onChange={(e) => updateAssessorSection(index, e.target.value)}
                                  aria-label={`Section for ${assessor.firstName} ${assessor.lastName}`}
                                >
                                  {sectionOptions.length === 0 ? <option value="">—</option> : null}
                                  {sectionOptions.map((section) => (
                                    <option key={section} value={section}>
                                      {section}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className={styles.showMoreWrapper}>
                    {!showAssessorDropdown ? (
                      <button type="button" className={styles.showMore} onClick={() => setShowAssessorDropdown(true)}>
                        <span>Show more items</span>
                        <svg className={styles.showMoreChevron} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path
                            d="M6 9l6 6 6-6"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    ) : (
                      <select
                        className={styles.dropdown}
                        value={assessorVisibleCount}
                        onChange={(e) => setAssessorVisibleCount(Number(e.target.value))}
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    )}
                  </div>
                </>
              )}
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Assessor Configurations</h2>

              <div className={styles.configList}>
                {assessorConfigs.map((config) => (
                  <ConfigRow
                    key={config.label}
                    label={config.label}
                    checked={config.checked}
                    onChange={config.setChecked}
                    infoText={config.infoText}
                  />
                ))}
              </div>
            </section>
          </>
        )}

        {currentStep === STEP_REVIEW && (
          <section className={styles.reviewCard}>
            <div className={styles.reviewSection}>
              <div className={styles.reviewHeaderRow}>
                <h3 className={styles.reviewTitle}>Course Info</h3>
                <button type="button" className={styles.editLink} onClick={() => goToStep(STEP_INFO)}>
                  <span className={styles.editLabel}>Edit</span>
                  <Image src="/assets/profile/edit.png" alt="Edit" width={18} height={18} className={styles.editIcon} />
                </button>
              </div>

              <div className={styles.reviewBody}>
                <p className={styles.reviewCourseInfo}>
                  Course Name: <span className={styles.reviewCourseInfoBold}>{courseName || '—'}</span>
                </p>
                <p className={styles.reviewCourseInfo}>
                  Number of Sections*: <span className={styles.reviewCourseInfoBold}>{sections || '—'}</span>
                </p>
              </div>
            </div>

            <div className={styles.reviewDivider} />

            <div className={styles.reviewSection}>
              <div className={styles.reviewHeaderRow}>
                <h3 className={styles.reviewTitle}>Course Image</h3>
                <button type="button" className={styles.editLink} onClick={() => goToStep(STEP_IMAGE)}>
                  <span className={styles.editLabel}>Edit</span>
                  <Image src="/assets/profile/edit.png" alt="Edit" width={18} height={18} className={styles.editIcon} />
                </button>
              </div>

              <div className={styles.reviewBody}>
                <div className={styles.reviewImageTile}>
                  <CourseTileImage
                    iconName={iconName}
                    iconBgColor={iconBgColor}
                    iconFgColor={iconFgColor}
                    title={courseName}
                    fallback={<span className={styles.reviewCourseInfo}>No icon selected</span>}
                  />
                </div>
              </div>
            </div>

            <div className={styles.reviewDivider} />

            <div className={styles.reviewSection}>
              <div className={styles.reviewHeaderRow}>
                <h3 className={styles.reviewTitle}>Student Roster</h3>
                <button type="button" className={styles.editLink} onClick={() => goToStep(STEP_ROSTER)}>
                  <span className={styles.editLabel}>Edit</span>
                  <Image src="/assets/profile/edit.png" alt="Edit" width={18} height={18} className={styles.editIcon} />
                </button>
              </div>

              <div className={styles.reviewBody}>
                <p className={styles.rosterRows}>{studentRows.length} students enrolled</p>
                <button type="button" className={styles.viewRosterButton} onClick={() => goToStep(STEP_ROSTER)}>
                  View Student Roster
                </button>
              </div>
            </div>

            <div className={styles.reviewDivider} />

            <div className={styles.reviewSection}>
              <div className={styles.reviewHeaderRow}>
                <h3 className={styles.reviewTitle}>Assessor Roster</h3>
                <button type="button" className={styles.editLink} onClick={() => goToStep(STEP_ASSESSOR)}>
                  <span className={styles.editLabel}>Edit</span>
                  <Image src="/assets/profile/edit.png" alt="Edit" width={18} height={18} className={styles.editIcon} />
                </button>
              </div>

              <div className={styles.reviewBody}>
                <p className={styles.rosterRows}>{assessorRows.length} assessors enrolled</p>
                <button type="button" className={styles.viewRosterButton} onClick={() => goToStep(STEP_ASSESSOR)}>
                  View Assessors
                </button>
              </div>
            </div>

            <div className={styles.reviewDivider} />

            <div className={styles.reviewSection}>
              <div className={styles.reviewHeaderRow}>
                <h3 className={styles.reviewTitle}>Assessor Configurations</h3>
                <button type="button" className={styles.editLink} onClick={() => goToStep(STEP_ASSESSOR)}>
                  <span className={styles.editLabel}>Edit</span>
                  <Image src="/assets/profile/edit.png" alt="Edit" width={18} height={18} className={styles.editIcon} />
                </button>
              </div>

              <div className={styles.reviewConfigList}>
                {assessorConfigs.map((config) => (
                  <div key={config.label} className={styles.reviewConfigItem}>
                    <span className={styles.reviewConfigLabel}>{config.label}</span>
                    <div className={styles.toggleRow}>
                      <span className={styles.toggleText}>Don’t allow</span>
                      <button
                        type="button"
                        className={`${styles.switch} ${config.checked ? styles.switchOn : ''}`}
                        onClick={() => config.setChecked((prev) => !prev)}
                        aria-pressed={config.checked}
                      >
                        <span className={styles.switchThumb} />
                      </button>
                      <span className={styles.toggleText}>Allow</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <div className={styles.actions}>
          {currentStep > 0 && <BackButton inline onClick={goBack} />}

          <button
            type="button"
            className={styles.nextButton}
            onClick={goNext}
            disabled={isSubmitting || isLoadingCourse}
          >
            {currentStep === STEP_REVIEW
              ? isSubmitting
                ? isEditMode
                  ? 'Saving...'
                  : 'Creating...'
                : isEditMode
                  ? 'Save Changes'
                  : 'Create Course'
              : 'Next'}
          </button>
        </div>

        {uploadDialog ? (
          <div
            className={styles.uploadWarningOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-dialog-title"
          >
            <div className={styles.uploadWarningModal}>
              <p className={styles.uploadWarningEyebrow}>
                {uploadDialog.type === 'error' ? 'Upload Error' : 'Warning'}
              </p>
              <h2 id="upload-dialog-title" className={styles.uploadWarningTitle}>
                {uploadDialog.type === 'error' ? <>File upload failed</> : <>Review your file before uploading.</>}
              </h2>

              {uploadDialog.type === 'error' ? (
                <p className={styles.uploadWarningText}>{uploadDialog.message}</p>
              ) : (
                <>
                  <p className={styles.uploadWarningText}>
                    Use the headers{' '}
                    <strong>lastName, firstName, an ID column (e.g. BUID or Student ID), email, sections</strong>.{' '}
                    <br />
                    For multiple sections, separate them with <strong>|</strong>
                  </p>
                </>
              )}

              <div className={styles.uploadWarningActions}>
                {uploadDialog.type === 'warning' ? (
                  <>
                    <button type="button" className={styles.uploadWarningSecondary} onClick={closeUploadDialog}>
                      Cancel
                    </button>
                    <button type="button" className={styles.uploadWarningPrimary} onClick={confirmUploadWarning}>
                      Continue Upload
                    </button>
                  </>
                ) : (
                  <button type="button" className={styles.uploadWarningPrimary} onClick={closeUploadDialog}>
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
