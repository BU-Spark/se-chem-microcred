'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import { generateInitials, getNameForProfile } from '@/lib/text/name';

import Sidebar, { SIDEBAR_NAV } from '@/app/components/Navigation/Sidebar';
import BackButton from '@/app/components/BackButton/BackButton';
import StudentProfileCard from '@/app/components/StudentProfileCard';
import rosterStyles from '@/app/roster/[studentId]/page.module.css';
import styles from './page.module.css';
import { useAssessmentReadiness } from './hooks/useAssessmentReadiness';

type TaskDraft = {
  taskId: string;
  text: string;
  points: number;
  passed: boolean;
  feedback: string;
};

type SubgoalGroupDraft = {
  subgoalId: string;
  text: string;
  passThreshold: number;
  tasks: TaskDraft[];
};

function resolveParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function avatarAsset(base?: string | null) {
  switch (base) {
    case 'RUBY':
      return '/edit_avatar/ruby.svg';
    case 'EMERALD':
      return '/edit_avatar/emerald.svg';
    case 'AMETHYST':
      return '/edit_avatar/amethyst.svg';
    case 'SAPPHIRE':
    default:
      return '/edit_avatar/sapphire.svg';
  }
}

function contactDisplayName(name?: string | null, email?: string | null) {
  return name?.trim() || email?.trim() || 'Instructor';
}

export default function AssessmentReadinessPage() {
  const params = useParams<{ courseId: string; studentId: string; badgeId: string }>();
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const signOut = useSignOut();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isAssessmentStarted, setIsAssessmentStarted] = useState(false);
  // Two-step flow (issue #119): grade every task, then confirm the outcome.
  const [phase, setPhase] = useState<'grading' | 'confirm'>('grading');
  const [subgoalGroups, setSubgoalGroups] = useState<SubgoalGroupDraft[]>([]);
  // Only used when the computed outcome is a pass: any text here downgrades the
  // student to "still learning" and is sent as the assessor override.
  const [overrideFeedback, setOverrideFeedback] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const courseId = resolveParam(params?.courseId);
  const studentId = resolveParam(params?.studentId);
  const badgeId = resolveParam(params?.badgeId);
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const { profile, badgeDetail, isLoading, error } = useAssessmentReadiness(courseId, studentId, badgeId, email);

  useEffect(() => {
    if (isLoaded && !isSignedIn && !isSigningOut) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, isSigningOut, router]);

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/splash');
    } catch (signOutError) {
      console.error('Failed to sign out', signOutError);
      setIsSigningOut(false);
    }
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    if (profile && badgeDetail) {
      router.push(`/roster/${profile.member.id}?courseId=${profile.course.id}&badgeId=${badgeDetail.badge.id}`);
      return;
    }

    router.push(courseId ? `/courses/${courseId}` : '/');
  };

  const memberDisplay = useMemo(() => getNameForProfile(profile?.member.name), [profile?.member.name]);
  const instructor = profile?.course.createdBy ?? null;
  const sideContact = profile?.contacts.find((contact) => contact.type === 'INSTRUCTOR') ?? instructor;
  const canStartAssessment = badgeDetail?.progress.precheckComplete === true;
  const assessmentComplete = badgeDetail?.progress.assessmentComplete === true;
  const canStartNewAssessment = canStartAssessment && !assessmentComplete;
  const assessmentStatus = badgeDetail?.progress.assessmentComplete ? 'Complete' : 'Incomplete';
  const currentStep = badgeDetail?.progress.currentCheckpoint || (canStartAssessment ? 'Assessment' : 'Precheck');
  const displayName = user?.fullName || profile?.course.createdBy?.name || '';

  useEffect(() => {
    if (!badgeDetail) {
      setSubgoalGroups([]);
      return;
    }

    const rubric = badgeDetail.assessment?.rubric ?? null;

    // Every task starts failed: the assessor affirmatively marks each one the
    // student demonstrated.
    setSubgoalGroups(
      (rubric?.subgoals ?? []).map((subgoal) => ({
        subgoalId: subgoal.id,
        text: subgoal.text,
        passThreshold: subgoal.passThreshold,
        tasks: subgoal.tasks.map((task) => ({
          taskId: task.id,
          text: task.text,
          points: task.points,
          passed: false,
          feedback: '',
        })),
      }))
    );
    setOverrideFeedback('');
    setPhase('grading');
    setIsAssessmentStarted(false);
    setSubmitError(null);
  }, [badgeDetail]);

  const updateTaskDraft = (subgoalId: string, taskId: string, patch: Partial<Omit<TaskDraft, 'taskId'>>) => {
    setSubgoalGroups((current) =>
      current.map((group) =>
        group.subgoalId === subgoalId
          ? { ...group, tasks: group.tasks.map((task) => (task.taskId === taskId ? { ...task, ...patch } : task)) }
          : group
      )
    );
  };

  const rubric = badgeDetail?.assessment?.rubric ?? null;

  // A subgoal passes when its passed tasks' weights meet its threshold; the
  // badge passes only when every subgoal passes.
  const subgoalResults = subgoalGroups.map((group) => {
    const earned = group.tasks.reduce((sum, task) => (task.passed ? sum + task.points : sum), 0);
    const possible = group.tasks.reduce((sum, task) => sum + task.points, 0);
    return { ...group, earned, possible, passed: earned >= group.passThreshold };
  });
  const computedPassed = subgoalResults.every((group) => group.passed);
  const willOverrideToStillLearning = computedPassed && overrideFeedback.trim().length > 0;
  const finalPassed = computedPassed && !willOverrideToStillLearning;

  const submitAssessment = async () => {
    if (!courseId || !studentId || !badgeId || !email) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitStatus(null);

    try {
      const params = new URLSearchParams({ email });
      const response = await fetch(
        `/api/courses/${encodeURIComponent(courseId)}/students/${encodeURIComponent(studentId)}/badges/${encodeURIComponent(
          badgeId
        )}?${params}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            tasks: subgoalGroups.flatMap((group) =>
              group.tasks.map((task) => ({
                taskId: task.taskId,
                passed: task.passed,
                feedback: task.feedback,
              }))
            ),
            override: willOverrideToStillLearning ? { feedback: overrideFeedback.trim() } : null,
          }),
        }
      );
      const payload = await response.json().catch(() => ({
        error: `Request failed: ${response.status}`,
      }));

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to record assessment.');
      }

      setSubmitStatus(finalPassed ? 'Assessment recorded. Badge is ready for finalization.' : 'Assessment recorded.');
      setIsAssessmentStarted(false);
      router.push(`/courses/${courseId}?view=assessor`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to record assessment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <div className={styles.page}>
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={styles.main}>
        <div className={styles.content}>
          <BackButton onClick={handleBack} />

          <header className={styles.header}>
            <h1 className={styles.pageTitle}>{badgeDetail?.badge.name ?? 'Assessment'}</h1>
          </header>

          {isLoading ? <p className={styles.statusMessage}>Loading assessment readiness...</p> : null}
          {!isLoading && error ? <p className={styles.statusMessage}>{error}</p> : null}

          {!isLoading && !error && profile && badgeDetail ? (
            <>
              <StudentProfileCard
                kicker="Student Info:"
                headlineTop={memberDisplay.headlineTop}
                headlineBottom={memberDisplay.headlineBottom}
                email={profile.member.email}
                buid={profile.member.buid}
                avatarSrc={profile.member.avatar ? avatarAsset(profile.member.avatar.base) : null}
                avatarAlt="Student avatar"
                avatarFallback={generateInitials(profile.member.name)}
                courseTitle={profile.course.title}
                courseSectionsLabel={`${profile.course.sections.length > 1 ? 'Sections' : 'Section'}: ${
                  profile.course.sections.join(', ') || 'Not provided'
                }`}
                contactTitle="Instructor"
                contactName={sideContact ? contactDisplayName(sideContact.name, sideContact.email) : null}
                contactEmail={sideContact?.email}
                contactAvatarSrc={sideContact && 'avatarUrl' in sideContact ? sideContact.avatarUrl : null}
                contactAvatarAlt={sideContact ? contactDisplayName(sideContact.name, sideContact.email) : ''}
                contactFallback={
                  sideContact ? generateInitials(contactDisplayName(sideContact.name, sideContact.email)) : ''
                }
                emptyContactMessage="No instructor assigned."
              />

              <section className={styles.detailCard}>
                <div className={styles.detailCardHeader}>
                  <span className={styles.detailCardKicker}>Student Progress for:</span>
                  <span className={styles.detailCardHeading}>{badgeDetail.badge.name}</span>
                </div>

                <div className={styles.readinessBody}>
                  <div className={styles.progressStatusColumn}>
                    <p className={styles.progressStatusLine}>
                      <span className={styles.progressStatusLabel}>Precheck status:</span>{' '}
                      <span className={styles.progressStatusValue}>
                        {badgeDetail.progress.precheckComplete ? 'Complete' : 'Incomplete'}
                      </span>
                    </p>
                    <p className={styles.progressStatusLine}>
                      <span className={styles.progressStatusLabel}>Assessment status:</span>{' '}
                      <span className={styles.progressStatusValue}>{assessmentStatus}</span>
                    </p>
                    <p className={styles.progressStatusLine}>
                      <span className={styles.progressStatusLabel}>Currently at:</span>{' '}
                      <span className={styles.progressStatusValue}>{currentStep}</span>
                    </p>
                  </div>

                  <div className={styles.clearanceRow}>
                    <span className={canStartAssessment ? styles.clearanceSuccess : styles.clearanceBlocked}>
                      {canStartAssessment ? '✓' : '×'}
                    </span>
                    <strong>{canStartAssessment ? 'Cleared for Assessment' : 'Not cleared for Assessment'}</strong>
                  </div>

                  {!canStartAssessment ? (
                    <div className={styles.unablePanel}>
                      <h2>Unable to assess</h2>
                      <p>This student still has the following requirements:</p>
                      <p>
                        Precheck progress: {badgeDetail.progress.completedCheckpoints} of{' '}
                        {badgeDetail.progress.totalCheckpoints} checkpoints complete
                      </p>
                      <p>
                        Please have the student complete the requirement before attempting an in-person assessment. If
                        you think this is a mistake, contact your instructor.
                      </p>
                    </div>
                  ) : null}

                  {canStartNewAssessment && isAssessmentStarted ? (
                    <div className={styles.assessmentPanel}>
                      <div className={styles.assessmentPanelHeader}>
                        <h2>{rubric?.goalName || 'Assessor Grading'}</h2>
                      </div>

                      {/* Instructions guide the assessor while grading, not the outcome
                          review — hide them once the assessor moves to the confirm step
                          so they don't linger over the pass/fail result (bug #177). */}
                      {phase === 'grading' && rubric?.instructions ? (
                        <div className={styles.taInstructions}>
                          <h3 className={styles.taInstructionsTitle}>Instructions for the assessor</h3>
                          {/* Instructions are authored in the badge editor's rich-text field and
                              stored as sanitized HTML; render read-only for the assessor. */}
                          <div
                            className={`${styles.taInstructionsBody} rte-readonly`}
                            dangerouslySetInnerHTML={{ __html: rubric.instructions }}
                          />
                        </div>
                      ) : null}

                      {phase === 'grading' ? (
                        <div className={styles.criteriaList}>
                          {subgoalResults.map((group, groupIndex) => (
                            <div key={group.subgoalId} className={styles.subgoalGroup}>
                              <div className={styles.subgoalGroupHeader}>
                                <h3>
                                  {groupIndex + 1}. {group.text}
                                </h3>
                                <span className={group.passed ? styles.subgoalGroupPass : styles.subgoalGroupFail}>
                                  {group.earned} / {group.possible} pts · pass at {group.passThreshold} ·{' '}
                                  {group.passed ? 'Passed' : 'Not passed'}
                                </span>
                              </div>

                              {group.tasks.map((task, taskIndex) => (
                                <div key={task.taskId} className={styles.criterionCard}>
                                  <div className={styles.criterionHeader}>
                                    <h3>
                                      {groupIndex + 1}.{taskIndex + 1} {task.text}
                                    </h3>
                                    <div className={styles.subgoalControl}>
                                      <span className={styles.subgoalPoints}>
                                        {task.points} {task.points === 1 ? 'pt' : 'pts'}
                                      </span>
                                      <button
                                        type="button"
                                        role="switch"
                                        aria-checked={task.passed}
                                        aria-label={`Task ${groupIndex + 1}.${taskIndex + 1} ${
                                          task.passed ? 'passed' : 'failed'
                                        }`}
                                        className={task.passed ? styles.subgoalSliderOn : styles.subgoalSliderOff}
                                        onClick={() =>
                                          updateTaskDraft(group.subgoalId, task.taskId, { passed: !task.passed })
                                        }
                                      >
                                        <span className={styles.subgoalSliderKnob} aria-hidden="true" />
                                      </button>
                                    </div>
                                  </div>

                                  <label className={styles.criteriaField}>
                                    <span>Feedback (optional)</span>
                                    <textarea
                                      value={task.feedback}
                                      onChange={(event) =>
                                        updateTaskDraft(group.subgoalId, task.taskId, { feedback: event.target.value })
                                      }
                                      rows={2}
                                    />
                                  </label>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={styles.confirmPanel}>
                          {computedPassed ? (
                            <>
                              <p className={finalPassed ? styles.confirmMessagePass : styles.confirmMessageFail}>
                                {finalPassed
                                  ? 'This student has passed the assessment and will be placed into ready to be finalized. If, for any reason, you feel they should be placed into still learning, please clarify below:'
                                  : 'This student will be placed into still learning based on your note below.'}
                              </p>
                              <label className={styles.criteriaField}>
                                <span>Override to still learning (optional)</span>
                                <textarea
                                  value={overrideFeedback}
                                  onChange={(event) => setOverrideFeedback(event.target.value)}
                                  rows={4}
                                  placeholder="Leave blank to pass the student. Add a note to place them into still learning instead."
                                />
                              </label>
                            </>
                          ) : (
                            <p className={styles.confirmMessageFail}>
                              This student has failed the assessment and will be placed into still learning.
                            </p>
                          )}
                        </div>
                      )}

                      {submitError ? <p className={styles.errorText}>{submitError}</p> : null}
                    </div>
                  ) : null}

                  {submitStatus ? <p className={styles.successText}>{submitStatus}</p> : null}
                </div>
              </section>

              <div className={styles.actionRow}>
                <BackButton onClick={handleBack} />
                {isAssessmentStarted && phase === 'confirm' ? (
                  <button
                    type="button"
                    className={styles.toggleButton}
                    onClick={() => setPhase('grading')}
                    disabled={isSubmitting}
                  >
                    Back to grading
                  </button>
                ) : null}
                <button
                  type="button"
                  className={styles.primaryButton}
                  style={
                    isAssessmentStarted && phase === 'confirm'
                      ? { backgroundColor: finalPassed ? '#15803d' : '#b91c1c' }
                      : undefined
                  }
                  disabled={!canStartNewAssessment || isSubmitting}
                  onClick={() => {
                    if (!isAssessmentStarted) {
                      setIsAssessmentStarted(true);
                      setPhase('grading');
                      return;
                    }

                    if (phase === 'grading') {
                      setPhase('confirm');
                      return;
                    }

                    void submitAssessment();
                  }}
                >
                  {assessmentComplete
                    ? 'Assessment complete'
                    : !isAssessmentStarted
                      ? 'Confirm and Start'
                      : phase === 'grading'
                        ? 'Continue to review'
                        : isSubmitting
                          ? 'Recording...'
                          : 'Submit Assessment'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
