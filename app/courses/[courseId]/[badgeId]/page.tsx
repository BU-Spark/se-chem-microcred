'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';

import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';
import styles from './page.module.css';

type BadgeStatus = 'LEARNING' | 'READY_FOR_ASSESSMENT' | 'READY_FOR_FINALIZATION' | 'COMPLETED' | 'NOT_STARTED';

type BadgeDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  lesson: {
    id: string;
    title: string;
    sortOrder: number;
  } | null;
};

type CourseDetail = {
  id: string;
  title: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string | null;
    buid: string | null;
  } | null;
};

type ProgressSummary = {
  totalStudents: number;
  completedCount: number;
  inProgressCount: number;
  notStartedCount: number;
  readyForAssessmentCount: number;
  readyForFinalizationCount: number;
  completedPercent: number;
  inProgressPercent: number;
  notStartedPercent: number;
  readyForAssessmentPercent: number;
  readyForFinalizationPercent: number;
  averageScore: number | null;
};

type AssessmentDetails = {
  displayText: string;
  rubricItems: Array<{ number: number; text: string }>;
  gradingCriteria: Array<{ number: number; criterion: string | null; options: string[] }>;
  checkpoints: Array<{
    number?: number;
    title?: string | null;
    question?: string | null;
    questionType?: string | null;
    points?: number | string | null;
    time?: string | null;
    segmentLabel?: string | null;
  }>;
};

type StudentProgressRow = {
  enrollmentId: string;
  sections: string[];
  student: {
    id: string;
    name: string | null;
    email: string | null;
    buid: string | null;
  };
  progress: {
    id: string;
    badgeId: string;
    status: Exclude<BadgeStatus, 'NOT_STARTED'>;
    awardedAt: string | null;
    score: number | null;
    updatedAt: string;
  } | null;
  status: BadgeStatus;
};

type BadgeDetailResponse = {
  badge: BadgeDetail | null;
  course: CourseDetail;
  summary: ProgressSummary;
  assessment: AssessmentDetails;
  students: StudentProgressRow[];
};

const STATUS_LABELS: Record<BadgeStatus, string> = {
  NOT_STARTED: 'Not started',
  LEARNING: 'In progress',
  READY_FOR_ASSESSMENT: 'Ready for assessment',
  READY_FOR_FINALIZATION: 'Ready for finalization',
  COMPLETED: 'Completed',
};

function resolveParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function formatStudentName(student: StudentProgressRow['student']) {
  return student.name?.trim() || student.email?.trim() || 'Unnamed student';
}

function formatDate(value?: string | null) {
  if (!value) return 'Not yet';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not yet';

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function useBadgeDetails(courseId?: string | null, badgeId?: string | null, email?: string | null) {
  const [data, setData] = useState<BadgeDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!courseId || !badgeId || !email) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/courses/${encodeURIComponent(courseId)}/${encodeURIComponent(badgeId)}?email=${encodeURIComponent(email)}`,
        {
          headers: { Accept: 'application/json' },
        }
      );

      const payload = await response.json().catch(() => ({
        error: `Request failed: ${response.status}`,
      }));

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to load badge details.');
      }

      setData(payload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Unable to load badge details.');
    } finally {
      setIsLoading(false);
    }
  }, [courseId, badgeId, email]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, isLoading, error };
}

export default function CourseBadgeProgress() {
  const params = useParams<{ courseId: string; badgeId: string }>();
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const courseId = resolveParam(params?.courseId);
  const badgeId = resolveParam(params?.badgeId);
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const { data, isLoading, error } = useBadgeDetails(courseId, badgeId, email);

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

  const badge = data?.badge ?? null;
  const course = data?.course ?? null;
  const summary = data?.summary ?? null;
  const assessment = data?.assessment ?? null;
  const students = data?.students ?? [];
  const displayName = course?.createdBy?.name || user?.fullName || '';

  const metricCards = useMemo(
    () =>
      summary
        ? [
            { label: 'Completed', value: `${summary.completedPercent}%`, count: summary.completedCount },
            { label: 'In progress', value: `${summary.inProgressPercent}%`, count: summary.inProgressCount },
            { label: 'Not started', value: `${summary.notStartedPercent}%`, count: summary.notStartedCount },
            {
              label: 'Ready for assessment',
              value: `${summary.readyForAssessmentPercent}%`,
              count: summary.readyForAssessmentCount,
            },
          ]
        : [],
    [summary]
  );

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <div className={styles.page}>
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={styles.main}>
        <div className={styles.content}>
          <header className={styles.header}>
            <Link href={`/courses/${courseId}`} className={styles.backLink}>
              Back to course
            </Link>
            <h1 className={styles.pageTitle}>{course?.title ?? 'Course badge progress'}</h1>
          </header>

          {isLoading ? <p className={styles.statusMessage}>Loading badge details...</p> : null}

          {!isLoading && error ? (
            <div className={styles.statusBlock}>
              <p className={styles.statusMessage}>{error}</p>
              <Link href={`/courses/${courseId}`} className={styles.inlineLink}>
                Back to course
              </Link>
            </div>
          ) : null}

          {!isLoading && !error && badge && summary && assessment ? (
            <>
              <section className={styles.heroCard}>
                <div className={styles.badgeIcon} aria-hidden="true" />
                <div className={styles.heroCopy}>
                  <p className={styles.sectionLabel}>Badge Progress</p>
                  <h2 className={styles.badgeTitle}>{badge.name}</h2>
                  <p className={styles.badgeDescription}>{badge.description || 'No badge description provided.'}</p>
                </div>
              </section>

              <section className={styles.metricsGrid} aria-label="Badge progress summary">
                {metricCards.map((metric) => (
                  <article key={metric.label} className={styles.metricCard}>
                    <strong>{metric.value}</strong>
                    <span>{metric.label}</span>
                    <small>
                      {metric.count} of {summary.totalStudents} students
                    </small>
                  </article>
                ))}
                <article className={styles.metricCard}>
                  <strong>{summary.averageScore ?? 'N/A'}</strong>
                  <span>Average assessment score</span>
                  <small>{summary.readyForFinalizationCount} ready to finalize</small>
                </article>
              </section>

              <section className={styles.detailGrid}>
                <article className={styles.panel}>
                  <h2>Assessment Details</h2>
                  <p>{assessment.displayText}</p>

                  {assessment.rubricItems.length > 0 ? (
                    <>
                      <h3>Rubric</h3>
                      <ol className={styles.detailList}>
                        {assessment.rubricItems.map((item) => (
                          <li key={item.number}>{item.text}</li>
                        ))}
                      </ol>
                    </>
                  ) : null}

                  {assessment.gradingCriteria.length > 0 ? (
                    <>
                      <h3>Instructor grading</h3>
                      <div className={styles.criteriaList}>
                        {assessment.gradingCriteria.map((criterion) => (
                          <div key={criterion.number} className={styles.criteriaItem}>
                            <strong>{criterion.criterion || `Criterion ${criterion.number}`}</strong>
                            {criterion.options.length > 0 ? <span>{criterion.options.join(' / ')}</span> : null}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </article>

                <article className={styles.panel}>
                  <h2>Checkpoints</h2>
                  {assessment.checkpoints.length > 0 ? (
                    <div className={styles.checkpointList}>
                      {assessment.checkpoints.map((checkpoint, index) => (
                        <div key={`${checkpoint.title ?? 'checkpoint'}-${index}`} className={styles.checkpointItem}>
                          <strong>{checkpoint.title || `Checkpoint ${index + 1}`}</strong>
                          <span>{checkpoint.question || 'No question recorded.'}</span>
                          <small>
                            {[checkpoint.time, checkpoint.segmentLabel, checkpoint.points ? `${checkpoint.points} pts` : null]
                              .filter(Boolean)
                              .join(' | ')}
                          </small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>No checkpoints recorded for this badge.</p>
                  )}
                </article>
              </section>

              <section className={styles.studentPanel}>
                <div className={styles.studentPanelHeader}>
                  <h2>Student Progress</h2>
                  <span>{summary.totalStudents} students</span>
                </div>

                <div className={styles.tableWrap}>
                  <table className={styles.progressTable}>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Section</th>
                        <th>Status</th>
                        <th>Score</th>
                        <th>Awarded</th>
                        <th>Last Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((row) => (
                        <tr key={row.enrollmentId}>
                          <td>
                            <strong>{formatStudentName(row.student)}</strong>
                            <span>{row.student.email ?? 'Email unavailable'}</span>
                          </td>
                          <td>{row.sections.join(', ') || 'Unassigned'}</td>
                          <td>
                            <span className={styles.statusPill} data-status={row.status}>
                              {STATUS_LABELS[row.status]}
                            </span>
                          </td>
                          <td>{row.progress?.score ?? 'N/A'}</td>
                          <td>{formatDate(row.progress?.awardedAt)}</td>
                          <td>{formatDate(row.progress?.updatedAt)}</td>
                        </tr>
                      ))}
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
