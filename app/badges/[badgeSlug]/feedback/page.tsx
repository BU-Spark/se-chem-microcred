'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import { useStudentData, type BadgeRecord } from '../../../hooks/useStudentData';
import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';
import styles from './page.module.css';
import { toTitleCase } from '@/lib/utils';

const BADGE_STATUS_LABEL: Record<string, string> = {
  LEARNING: 'Still learning',
  READY_FOR_ASSESSMENT: 'Ready for assessment',
  IN_REVIEW: 'In review',
  COMPLETED: 'Completed',
  LOCKED: 'Locked',
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Derive the cooldown panel from real data: the last attempt time, the cooldown
// end (now < cooldownUntil == blocked), and a fill fraction across the window.
function describeCooldown({
  cooldownUntil,
  lastCompletedAt,
  now = Date.now(),
}: {
  cooldownUntil: string | null;
  lastCompletedAt: string | null;
  now?: number;
}) {
  const lastLabel = formatDate(lastCompletedAt) ?? 'N/A';
  const until = cooldownUntil ? new Date(cooldownUntil).getTime() : null;
  const active = until !== null && !Number.isNaN(until) && now < until;

  if (!active || until === null) {
    return { active: false, lastLabel, remainingLabel: 'Available now', nextLabel: 'Now', progressPercent: 100 };
  }

  const msRemaining = until - now;
  const dayMs = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.ceil(msRemaining / dayMs);
  const remainingLabel =
    daysRemaining > 1
      ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`
      : `${Math.max(1, Math.ceil(msRemaining / (60 * 60 * 1000)))} hour${msRemaining <= 60 * 60 * 1000 ? '' : 's'} remaining`;

  const start = lastCompletedAt ? new Date(lastCompletedAt).getTime() : null;
  const progressPercent =
    start !== null && !Number.isNaN(start) && until > start
      ? Math.min(100, Math.max(0, Math.round(((now - start) / (until - start)) * 100)))
      : 0;

  return { active: true, lastLabel, remainingLabel, nextLabel: formatDate(cooldownUntil) ?? 'TBD', progressPercent };
}

type FeedbackDetail = {
  badge: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    status: BadgeRecord['status'];
    score: number | null;
    awardedAt: string | null;
    cooldownUntil: string | null;
    cooldownDays: number;
  };
  rubric: {
    goalId: string;
    goalName: string;
    subgoals: Array<{
      id: string;
      text: string;
      passThreshold: number;
      sortOrder: number;
      tasks: Array<{
        id: string;
        text: string;
        points: number;
        sortOrder: number;
      }>;
    }>;
  } | null;
  latestAttempt: {
    id: string;
    passed: boolean;
    score: number | null;
    pointsEarned: number | null;
    pointsPossible: number | null;
    feedback: string | null;
    completedAt: string | null;
    assessorName: string | null;
    responses: Array<{
      id: string;
      subgoalText: string;
      taskText: string;
      points: number;
      passed: boolean;
      feedback: string | null;
      isOverride: boolean;
      sortOrder: number;
    }>;
  } | null;
};

export default function BadgeFeedbackPage() {
  const params = useParams<{ badgeSlug: string }>();
  const { isLoaded, isSignedIn, user } = useUser();
  const signOut = useSignOut();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCourseId = searchParams.get('courseId')?.trim() || null;
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [feedbackDetail, setFeedbackDetail] = useState<FeedbackDetail | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [reviewedStatus, setReviewedStatus] = useState<BadgeRecord['status'] | null>(null);
  // cooldownUntil returned by the acknowledge POST — the freshest value, since the
  // fail-path transition computes it at acknowledge time.
  const [reviewedCooldownUntil, setReviewedCooldownUntil] = useState<string | null | undefined>(undefined);
  const [reviewRequestState, setReviewRequestState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  const { data: studentData } = useStudentData(user?.primaryEmailAddress?.emailAddress, requestedCourseId);

  const allBadges = useMemo<BadgeRecord[]>(() => {
    if (!studentData) {
      return [];
    }
    return [
      ...studentData.badges.learning,
      ...studentData.badges.readyForAssessment,
      ...studentData.badges.inReview,
      ...studentData.badges.locked,
      ...studentData.badges.completed,
    ];
  }, [studentData]);

  const badge = allBadges.find((entry) => entry.slug === params.badgeSlug);
  const content = useMemo(() => {
    if (!badge) return null;
    return {
      title: badge.name,
      feedback: badge.description ?? 'We are still preparing detailed feedback for this badge.',
      lessonSummary:
        'We are preparing detailed review points for this badge. In the meantime, revisit your lesson checkpoints.',
      checkpoints: [] as Array<{ title: string; image: string; subtitle: string; duration: string }>,
      optional: [] as Array<{ title: string; image: string; duration: string; summary: string }>,
    };
  }, [badge]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !studentData) {
      return;
    }

    if (!allBadges.some((entry) => entry.slug === params.badgeSlug)) {
      router.replace('/badges');
    }
  }, [allBadges, isLoaded, isSignedIn, params.badgeSlug, router, studentData]);

  useEffect(() => {
    if (!badge) {
      setFeedbackDetail(null);
      setFeedbackError(null);
      setReviewedStatus(null);
      setReviewedCooldownUntil(undefined);
      setReviewRequestState('idle');
      return;
    }

    let isCancelled = false;
    setFeedbackDetail(null);
    setFeedbackError(null);
    setReviewedStatus(null);
    setReviewedCooldownUntil(undefined);
    setReviewRequestState('idle');

    fetch(`/api/badges/${badge.id}/feedback`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to load badge feedback.');
        }
        if (!isCancelled) {
          setFeedbackDetail(payload as FeedbackDetail);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          setFeedbackError(error instanceof Error ? error.message : 'Unable to load badge feedback.');
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [badge]);

  useEffect(() => {
    // A failed attempt sits at IN_REVIEW until the student acknowledges it here.
    // Acknowledging routes the badge to READY_FOR_ASSESSMENT (retry, gated by
    // cooldown) or LOCKED. The pass path acknowledges + rates via the survey modal.
    if (
      !badge ||
      !feedbackDetail ||
      feedbackDetail.badge.status !== 'IN_REVIEW' ||
      feedbackDetail.latestAttempt?.passed !== false ||
      reviewRequestState !== 'idle'
    ) {
      return;
    }

    let isCancelled = false;
    setReviewRequestState('pending');

    fetch(`/api/badges/${badge.id}/feedback`, { method: 'POST' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to mark feedback as reviewed.');
        }
        if (!isCancelled) {
          setReviewedStatus(payload.status as BadgeRecord['status']);
          setReviewedCooldownUntil((payload.cooldownUntil as string | null) ?? null);
          setReviewRequestState('done');
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          setFeedbackError(error instanceof Error ? error.message : 'Unable to mark feedback as reviewed.');
          setReviewRequestState('error');
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [badge, feedbackDetail, reviewRequestState]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  if (!badge) {
    return null;
  }

  const displayName = studentData?.student.name || user?.fullName || 'Student Demo';

  const handleBackToBadges = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push('/badges');
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/splash');
    } catch (error) {
      console.error('Sign out failed', error);
      setIsSigningOut(false);
    }
  };

  if (!content) {
    return (
      <div className="page">
        <Sidebar
          navItems={SIDEBAR_NAV}
          displayName={displayName}
          onSignOut={handleSignOut}
          isSigningOut={isSigningOut}
        />

        <main className="main">
          <div className={styles.pageContent}>
            <div className={styles.headerRow}>
              <h1 className={styles.title}>{badge.name}</h1>
            </div>

            <div className={styles.badgeCard}>
              <h2>Feedback content not yet available</h2>
              <p>We&apos;re still preparing feedback for this badge. Please check back later.</p>
              <button type="button" className={styles.primaryButton} onClick={handleBackToBadges}>
                Back to badges
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const lessonSlug = badge.requirements.find((req) => req.lessonSlug)?.lessonSlug;
  const lessonCourseId = badge.courseId ?? studentData?.course?.id ?? requestedCourseId;
  const lessonHref = lessonSlug
    ? lessonCourseId
      ? `/lessons/${lessonSlug}?courseId=${encodeURIComponent(lessonCourseId)}`
      : `/lessons/${lessonSlug}`
    : null;
  const displayedStatus = reviewedStatus ?? feedbackDetail?.badge.status ?? badge.status;
  const latestAttempt = feedbackDetail?.latestAttempt ?? null;
  const rubric = feedbackDetail?.rubric ?? null;
  // Prefer the freshest cooldown: the acknowledge POST computes it at review time,
  // then the feedback GET, then the (possibly stale) student-data snapshot.
  const cooldownUntil =
    reviewedCooldownUntil !== undefined
      ? reviewedCooldownUntil
      : (feedbackDetail?.badge.cooldownUntil ?? badge.cooldownUntil ?? null);
  const cooldown = describeCooldown({
    cooldownUntil,
    lastCompletedAt: latestAttempt?.completedAt ?? null,
  });
  const responseByKey = new Map(
    latestAttempt?.responses.map((response) => [`${response.subgoalText}::${response.taskText}`, response]) ?? []
  );

  return (
    <div className="page">
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className="main">
        <div className={styles.pageContent}>
          <button type="button" className={styles.backLink} onClick={handleBackToBadges}>
            ← Back to badges
          </button>
          <div className={styles.headerRow}>
            <h1 className={styles.title}>{content.title}</h1>
          </div>

          <div className={styles.badgeCard}>
            <h2>
              Status: <span style={{ color: '#f3f27a' }}>{BADGE_STATUS_LABEL[displayedStatus] ?? 'Status'}</span>
            </h2>
            <p>{content.feedback}</p>
            {reviewRequestState === 'pending' ? <p>Marking feedback reviewed...</p> : null}
            {reviewRequestState === 'done' ? (
              <p>
                {reviewedStatus === 'LOCKED'
                  ? "Your feedback has been reviewed. You've used every assessment attempt for this badge."
                  : 'Your feedback has been reviewed. This badge is ready for reassessment.'}
              </p>
            ) : null}
            {feedbackError ? <p>{feedbackError}</p> : null}
          </div>

          <div className={styles.section}>
            <h3>Assessment Rubric</h3>
            {latestAttempt ? (
              <div className={styles.assessmentSummary}>
                <span>Outcome: {latestAttempt.passed ? 'Passed' : 'Needs reassessment'}</span>
                {latestAttempt.assessorName ? <span>Assessor: {latestAttempt.assessorName}</span> : null}
              </div>
            ) : null}
            {rubric ? (
              <div className={styles.rubricTable} aria-label="Read-only assessment rubric">
                <div className={styles.rubricHeader}>
                  <strong>{rubric.goalName}</strong>
                </div>
                {rubric.subgoals.map((subgoal) => (
                  <div key={subgoal.id}>
                    <div className={styles.rubricSubHeader}>
                      <strong>{subgoal.text}</strong>
                    </div>
                    {subgoal.tasks.map((task) => {
                      const response = responseByKey.get(`${subgoal.text}::${task.text}`);
                      return (
                        <div key={task.id} className={styles.rubricRow}>
                          <strong>{toTitleCase(task.text)}</strong>
                          <div>
                            <span className={response?.passed ? styles.rubricPassed : styles.rubricNeedsWork}>
                              {response ? (response.passed ? 'Passed' : 'Needs work') : 'Not assessed'}
                            </span>
                            <p>{response?.feedback || 'No task feedback recorded.'}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                {latestAttempt?.responses
                  .filter((response) => response.isOverride)
                  .map((response) => (
                    <div key={response.id} className={styles.rubricRow}>
                      <div>
                        <strong>{response.subgoalText}</strong>
                        <p>Assessor decision</p>
                      </div>
                      <div>
                        <span className={response.passed ? styles.rubricPassed : styles.rubricNeedsWork}>
                          {response.passed ? 'Passed' : 'Needs work'}
                        </span>
                        <p>{response.feedback || 'No override feedback recorded.'}</p>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p>No rubric has been recorded for this badge yet.</p>
            )}
          </div>

          {displayedStatus === 'READY_FOR_ASSESSMENT' ? (
            <div className={styles.cooldown}>
              <h3>Cooldown</h3>
              <div className={styles.cooldownBar}>
                <div className={styles.cooldownBarFill} style={{ width: `${cooldown.progressPercent}%` }} />
              </div>
              <div className={styles.cooldownMeta}>
                <div>
                  <div style={{ fontWeight: 600 }}>{cooldown.lastLabel}</div>
                  <div style={{ opacity: 0.7, fontSize: '0.9rem' }}>Last assessment</div>
                </div>
                <div style={{ textAlign: 'center' }}>{cooldown.remainingLabel}</div>
                <div>
                  <div style={{ fontWeight: 600 }}>{cooldown.nextLabel}</div>
                  <div style={{ opacity: 0.7, fontSize: '0.9rem' }}>Next attempt window</div>
                </div>
              </div>
            </div>
          ) : null}

          <div className={styles.section}>
            <h3>Review</h3>
            <p>{content.lessonSummary}</p>
            <div className={styles.timeline}>
              {content.checkpoints.map((checkpoint) => (
                <div key={checkpoint.title} className={styles.timelineItem}>
                  <Image src={checkpoint.image} alt={checkpoint.title} width={320} height={180} />
                  <strong>{checkpoint.title}</strong>
                  <div>{checkpoint.subtitle}</div>
                  <div style={{ opacity: 0.75 }}>{checkpoint.duration}</div>
                </div>
              ))}
            </div>
            {lessonHref ? (
              <Link href={lessonHref} className={styles.primaryButton}>
                Review Lesson
              </Link>
            ) : null}
          </div>

          <div className={styles.section}>
            <h3>Optional Learning</h3>
            <div className={styles.optionalGrid}>
              {content.optional.map((item) => (
                <div key={item.title} className={styles.optionalCard}>
                  <Image src={item.image} alt={item.title} width={320} height={180} />
                  <strong>{item.title}</strong>
                  <div style={{ opacity: 0.75 }}>{item.duration}</div>
                  <p style={{ opacity: 0.8 }}>{item.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
