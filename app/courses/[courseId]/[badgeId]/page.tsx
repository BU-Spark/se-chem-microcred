'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import { isInstructor } from '@/lib/roles';

import Sidebar, { SIDEBAR_NAV } from '@/app/components/Navigation/Sidebar';
import BackButton from '@/app/components/BackButton/BackButton';
import styles from './page.module.css';

type BadgeStatus = 'LEARNING' | 'READY_FOR_ASSESSMENT' | 'READY_FOR_FINALIZATION' | 'COMPLETED' | 'NOT_STARTED';

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
  viewerRole: 'STUDENT' | 'INSTRUCTOR' | 'CHECKER' | null;
  badge: BadgeDetail | null;
  course: CourseDetail;
  summary: ProgressSummary;
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

/** Circular ring indicator approximated with a conic-gradient. */
function RingIndicator({ percent, caption }: { percent: number; caption: string }) {
  const clamped = Math.round(Math.max(0, Math.min(100, percent)));

  return (
    <div className={styles.ringIndicator}>
      <div
        className={styles.ring}
        style={{ background: `conic-gradient(#2e6aa9 ${clamped * 3.6}deg, #d9d9d9 0deg)` }}
        role="img"
        aria-label={`${caption}: ${clamped}%`}
      >
        <div className={styles.ringInner}>
          <span className={styles.ringValueGroup}>
            <span className={styles.ringValue}>{clamped}</span>
            <span className={styles.ringPercent}>%</span>
          </span>
        </div>
      </div>
      <p className={styles.ringCaption}>{caption}</p>
    </div>
  );
}

export default function CourseBadgeProgress() {
  const params = useParams<{ courseId: string; badgeId: string }>();
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const signOut = useSignOut();
  const [isSigningOut, setIsSigningOut] = useState(false);

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
  const isInstructorFlag = isInstructor(data?.viewerRole);
  const displayName = course?.createdBy?.name || user?.fullName || '';

  // Progress breakdown bars driven by the real summary percentages.
  const breakdownBars = useMemo(
    () =>
      summary
        ? [
            { label: 'Students who have completed this badge', percent: summary.completedPercent, color: '#c9db50' },
            { label: 'Students still in progress', percent: summary.inProgressPercent, color: '#f3b55b' },
            { label: 'Students not yet started', percent: summary.notStartedPercent, color: '#d4d4d4' },
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
    return `conic-gradient(#c9db50 0deg ${completedDeg}deg, #f3b55b ${completedDeg}deg ${inProgressEnd}deg, #e4e4e4 ${inProgressEnd}deg 360deg)`;
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
                <div className={styles.badgeCircle} aria-hidden="true" />
                <div className={styles.heroCopy}>
                  <p className={styles.descriptionLabel}>Description</p>
                  <p className={styles.descriptionText}>{badge.description || 'No badge description provided.'}</p>
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
                </div>

                <div className={styles.progressBody}>
                  <div className={styles.statColumn}>
                    <div className={styles.bigStat}>
                      <strong>N/A</strong>
                      <span>Average time to completion</span>
                    </div>
                    <div className={styles.bigStat}>
                      <strong>{summary.completedPercent}%</strong>
                      <span>Got checkd on their first try</span>
                    </div>
                    <div className={styles.bigStat}>
                      <strong>{summary.inProgressPercent}%</strong>
                      <span>Watched optional learning videos</span>
                    </div>
                  </div>

                  <div className={styles.divider} aria-hidden="true" />

                  <div className={styles.chartColumn}>
                    <div className={styles.topCharts}>
                      <div
                        className={styles.completionRing}
                        style={{ background: completionRingGradient }}
                        role="img"
                        aria-label={`Badge completion: ${completionPercent}%`}
                      >
                        <div className={styles.completionRingInner}>
                          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" aria-hidden="true">
                            <path
                              d="M5 13l4 4L19 7"
                              stroke="#8aa30f"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      </div>

                      <div className={styles.barBreakdown}>
                        {breakdownBars.map((bar) => (
                          <div key={bar.label} className={styles.barRow}>
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
                        ))}
                      </div>
                    </div>

                    {/* The design shows "Average precheck score" + "Average assessment score",
                        but the API only tracks one score. Show the metrics we actually have:
                        % of students ready for assessment, and the average assessment score. */}
                    <div className={styles.ringRow}>
                      <RingIndicator percent={summary.readyForAssessmentPercent} caption="Ready for assessment" />
                      <RingIndicator percent={summary.averageScore ?? 0} caption="Average assessment score" />
                    </div>
                  </div>
                </div>
              </section>

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
    </div>
  );
}
