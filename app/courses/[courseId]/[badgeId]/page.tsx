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

type CohortBucket = {
  count: number;
  percent: number;
};

type CohortSummary = {
  totalStudents: number;
  proficient: CohortBucket;
  stillLearning: CohortBucket & {
    lockedCount: number;
    stages: {
      videoIncomplete: CohortBucket;
      videoComplete: CohortBucket;
      attemptFailed: CohortBucket;
      awaitingAward: CohortBucket;
    };
  };
  notStarted: CohortBucket;
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
  cohort?: RosterCohort;
  stage?: RosterStage;
  locked?: boolean;
};

type BadgeDetailResponse = {
  viewerRole: 'STUDENT' | 'INSTRUCTOR' | 'CHECKER' | null;
  badge: BadgeDetail | null;
  course: CourseDetail;
  summary: ProgressSummary;
  cohorts: CohortSummary | null;
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

function studentLabel(count: number) {
  return `${count} student${count === 1 ? '' : 's'}`;
}

/** One of the three top-level cohorts: headline count, share of the class, and what it means. */
function CohortTile({
  tone,
  title,
  hint,
  bucket,
  children,
}: {
  tone: 'proficient' | 'learning' | 'notStarted';
  title: string;
  hint: string;
  bucket: CohortBucket;
  children?: React.ReactNode;
}) {
  return (
    <article className={styles.cohortTile} data-tone={tone}>
      <div className={styles.cohortTileHead}>
        <span className={styles.cohortSwatch} data-tone={tone} aria-hidden="true" />
        <h3 className={styles.cohortTitle}>{title}</h3>
      </div>
      <p className={styles.cohortValue}>
        {bucket.count}
        <span className={styles.cohortPercent}>{bucket.percent}%</span>
      </p>
      <p className={styles.cohortHint}>{hint}</p>
      {children}
    </article>
  );
}

export default function CourseBadgeProgress() {
  const params = useParams<{ courseId: string; badgeId: string }>();
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const signOut = useSignOut();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
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
  const isInstructorFlag = isInstructor(data?.viewerRole);
  const displayName = course?.createdBy?.name || user?.fullName || '';
  const cohorts = data?.cohorts ?? null;

  // Sub-stages of "still learning", ordered furthest-along last so the row reads
  // as a path through the badge.
  const learningStages = useMemo(
    () =>
      cohorts
        ? [
            {
              key: 'videoIncomplete',
              label: 'Started the video, haven’t finished it',
              bucket: cohorts.stillLearning.stages.videoIncomplete,
            },
            {
              key: 'videoComplete',
              label: 'Finished the video lesson, not yet assessed',
              bucket: cohorts.stillLearning.stages.videoComplete,
            },
            {
              key: 'attemptFailed',
              label: 'Assessed in person, haven’t passed yet',
              bucket: cohorts.stillLearning.stages.attemptFailed,
            },
            {
              key: 'awaitingAward',
              label: 'Passed in person, badge not awarded yet',
              bucket: cohorts.stillLearning.stages.awaitingAward,
            },
          ]
        : [],
    [cohorts]
  );

  if (!isLoaded || !isSignedIn) {
    return null;
  }

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
                <div>
                  <p className={styles.descriptionLabel}>Description</p>
                  <p className={styles.descriptionText}>{badge.description || 'No badge description provided.'}</p>
                </div>
              </section>

              {cohorts ? (
                <section className={styles.card} aria-label="Student progress">
                  <div className={styles.cardHeader}>
                    <div>
                      <h2 className={styles.cardTitle}>Student Progress</h2>
                      <p className={styles.showingFor}>
                        <span>{studentLabel(cohorts.totalStudents)} enrolled</span>
                        {summary.averageScore != null ? (
                          <span className={styles.showingForAside}>
                            Average assessment score: <strong>{summary.averageScore}%</strong>
                          </span>
                        ) : null}
                      </p>
                    </div>

                    {isInstructorFlag ? (
                      <button
                        type="button"
                        className={styles.rosterButton}
                        onClick={() => setIsRosterOpen(true)}
                        aria-haspopup="dialog"
                      >
                        View roster
                      </button>
                    ) : null}
                  </div>

                  {/* One grid owns the whole overview: full-width bar, three tiles,
                      full-width breakdown. Named areas keep the markup flat. */}
                  <div className={styles.cohortLayout}>
                    <div
                      className={styles.cohortBar}
                      role="img"
                      aria-label={`Proficient ${cohorts.proficient.percent}%, still learning ${cohorts.stillLearning.percent}%, not started ${cohorts.notStarted.percent}%`}
                      // fr units divide the track by the real counts, so the bar fills
                      // exactly even when the rounded percentages don't total 100.
                      style={{
                        gridTemplateColumns: `${cohorts.proficient.count}fr ${cohorts.stillLearning.count}fr ${cohorts.notStarted.count}fr`,
                      }}
                    >
                      <span className={styles.cohortBarSegment} data-tone="proficient" />
                      <span className={styles.cohortBarSegment} data-tone="learning" />
                      <span className={styles.cohortBarSegment} data-tone="notStarted" />
                    </div>

                    <CohortTile
                      tone="proficient"
                      title="Proficient"
                      hint="Earned this badge"
                      bucket={cohorts.proficient}
                    />

                    <CohortTile
                      tone="learning"
                      title="Still Learning"
                      hint="Started, badge not earned yet"
                      bucket={cohorts.stillLearning}
                    >
                      <button
                        type="button"
                        className={styles.breakdownToggle}
                        onClick={() => setIsBreakdownOpen((open) => !open)}
                        aria-expanded={isBreakdownOpen}
                        aria-controls="still-learning-breakdown"
                      >
                        {isBreakdownOpen ? 'Hide breakdown' : 'Show breakdown'}
                      </button>
                    </CohortTile>

                    <CohortTile
                      tone="notStarted"
                      title="Not Started"
                      hint="Haven’t opened the lesson"
                      bucket={cohorts.notStarted}
                    />

                    <div id="still-learning-breakdown" hidden={!isBreakdownOpen} className={styles.breakdownPanel}>
                      <p className={styles.breakdownIntro}>
                        Where the {studentLabel(cohorts.stillLearning.count)} still learning this badge are —
                        percentages are of all {cohorts.totalStudents} enrolled.
                      </p>

                      <dl className={styles.breakdownList}>
                        {learningStages.map((stage) => (
                          <div key={stage.key} className={styles.breakdownRow}>
                            <dt className={styles.breakdownLabel}>{stage.label}</dt>
                            <dd className={styles.breakdownCount}>{studentLabel(stage.bucket.count)}</dd>
                            <dd className={styles.breakdownPercent}>{stage.bucket.percent}%</dd>
                          </div>
                        ))}
                      </dl>

                      {cohorts.stillLearning.lockedCount > 0 ? (
                        <p className={styles.breakdownNote}>
                          {studentLabel(cohorts.stillLearning.lockedCount)} used every reassessment attempt and cannot
                          retry without instructor action.
                        </p>
                      ) : null}
                    </div>
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
    </div>
  );
}
