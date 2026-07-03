'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import { useStudentData, type BadgeRecord } from '../../../hooks/useStudentData';
import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';
import styles from './page.module.css';

const REVIEW_CONTENT: Record<
  string,
  {
    title: string;
    feedback: string;
    cooldown: { last: string; remaining: string; next: string };
    lessonSummary: string;
    checkpoints: Array<{
      title: string;
      subtitle: string;
      duration: string;
      image: string;
    }>;
    optional: Array<{
      title: string;
      duration: string;
      summary: string;
      image: string;
    }>;
  }
> = {
  'bunsen-burner-badge': {
    title: 'Bunsen Burner Badge',
    feedback:
      "Keep refining your flame control and ignition steps. Review your instructor's notes and rewatch the checkpoints below to prepare for your reassessment.",
    cooldown: {
      last: '03/08/2025',
      remaining: '3 days remaining',
      next: '03/15/2025',
    },
    lessonSummary:
      'Revisit each burner checkpoint, paying close attention to hose inspections and flame height adjustments. Focus on deliberate movements and verbal callouts.',
    checkpoints: [
      {
        title: 'Part 1',
        subtitle: 'Ignition & Setup',
        duration: '1.4 minutes',
        image: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=400&q=80',
      },
      {
        title: 'Part 2',
        subtitle: 'Flame Control',
        duration: '1.3 minutes',
        image: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=400&q=80',
      },
      {
        title: 'Part 3',
        subtitle: 'Shutdown & Storage',
        duration: '1.2 minutes',
        image: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=400&q=80',
      },
    ],
    optional: [
      {
        title: 'Advanced Flame Types',
        duration: '4 min',
        summary: 'Walk through oxidizing vs. reducing flames and how to set each one.',
        image: 'https://images.unsplash.com/photo-1470165229730-5bf5ce30f7b6?auto=format&fit=crop&w=400&q=80',
      },
      {
        title: 'Common Burner Mistakes',
        duration: '3 min',
        summary: 'Review avoidable lab errors spotted during assessments.',
        image: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=400&q=80',
      },
      {
        title: 'Instructor Walkthrough',
        duration: '5 min',
        summary: 'Watch a full burner demonstration narrated by the lab team.',
        image: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=400&q=80',
      },
    ],
  },
  'lab-notebook-badge': {
    title: 'Lab Notebook Badge',
    feedback:
      'Great start capturing your work. Tighten consistency on page numbering, dating entries, and summarizing objectives before each experiment.',
    cooldown: {
      last: '03/05/2025',
      remaining: 'Open for reassessment now',
      next: '03/12/2025',
    },
    lessonSummary:
      'Review the setup walkthrough and ensure every page is numbered, dated, and includes a clear objective and materials list. Keep handwriting readable and avoid blank spaces.',
    checkpoints: [
      {
        title: 'Part 1',
        subtitle: 'Notebook Setup',
        duration: '1.2 minutes',
        image: 'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=400&q=80',
      },
      {
        title: 'Part 2',
        subtitle: 'Page Numbering & Dates',
        duration: '1.0 minutes',
        image: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=400&q=80',
      },
      {
        title: 'Part 3',
        subtitle: 'Objectives & Materials',
        duration: '1.1 minutes',
        image: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=400&q=80',
      },
    ],
    optional: [
      {
        title: 'Example Pre-lab Entry',
        duration: '3 min',
        summary: 'See a complete pre-lab with objectives, hazards, and materials.',
        image: 'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?auto=format&fit=crop&w=400&q=80',
      },
      {
        title: 'Common Notebook Pitfalls',
        duration: '2 min',
        summary: 'Avoid gaps, illegible notes, and missing dates.',
        image: 'https://images.unsplash.com/photo-1504691342899-4d92b50853e1?auto=format&fit=crop&w=400&q=80',
      },
    ],
  },
};

const BADGE_STATUS_LABEL: Record<string, string> = {
  LEARNING: 'Still learning',
  READY_FOR_ASSESSMENT: 'Ready for assessment',
  READY_FOR_FINALIZATION: 'Ready to be finalized',
  COMPLETED: 'Completed',
};

type FeedbackDetail = {
  badge: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    status: BadgeRecord['status'];
    score: number | null;
    awardedAt: string | null;
  };
  rubric: {
    goalId: string;
    goalName: string;
    totalPoints: number;
    passThreshold: number;
    subgoals: Array<{
      id: string;
      text: string;
      points: number;
      sortOrder: number;
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
  const { signOut } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCourseId = searchParams.get('courseId')?.trim() || null;
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [feedbackDetail, setFeedbackDetail] = useState<FeedbackDetail | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [reviewedStatus, setReviewedStatus] = useState<BadgeRecord['status'] | null>(null);
  const [reviewRequestState, setReviewRequestState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  const { data: studentData } = useStudentData(user?.primaryEmailAddress?.emailAddress, requestedCourseId);

  const allBadges = useMemo<BadgeRecord[]>(() => {
    if (!studentData) {
      return [];
    }
    return [
      ...studentData.badges.learning,
      ...studentData.badges.readyForAssessment,
      ...studentData.badges.readyForFinalization,
      ...studentData.badges.completed,
    ];
  }, [studentData]);

  const badge = allBadges.find((entry) => entry.slug === params.badgeSlug);
  const content = useMemo(() => {
    if (!badge) return null;
    const specific = REVIEW_CONTENT[params.badgeSlug];
    if (specific) return specific;
    return {
      title: badge.name,
      feedback: badge.description ?? 'We are still preparing detailed feedback for this badge.',
      cooldown: { last: 'N/A', remaining: 'Feedback pending', next: 'TBD' },
      lessonSummary:
        'We are preparing detailed review points for this badge. In the meantime, revisit your lesson checkpoints.',
      checkpoints: [],
      optional: [],
    };
  }, [badge, params.badgeSlug]);

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
      setReviewRequestState('idle');
      return;
    }

    let isCancelled = false;
    setFeedbackDetail(null);
    setFeedbackError(null);
    setReviewedStatus(null);
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
    if (
      !badge ||
      !feedbackDetail ||
      feedbackDetail.badge.status !== 'LEARNING' ||
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
  const responseByText = new Map(latestAttempt?.responses.map((response) => [response.subgoalText, response]) ?? []);

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
              <p>Your feedback has been reviewed. This badge is ready for reassessment.</p>
            ) : null}
            {feedbackError ? <p>{feedbackError}</p> : null}
          </div>

          <div className={styles.section}>
            <h3>Assessment Rubric</h3>
            {latestAttempt ? (
              <div className={styles.assessmentSummary}>
                <span>Outcome: {latestAttempt.passed ? 'Passed' : 'Needs reassessment'}</span>
                <span>
                  Score:{' '}
                  {latestAttempt.pointsEarned != null && latestAttempt.pointsPossible != null
                    ? `${latestAttempt.pointsEarned}/${latestAttempt.pointsPossible}`
                    : latestAttempt.score != null
                      ? `${latestAttempt.score}%`
                      : 'Not scored'}
                </span>
                {latestAttempt.assessorName ? <span>Assessor: {latestAttempt.assessorName}</span> : null}
              </div>
            ) : null}
            {rubric ? (
              <div className={styles.rubricTable} aria-label="Read-only assessment rubric">
                <div className={styles.rubricHeader}>
                  <strong>{rubric.goalName}</strong>
                  <span>
                    Passing threshold: {rubric.passThreshold}/{rubric.totalPoints}
                  </span>
                </div>
                {rubric.subgoals.map((subgoal) => {
                  const response = responseByText.get(subgoal.text);
                  return (
                    <div key={subgoal.id} className={styles.rubricRow}>
                      <div>
                        <strong>{subgoal.text}</strong>
                        <p>
                          {subgoal.points} {subgoal.points === 1 ? 'point' : 'points'}
                        </p>
                      </div>
                      <div>
                        <span className={response?.passed ? styles.rubricPassed : styles.rubricNeedsWork}>
                          {response ? (response.passed ? 'Passed' : 'Needs work') : 'Not assessed'}
                        </span>
                        <p>{response?.feedback || 'No criterion feedback recorded.'}</p>
                      </div>
                    </div>
                  );
                })}
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

          {badge.status === 'READY_FOR_ASSESSMENT' ? (
            <div className={styles.cooldown}>
              <h3>Cooldown</h3>
              <div className={styles.cooldownBar} />
              <div className={styles.cooldownMeta}>
                <div>
                  <div style={{ fontWeight: 600 }}>{content.cooldown.last}</div>
                  <div style={{ opacity: 0.7, fontSize: '0.9rem' }}>Last assessment</div>
                </div>
                <div style={{ textAlign: 'center' }}>{content.cooldown.remaining}</div>
                <div>
                  <div style={{ fontWeight: 600 }}>{content.cooldown.next}</div>
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
