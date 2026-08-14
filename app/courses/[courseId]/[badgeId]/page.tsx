'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import { isInstructor } from '@/lib/roles';

import Sidebar, { SIDEBAR_NAV } from '@/app/components/Navigation/Sidebar';
import BackButton from '@/app/components/BackButton/BackButton';
import BadgeRatings, { type BadgeRatingsData } from './BadgeRatings';
import BadgeRosterPanel, { type RosterCohort, type RosterStage } from './BadgeRosterPanel';
import styles from './page.module.css';

type BadgeStatus = 'LEARNING' | 'READY_FOR_ASSESSMENT' | 'IN_REVIEW' | 'COMPLETED' | 'LOCKED' | 'NOT_STARTED';

type BadgeDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
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
    externalId: string | null;
  } | null;
};

type ProgressSummary = {
  totalStudents: number;
  completedCount: number;
  inProgressCount: number;
  notStartedCount: number;
  readyForAssessmentCount: number;
  inReviewCount: number;
  lockedCount: number;
  completedPercent: number;
  inProgressPercent: number;
  notStartedPercent: number;
  readyForAssessmentPercent: number;
  inReviewPercent: number;
  lockedPercent: number;
  averageScore: number | null;
  videoInProgressCount: number;
  videoCompletedOnlyCount: number;
  inPersonFailedCount: number;
  videoInProgressPercent: number;
  videoCompletedOnlyPercent: number;
  inPersonFailedPercent: number;
  feedbackResponseCount: number;
  averageRating: number | null;
};

type AssessmentDetails = {
  displayText: string;
  videoTitle?: string | null;
  youtubeUrl?: string | null;
  videoLength?: string | null;
  rubricGoal?: {
    id: string;
    name: string;
    subgoals: Array<{
      id: string;
      text: string;
      passThreshold: number;
      sortOrder: number;
      tasks: Array<{ id: string; text: string; points: number; sortOrder: number }>;
    }>;
  } | null;
  checkpoints: Array<{
    number?: number;
    title?: string | null;
    question?: string | null;
    questionType?: string | null;
    points?: number | string | null;
    time?: string | null;
    segmentLabel?: string | null;
    questionCount?: number | null;
    questionText?: string | null;
  }>;
};

type StudentProgressRow = {
  enrollmentId: string;
  sections: string[];
  student: {
    id: string;
    name: string | null;
    email: string | null;
    externalId: string | null;
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
  analyticsStatus: 'PROFICIENT' | 'STILL_LEARNING' | 'NOT_STARTED';
  stillLearningReason: 'VIDEO_IN_PROGRESS' | 'VIDEO_COMPLETED_ONLY' | 'IN_PERSON_FAILED' | null;
  videoStatus: 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED';
  assessmentAttemptCount: number;
  feedback: { rating: number; comment: string | null; submittedAt: string; question: string } | null;
  cohort?: RosterCohort;
  stage?: RosterStage;
  locked?: boolean;
};

type BadgeDetailResponse = {
  viewerRole: 'STUDENT' | 'INSTRUCTOR' | 'CHECKER' | null;
  badge: BadgeDetail | null;
  course: CourseDetail;
  summary: ProgressSummary;
  cohorts: {
    totalStudents: number;
    proficient: { count: number; percent: number };
    stillLearning: { count: number; percent: number; lockedCount: number };
    notStarted: { count: number; percent: number };
  } | null;
  ratings: BadgeRatingsData | null;
  assessment: AssessmentDetails;
  students: StudentProgressRow[];
};

function resolveParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function extractYouTubeId(url?: string | null) {
  if (!url) return null;
  const match =
    url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/) ?? url.match(/[?&]v=([\w-]{11})/);
  const candidate = match?.[1] ?? null;
  return candidate && candidate.length === 11 ? candidate : null;
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
  const signOut = useSignOut();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isRosterOpen, setIsRosterOpen] = useState(false);

  const courseId = resolveParam(params?.courseId);
  const badgeId = resolveParam(params?.badgeId);
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const { data, isLoading, error } = useBadgeDetails(courseId, badgeId, email);

  useEffect(() => {
    if (isLoaded && !isSignedIn && !isSigningOut) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, isSigningOut, router]);

  const handleBackToCourse = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push(`/courses/${courseId}`);
  };

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

  const badge = data?.badge ?? null;
  const course = data?.course ?? null;
  const summary = data?.summary ?? null;
  const assessment = data?.assessment ?? null;
  const students = data?.students ?? [];
  const isInstructorFlag = isInstructor(data?.viewerRole);
  const displayName = course?.createdBy?.name || user?.fullName || '';

  // Progress breakdown bars driven by the real summary percentages.
  const breakdownBars = useMemo(
    () =>
      summary
        ? [
            {
              kind: 'completed' as const,
              label: 'Students who have completed this badge',
              percent: summary.completedPercent,
              color: '#22a06b',
            },
            {
              kind: 'learning' as const,
              label: 'Students still in progress',
              percent: summary.inProgressPercent,
              color: '#f0a33b',
            },
            {
              kind: 'not-started' as const,
              label: 'Students not yet started',
              percent: summary.notStartedPercent,
              color: '#a8b3c2',
            },
          ]
        : [],
    [summary]
  );

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  // Completion ring uses the real completed percentage.
  const completionPercent = summary?.completedPercent ?? 0;
  // Three-segment donut (completed / in-progress / not-started) matching the
  // breakdown bars and the design, with a neutral grey remainder.
  const completionRingGradient = (() => {
    const completedDeg = (summary?.completedPercent ?? 0) * 3.6;
    const inProgressDeg = (summary?.inProgressPercent ?? 0) * 3.6;
    const inProgressEnd = completedDeg + inProgressDeg;
    return `conic-gradient(#22a06b 0deg ${completedDeg}deg, #f0a33b ${completedDeg}deg ${inProgressEnd}deg, #dfe5ec ${inProgressEnd}deg 360deg)`;
  })();
  const checkpointCount = assessment?.checkpoints.length ?? 0;
  const videoTitle = assessment?.videoTitle || badge?.lesson?.title || 'Lesson video';
  const videoLength = assessment?.videoLength || 'Not recorded';
  const youtubeId = extractYouTubeId(assessment?.youtubeUrl);

  return (
    <div className={styles.page}>
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={styles.main}>
        <div className={styles.content}>
          <header className={styles.header}>
            <BackButton onClick={handleBackToCourse} />
            <p className={styles.eyebrow}>Badge analytics</p>
            <h1 className={styles.pageTitle}>{badge?.name ?? course?.title ?? 'Badge'}</h1>
          </header>

          {isLoading ? <p className={styles.statusMessage}>Loading badge details...</p> : null}

          {!isLoading && error ? (
            <div className={styles.statusBlock}>
              <p className={styles.statusMessage}>{error}</p>
              <BackButton onClick={handleBackToCourse} />
            </div>
          ) : null}

          {!isLoading && !error && !(badge && summary && assessment) ? (
            <div className={styles.statusBlock}>
              <p className={styles.statusMessage}>Badge details could not be loaded.</p>
              <BackButton onClick={handleBackToCourse} />
            </div>
          ) : null}

          {!isLoading && !error && badge && summary && assessment ? (
            <>
              <section className={styles.hero}>
                <div className={styles.badgeCircle} aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="52" height="52" fill="none">
                    <path
                      d="M12 3 20 7v6c0 4.4-3.1 7.3-8 9-4.9-1.7-8-4.6-8-9V7l8-4Z"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="m8.5 12 2.2 2.2 4.8-5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className={styles.heroCopy}>
                  <p className={styles.descriptionLabel}>{course?.title}</p>
                  <p className={styles.descriptionText}>{badge.description || 'No badge description provided.'}</p>
                  <div className={styles.heroMeta}>
                    <span>{badge.lesson?.title || 'Lesson not assigned'}</span>
                    <span>{summary.totalStudents} students</span>
                    <span>{checkpointCount} checkpoints</span>
                  </div>
                </div>
              </section>

              <section className={styles.card} aria-label="Student progress">
                <div className={styles.cardHeader}>
                  <div>
                    <h2 className={styles.cardTitle}>Student Progress</h2>
                    <p className={styles.showingFor}>
                      Showing progress for: <strong>All students</strong>
                    </p>
                  </div>
                  {isInstructorFlag ? (
                    <button type="button" className={styles.primaryButton} onClick={() => setIsRosterOpen(true)}>
                      View badge roster
                    </button>
                  ) : null}
                </div>

                <div className={styles.statusGrid}>
                  <article className={`${styles.statusCard} ${styles.proficientCard}`}>
                    <span className={styles.statusDot} aria-hidden="true" />
                    <div>
                      <p>Proficient</p>
                      <strong>{summary.completedCount}</strong>
                      <span>{summary.completedPercent}% of students</span>
                    </div>
                  </article>
                  <article className={`${styles.statusCard} ${styles.learningCard}`}>
                    <span className={styles.statusDot} aria-hidden="true" />
                    <div>
                      <p>Still Learning</p>
                      <strong>{summary.inProgressCount}</strong>
                      <span>{summary.inProgressPercent}% of students</span>
                    </div>
                  </article>
                  <article className={`${styles.statusCard} ${styles.notStartedCard}`}>
                    <span className={styles.statusDot} aria-hidden="true" />
                    <div>
                      <p>Not Started</p>
                      <strong>{summary.notStartedCount}</strong>
                      <span>{summary.notStartedPercent}% of students</span>
                    </div>
                  </article>
                </div>

                <div className={styles.progressBody}>
                  <div className={styles.chartColumn}>
                    <div className={styles.topCharts}>
                      <div
                        className={styles.completionRing}
                        style={{ background: completionRingGradient }}
                        role="img"
                        aria-label={`Badge completion: ${completionPercent}%`}
                      >
                        <div className={styles.completionRingInner}>
                          <strong>{completionPercent}%</strong>
                          <span>proficient</span>
                        </div>
                      </div>

                      <div className={styles.barBreakdown}>
                        {breakdownBars.map((bar) => {
                          const barContent = (
                            <div className={styles.barRow}>
                              <p className={styles.barLabel}>{bar.label}</p>
                              <div className={styles.barTrackRow}>
                                <div className={styles.barTrack}>
                                  <div
                                    className={styles.barFill}
                                    style={{
                                      width: `${Math.max(0, Math.min(100, bar.percent))}%`,
                                      background: bar.color,
                                    }}
                                  />
                                </div>
                                <span className={styles.barPercent}>{bar.percent}%</span>
                              </div>
                            </div>
                          );

                          if (bar.kind === 'not-started') {
                            return (
                              <div key={bar.kind} className={styles.staticBarRow}>
                                {barContent}
                              </div>
                            );
                          }

                          return (
                            <details key={bar.kind} className={styles.barDetails}>
                              <summary>{barContent}</summary>
                              {bar.kind === 'completed' ? (
                                <div className={styles.analyticsRow}>
                                  <span>Average assessment score</span>
                                  <strong>
                                    {summary.completedCount} student{summary.completedCount === 1 ? '' : 's'}
                                  </strong>
                                  <strong>{summary.averageScore != null ? `${summary.averageScore}%` : '—'}</strong>
                                </div>
                              ) : (
                                <div className={styles.barDetailList}>
                                  {[
                                    {
                                      label: 'Started the video, haven’t finished',
                                      count: summary.videoInProgressCount,
                                      percent: summary.videoInProgressPercent,
                                    },
                                    {
                                      label: 'Finished the video lesson, not yet assessed',
                                      count: summary.videoCompletedOnlyCount,
                                      percent: summary.videoCompletedOnlyPercent,
                                    },
                                    {
                                      label: 'Assessed in person, haven’t passed yet',
                                      count: summary.inPersonFailedCount,
                                      percent: summary.inPersonFailedPercent,
                                    },
                                    {
                                      label: 'Passed in person, badge not awarded yet',
                                      count: summary.inReviewCount,
                                      percent: summary.inReviewPercent,
                                    },
                                  ].map((item) => (
                                    <div key={item.label} className={styles.analyticsRow}>
                                      <span>{item.label}</span>
                                      <strong>
                                        {item.count} student{item.count === 1 ? '' : 's'}
                                      </strong>
                                      <strong>{item.percent}%</strong>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </details>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {isInstructorFlag ? (
                <section className={styles.card} aria-label="Student feedback and ratings">
                  <div className={styles.cardHeader}>
                    <div>
                      <h2 className={styles.cardTitle}>Student Feedback</h2>
                      <p className={styles.showingFor}>
                        {summary.feedbackResponseCount} response{summary.feedbackResponseCount === 1 ? '' : 's'} ·
                        Average rating:{' '}
                        <strong>
                          {summary.averageRating != null ? `${summary.averageRating}/5` : 'No ratings yet'}
                        </strong>
                      </p>
                    </div>
                  </div>
                  <div className={styles.feedbackList}>
                    {students
                      .filter((row) => row.feedback)
                      .map((row) => (
                        <article key={row.enrollmentId} className={styles.feedbackItem}>
                          <div>
                            <strong>{row.student.name || row.student.email || 'Student'}</strong>
                            <span>{row.feedback?.rating}/5</span>
                          </div>
                          <p>{row.feedback?.comment || 'No written comment.'}</p>
                        </article>
                      ))}
                    {summary.feedbackResponseCount === 0 ? (
                      <p className={styles.statusMessage}>No feedback submitted yet.</p>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {data?.ratings ? <BadgeRatings ratings={data.ratings} /> : null}

              <section className={styles.card} aria-label="Assessment details">
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>Assessment Details</h2>
                  <p className={styles.checkpointCount}># of Checkpoints: {checkpointCount}</p>
                </div>

                <div className={styles.assessmentBody}>
                  <div className={styles.videoColumn}>
                    {youtubeId ? (
                      <iframe
                        className={styles.videoScreen}
                        src={`https://www.youtube.com/embed/${youtubeId}`}
                        title={videoTitle}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    ) : (
                      <div className={styles.videoScreen}>
                        <div className={styles.videoPlaceholder}>No lesson video recorded.</div>
                      </div>
                    )}
                    <div className={styles.videoMeta}>
                      <div>
                        <p className={styles.videoTitle}>{videoTitle}</p>
                        <p className={styles.videoLength}>
                          Length: <strong>{videoLength}</strong>
                        </p>
                      </div>
                      {isInstructorFlag ? (
                        <button
                          type="button"
                          className={styles.editButton}
                          onClick={() => router.push(`/badge_creation?courseId=${courseId}&badgeId=${badgeId}`)}
                        >
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
                            <path
                              d="M4 20h4l10.5-10.5a2.121 2.121 0 0 0-3-3L5 17v3z"
                              stroke="#1d1d1d"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <span>Edit</span>
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className={styles.timelineColumn}>
                    {assessment.checkpoints.length > 0 ? (
                      <ol className={styles.timeline}>
                        {assessment.checkpoints.map((checkpoint, index) => (
                          <li key={`${checkpoint.title ?? 'checkpoint'}-${index}`} className={styles.timelineItem}>
                            <span className={styles.timelineDot} aria-hidden="true" />
                            <div className={styles.timelineContent}>
                              <p className={styles.timelineSegment}>
                                {checkpoint.segmentLabel || `Segment ${index + 1}`}
                              </p>
                              <p className={styles.timelineTitle}>{checkpoint.title || `Checkpoint ${index + 1}`}</p>
                              {checkpoint.questionText ? (
                                <p className={styles.timelineQuestion}>{checkpoint.questionText}</p>
                              ) : checkpoint.question ? (
                                <p className={styles.timelineQuestion}>{checkpoint.question}</p>
                              ) : null}
                              <p className={styles.timelinePoints}>
                                {[checkpoint.time, checkpoint.points != null ? `${checkpoint.points} pts` : null]
                                  .filter(Boolean)
                                  .join(' | ') || '—'}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className={styles.statusMessage}>No checkpoints recorded for this badge.</p>
                    )}
                  </div>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </main>

      {isInstructorFlag && isRosterOpen && badge && courseId && badgeId ? (
        <BadgeRosterPanel
          badgeName={badge.name}
          courseId={courseId}
          badgeId={badgeId}
          rows={data?.students ?? []}
          onClose={() => setIsRosterOpen(false)}
        />
      ) : null}

      {/* Legacy inline roster replaced by BadgeRosterPanel.
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setIsRosterOpen(false)}>
          <section
            className={styles.rosterModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="badge-roster-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.rosterHeader}>
              <div>
                <h2 id="badge-roster-title">{badge.name} roster</h2>
                <p>{data.students.length} students</p>
              </div>
              <div className={styles.rosterActions}>
                <button type="button" className={styles.secondaryButton} onClick={exportRoster}>
                  Export CSV
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setIsRosterOpen(false)}
                  aria-label="Close roster"
                >
                  ×
                </button>
              </div>
            </div>
            <div className={styles.tableScroller}>
              <table className={styles.rosterTable}>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Section</th>
                    <th>Progress</th>
                    <th>Video</th>
                    <th>Assessment</th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((row) => (
                    <tr key={row.enrollmentId}>
                      <td>
                        <Link href={`/roster/${row.student.id}?courseId=${courseId}&badgeId=${badge.id}`}>
                          {row.student.name || row.student.email || 'Student'}
                        </Link>
                      </td>
                      <td>{row.sections.join(', ') || '—'}</td>
                      <td>
                        {row.analyticsStatus === 'PROFICIENT'
                          ? 'Proficient'
                          : row.analyticsStatus === 'NOT_STARTED'
                            ? 'Not Started'
                            : 'Still Learning'}
                      </td>
                      <td>
                        {row.videoStatus === 'COMPLETED'
                          ? 'Completed'
                          : row.videoStatus === 'IN_PROGRESS'
                            ? 'In Progress'
                            : 'Not Started'}
                      </td>
                      <td>
                        {row.analyticsStatus === 'PROFICIENT'
                          ? 'Proficient'
                          : row.assessmentAttemptCount > 0
                            ? `${row.assessmentAttemptCount} attempt${row.assessmentAttemptCount === 1 ? '' : 's'}`
                            : 'Not attempted'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      */}
    </div>
  );
}
