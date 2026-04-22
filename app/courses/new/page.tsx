'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import Sidebar, { SIDEBAR_NAV } from '../../_components/Sidebar';
import styles from './page.module.css';
import Image from 'next/image';
import { useStudentData } from '../../hooks/useStudentData';
import { CourseRole } from '@prisma/client';

const steps = ['Course Info', 'Upload Class Roster', 'Manage Assessor Configurations', 'Review'];

type StudentRow = {
  lastName: string;
  firstName: string;
  buid: string;
  email: string;
  section: string;
};

type AssessorRow = {
  lastName: string;
  firstName: string;
  buid: string;
  email: string;
  section: string;
};

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
  isInfoOpen?: boolean;
  onInfoToggle?: () => void;
};

type EditableCourseResponse = {
  course: {
    id: string;
    title: string;
    sectionCount: number;
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
        name: string | null;
        email: string | null;
        buid: string | null;
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

function toRosterRow(person: {
  name?: string | null;
  email?: string | null;
  buid?: string | null;
  sections?: string[] | null;
}): StudentRow {
  const { firstName, lastName } = splitName(person.name);

  return {
    firstName,
    lastName,
    buid: person.buid?.trim() ?? '',
    email: person.email?.trim() ?? '',
    section: (person.sections ?? []).join(', '),
  };
}

function parseSections(sectionValue?: string | null): string[] {
  return (sectionValue ?? '')
    .split(',')
    .map((section) => section.trim())
    .filter(Boolean);
}

function mergeAssessorRows(rows: AssessorRow[]) {
  return Array.from(
    rows.reduce((map, row) => {
      const email = row.email.trim().toLowerCase();
      const buid = row.buid.trim();
      const key = email || buid || `${row.firstName.trim()}|${row.lastName.trim()}`;
      const existing = map.get(key);

      if (!existing) {
        map.set(key, {
          ...row,
          email,
          buid,
          section: Array.from(new Set(parseSections(row.section))).join(', '),
        });
        return map;
      }

      const nextSections = new Set([...parseSections(existing.section), ...parseSections(row.section)]);
      existing.section = Array.from(nextSections).join(', ');
      return map;
    }, new Map<string, AssessorRow>())
  ).map(([, row]) => row);
}

export default function CourseNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();

  const { data: studentData } = useStudentData(user?.primaryEmailAddress?.emailAddress);

  const editCourseId = searchParams.get('courseId');
  const isEditMode = Boolean(editCourseId);

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [isLoadingCourse, setIsLoadingCourse] = useState(false);
  const [loadError, setLoadError] = useState('');

  // course info
  const [courseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [sections, setSections] = useState('');

  // settings
  const [allowCooldownOverride, setAllowCooldownOverride] = useState(true);
  const [allowAssessorMessages, setAllowAssessorMessages] = useState(true);
  const [allowCrossSectionView, setAllowCrossSectionView] = useState(true);

  // csv upload
  const [studentRows, setStudentRows] = useState<StudentRow[]>([]);
  const [assessorRows, setAssessorRows] = useState<AssessorRow[]>([]);

  const [visibleCount, setVisibleCount] = useState(10);
  const [showDropdown, setShowDropdown] = useState(false);

  const [assessorVisibleCount, setAssessorVisibleCount] = useState(10);
  const [showAssessorDropdown, setShowAssessorDropdown] = useState(false);

  const studentFileInputRef = useRef<HTMLInputElement | null>(null);
  const assessorFileInputRef = useRef<HTMLInputElement | null>(null);

  const [showCooldownInfo, setShowCooldownInfo] = useState(false);

  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadDialog, setUploadDialog] = useState<UploadDialogState | null>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    const userEmail = user?.primaryEmailAddress?.emailAddress ?? null;

    if (!editCourseId || !userEmail) {
      setEditingCourseId(null);
      setLoadError('');
      setIsLoadingCourse(false);
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

        const course = payload.course;
        const studentEnrollments = course.enrollments.filter((enrollment) => enrollment.role === 'STUDENT');
        const checkerEnrollments = course.enrollments.filter((enrollment) => enrollment.role === 'CHECKER');

        setEditingCourseId(course.id);
        setCourseName(course.title ?? '');
        setSections(String(course.sectionCount ?? ''));
        setAllowCooldownOverride(course.settings?.allowCooldownOverride ?? false);
        setAllowAssessorMessages(course.settings?.allowAssessorMessages ?? false);
        setAllowCrossSectionView(course.settings?.allowCrossSectionView ?? false);
        setStudentRows(
          studentEnrollments.map((enrollment) =>
            toRosterRow({
              name: enrollment.student.name,
              email: enrollment.student.email,
              buid: enrollment.student.buid,
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
                  buid: enrollment.student.buid,
                  sections: enrollment.sections,
                })
              )
            : course.contacts
                .filter((contact) => contact.type === 'CHECKER')
                .map((contact) =>
                  toRosterRow({
                    name: contact.name,
                    email: contact.email,
                    buid: null,
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

  const displayName = studentData?.student?.name || 'Professor';

  const handleSignOut = async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/sign-in');
    } catch (error) {
      console.error('Failed to sign out', error);
      setIsSigningOut(false);
    }
  };

  const goNext = async () => {
    if (currentStep === steps.length - 1) {
      setSubmitError('');
      setIsSubmitting(true);
      try {
        const result = await handleCreateCourse();
        const savedCourseId = result?.course?.id ?? editingCourseId;
        router.push(isEditMode && savedCourseId ? `/courses/${savedCourseId}` : '/courses');
      } catch (error) {
        console.error(error);
        setSubmitError(error instanceof Error ? error.message : 'Failed to save course.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const goBack = () => {
    setSubmitError('');
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const goToStep = (stepIndex: number) => {
    setSubmitError('');
    setCurrentStep(stepIndex);
  };

  const handleRosterUpload = async <T,>(
    event: React.ChangeEvent<HTMLInputElement>,
    target: UploadTarget,
    setRows: React.Dispatch<React.SetStateAction<T[]>>,
    parser: (text: string) => T[]
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsedRows = parser(text);
      setRows((target === 'assessor' ? mergeAssessorRows(parsedRows as AssessorRow[]) : parsedRows) as T[]);
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

  function parseCsv(text: string): StudentRow[] {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim());

    const lastNameIndex = headers.findIndex(
      (h) => h.toLowerCase() === 'lastname' || h.toLowerCase() === 'lastName'.toLowerCase()
    );
    const firstNameIndex = headers.findIndex(
      (h) => h.toLowerCase() === 'firstname' || h.toLowerCase() === 'firstName'.toLowerCase()
    );
    const buidIndex = headers.findIndex((h) => h.toLowerCase() === 'buid');
    const emailIndex = headers.findIndex((h) => h.toLowerCase() === 'email');
    const sectionIndex = headers.findIndex((h) => h.toLowerCase() === 'section');

    if (lastNameIndex === -1 || firstNameIndex === -1 || buidIndex === -1 || emailIndex === -1 || sectionIndex === -1) {
      throw new Error('CSV must contain headers: lastName, firstName, buid, email, section');
    }

    return lines.slice(1).map((line) => {
      const cols = line.split(',').map((col) => col.trim());

      return {
        lastName: cols[lastNameIndex] || '',
        firstName: cols[firstNameIndex] || '',
        buid: cols[buidIndex] || '',
        email: cols[emailIndex] || '',
        section: cols[sectionIndex] || '',
      };
    });
  }

  async function handleCreateCourse() {
    const payload = {
      id: editingCourseId ?? undefined,
      code: courseCode.trim().toUpperCase(),
      sectionCount: sections,
      title: courseName.trim(),
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
          buid: student.buid || null,
          role: CourseRole.STUDENT,
          section: student.section.trim() || null,
        })),
        ...assessorRows.map((assessor) => ({
          email: assessor.email.trim().toLowerCase(),
          name: `${assessor.firstName} ${assessor.lastName}`.trim(),
          buid: assessor.buid || null,
          role: CourseRole.CHECKER,
          section: assessor.section.trim() || null,
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

  function ConfigRow({ label, checked, onChange, infoText, isInfoOpen = false, onInfoToggle }: ConfigRowProps) {
    return (
      <div className={styles.configItem}>
        <div className={styles.configHeader}>
          <div className={styles.configLabelWrap}>
            <span className={styles.configLabel}>{label}</span>

            {infoText && onInfoToggle && (
              <div className={styles.infoWrapper}>
                <button
                  type="button"
                  className={styles.infoButton}
                  onClick={onInfoToggle}
                  aria-label={`Show info for ${label}`}
                  aria-expanded={isInfoOpen}
                >
                  i
                </button>

                {isInfoOpen && <div className={styles.infoPopover}>{infoText}</div>}
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

        {currentStep === 0 && (
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
                  type="number"
                  min="1"
                  className={styles.sectionsInput}
                  value={sections}
                  onChange={(e) => setSections(e.target.value)}
                />
              </div>
            </form>
          </section>
        )}

        {currentStep === 1 && (
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
                onChange={(e) => handleRosterUpload(e, 'student', setStudentRows, parseCsv)}
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
                        <th>BUID Number</th>
                        <th>Email</th>
                        <th>Section</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentRows.slice(0, visibleCount).map((student, index) => (
                        <tr key={index}>
                          <td>{student.lastName}</td>
                          <td>{student.firstName}</td>
                          <td>{student.buid}</td>
                          <td>{student.email}</td>
                          <td>{student.section}</td>
                        </tr>
                      ))}
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

        {currentStep === 2 && (
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
                onChange={(e) => handleRosterUpload(e, 'assessor', setAssessorRows, parseCsv)}
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
                          <th>BUID Number</th>
                          <th>Email</th>
                          <th>Section</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assessorRows.slice(0, assessorVisibleCount).map((assessor, index) => (
                          <tr key={index}>
                            <td>{assessor.lastName}</td>
                            <td>{assessor.firstName}</td>
                            <td>{assessor.buid}</td>
                            <td>{assessor.email}</td>
                            <td>{assessor.section}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className={styles.showMoreWrapper}>
                    {!showAssessorDropdown ? (
                      <button type="button" className={styles.showMore} onClick={() => setShowAssessorDropdown(true)}>
                        <span>Show more items</span>
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
                <ConfigRow
                  label="Allow manual override for cooldown?"
                  checked={allowCooldownOverride}
                  onChange={setAllowCooldownOverride}
                  isInfoOpen={showCooldownInfo}
                  onInfoToggle={() => setShowCooldownInfo((prev) => !prev)}
                  infoText={
                    <>
                      <p>
                        If a student does not complete a satisfactory in-person assessment, they must wait during a
                        cooldown period before they are able to reassess.
                      </p>
                      <p>
                        Enabling manual override allows assessors to override this cooldown period and assess students
                        earlier.
                      </p>
                    </>
                  }
                />

                <ConfigRow
                  label="Allow assessor messages?"
                  checked={allowAssessorMessages}
                  onChange={setAllowAssessorMessages}
                />

                <ConfigRow
                  label="Allow assessors to view other sections?"
                  checked={allowCrossSectionView}
                  onChange={setAllowCrossSectionView}
                />
              </div>
            </section>
          </>
        )}

        {currentStep === 3 && (
          <section className={styles.reviewCard}>
            <div className={styles.reviewSection}>
              <div className={styles.reviewHeaderRow}>
                <h3 className={styles.reviewTitle}>Course Info</h3>
                <button type="button" className={styles.editLink} onClick={() => goToStep(0)}>
                  <span className={styles.editLabel}>Edit</span>
                  <Image src="/assets/profile/edit.png" alt="Edit" width={18} height={18} className={styles.editIcon} />
                </button>
              </div>

              <div className={styles.reviewBody}>
                <p className={styles.reviewCourseInfo}>
                  Course Name: <span className={styles.reviewCourseInfoBold}>{courseName || '—'}</span>
                </p>
                <p className={styles.reviewCourseInfo}>
                  Number of Sections: <span className={styles.reviewCourseInfoBold}>{sections || '—'}</span>
                </p>
              </div>
            </div>

            <div className={styles.reviewDivider} />

            <div className={styles.reviewSection}>
              <div className={styles.reviewHeaderRow}>
                <h3 className={styles.reviewTitle}>Student Roster</h3>
                <button type="button" className={styles.editLink} onClick={() => goToStep(1)}>
                  <span className={styles.editLabel}>Edit</span>
                  <Image src="/assets/profile/edit.png" alt="Edit" width={18} height={18} className={styles.editIcon} />
                </button>
              </div>

              <div className={styles.reviewBody}>
                <p className={styles.rosterRows}>{studentRows.length} students enrolled</p>
              </div>
            </div>

            <div className={styles.reviewDivider} />

            <div className={styles.reviewSection}>
              <div className={styles.reviewHeaderRow}>
                <h3 className={styles.reviewTitle}>Assessors</h3>
                <button type="button" className={styles.editLink} onClick={() => goToStep(2)}>
                  <span className={styles.editLabel}>Edit</span>
                  <Image src="/assets/profile/edit.png" alt="Edit" width={18} height={18} className={styles.editIcon} />
                </button>
              </div>

              <div className={styles.reviewBody}>
                <p className={styles.rosterRows}>{assessorRows.length} assessors enrolled</p>
              </div>
            </div>

            <div className={styles.reviewDivider} />

            <div className={styles.reviewConfigList}>
              <div className={styles.reviewConfigItem}>
                <span className={styles.reviewConfigLabel}>Allow manual override for cooldown?</span>
                <div className={styles.toggleRow}>
                  <span className={styles.toggleText}>Don’t allow</span>
                  <button
                    type="button"
                    className={`${styles.switch} ${allowAssessorMessages ? styles.switchOn : ''}`}
                    onClick={() => setAllowAssessorMessages((prev) => !prev)}
                    aria-pressed={allowAssessorMessages}
                  >
                    <span className={styles.switchThumb} />
                  </button>
                  <span className={styles.toggleText}>Allow</span>
                </div>
              </div>

              <div className={styles.reviewConfigItem}>
                <span className={styles.reviewConfigLabel}>Allow assessor messages?</span>
                <div className={styles.toggleRow}>
                  <span className={styles.toggleText}>Don’t allow</span>
                  <button
                    type="button"
                    className={`${styles.switch} ${allowCrossSectionView ? styles.switchOn : ''}`}
                    onClick={() => setAllowCrossSectionView((prev) => !prev)}
                    aria-pressed={allowCrossSectionView}
                  >
                    <span className={styles.switchThumb} />
                  </button>
                  <span className={styles.toggleText}>Allow</span>
                </div>
              </div>

              <div className={styles.reviewConfigItem}>
                <span className={styles.reviewConfigLabel}>Allow assessors to view other sections?</span>
                <div className={styles.toggleRow}>
                  <span className={styles.toggleText}>Don’t allow</span>
                  <button
                    type="button"
                    className={`${styles.switch} ${allowCooldownOverride ? styles.switchOn : ''}`}
                    onClick={() => setAllowCooldownOverride((prev) => !prev)}
                    aria-pressed={allowCooldownOverride}
                  >
                    <span className={styles.switchThumb} />
                  </button>
                  <span className={styles.toggleText}>Allow</span>
                </div>
              </div>
            </div>
          </section>
        )}

        <div className={styles.actions}>
          {currentStep > 0 && (
            <button type="button" className={styles.backButton} onClick={goBack}>
              Back
            </button>
          )}

          <button
            type="button"
            className={styles.nextButton}
            onClick={goNext}
            disabled={isSubmitting || isLoadingCourse}
          >
            {currentStep === steps.length - 1
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
                {uploadDialog.type === 'error' ? (
                  <>{uploadDialog.target === 'assessor' ? 'Assessor roster' : 'Student roster'} upload failed</>
                ) : (
                  <>
                    Review your {uploadDialog.target === 'assessor' ? 'assessor roster' : 'student roster'} file before
                    uploading
                  </>
                )}
              </h2>

              {uploadDialog.type === 'error' ? (
                <p className={styles.uploadWarningText}>{uploadDialog.message}</p>
              ) : (
                <>
                  <p className={styles.uploadWarningText}>
                    Uploading a new CSV will replace the roster preview currently shown on this page.
                  </p>
                  <p className={styles.uploadWarningText}>
                    Use the headers <strong>lastName, firstName, buid, email, section</strong> so the roster imports
                    correctly.
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
