'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import { generateInitials, getNameForProfile } from '@/lib/text/name';

import Image from 'next/image';

import Sidebar, { SIDEBAR_NAV } from '@/app/components/Navigation/Sidebar';
import BackButton from '@/app/components/BackButton/BackButton';
import RubricPreview from '@/app/components/Rubric/RubricPreview';
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
  // Three-step flow: preview the rubric (issue #195), grade every task, then
  // confirm the outcome (issue #119).
  const [phase, setPhase] = useState<'overview' | 'grading' | 'confirm'>('overview');
  const [subgoalGroups, setSubgoalGroups] = useState<SubgoalGroupDraft[]>([]);
  // Only used when the computed outcome is a pass: any text here downgrades the
  // student to "still learning" and is sent as the checker override.
  const [overrideFeedback, setOverrideFeedback] = useState('');
  // Per-task feedback is optional and noisy when always visible, so each box is
  // collapsed until the checker opens it (issue #179).
  const [openFeedbackTaskIds, setOpenFeedbackTaskIds] = useState<string[]>([]);
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

  const memberDisplay = useMemo(() => getNameForProfile(profile?.member), [profile?.member]);
  const instructor = profile?.course.createdBy ?? null;
  const sideContact = profile?.contacts.find((contact) => contact.type === 'INSTRUCTOR') ?? instructor;
  const canStartAssessment = badgeDetail?.progress.precheckComplete === true;
  const assessmentComplete = badgeDetail?.progress.assessmentComplete === true;
  const canAssess = badgeDetail?.progress.canAssess === true;
  const awaitingStudentReview = badgeDetail?.progress.awaitingStudentReview === true;
  const canStartNewAssessment = canStartAssessment && !assessmentComplete && canAssess;
  const isAssessmentStarted = phase !== 'overview';
  const assessmentStatus = badgeDetail?.progress.assessmentComplete ? 'Complete' : 'Incomplete';
  const currentStep = badgeDetail?.progress.currentCheckpoint || (canStartAssessment ? 'Assessment' : 'Precheck');
  const displayName = user?.fullName || profile?.course.createdBy?.name || '';

  useEffect(() => {
    if (!badgeDetail) {
      setSubgoalGroups([]);
      return;
    }

    const rubric = badgeDetail.assessment?.rubric ?? null;

    // Every task starts failed: the checker affirmatively marks each one the
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
    setPhase('overview');
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

  const toggleTaskFeedback = (taskId: string) => {
    setOpenFeedbackTaskIds((current) =>
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]
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

  // The checker flow renders the authored rubric layout, so the drafts are
  // reshaped into its subgoal/task form and looked up by id from the slots.
  const rubricSubgoals = subgoalResults.map((group) => ({
    id: group.subgoalId,
    text: group.text,
    passThreshold: group.passThreshold,
    tasks: group.tasks.map((task) => ({ id: task.taskId, text: task.text, points: task.points })),
  }));
  const resultBySubgoalId = new Map(subgoalResults.map((group) => [group.subgoalId, group]));
  const taskDraftById = new Map(
    subgoalGroups.flatMap((group) => group.tasks.map((task) => [task.taskId, task] as const))
  );

  const renderSubgoalTally = (subgoalId: string) => {
    const group = resultBySubgoalId.get(subgoalId);
    if (!group) return null;

    return (
      <span className={group.passed ? styles.subgoalGroupPass : styles.subgoalGroupFail}>
        {group.earned} / {group.possible} pts · pass at {group.passThreshold} · {group.passed ? 'Passed' : 'Not passed'}
      </span>
    );
  };

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
      setPhase('overview');
      router.push(`/courses/${courseId}?view=checker`);
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
            <h1 className="page-heading">{badgeDetail?.badge.name ?? 'Assessment'}</h1>
          </header>

          {isLoading ? <p className={styles.statusMessage}>Loading assessment readiness...</p> : null}
          {!isLoading && error ? <p className={styles.statusMessage}>{error}</p> : null}

          {!isLoading && !error && profile && badgeDetail ? (
            <div className={styles.assessmentLayout}>
              <section className={styles.assessmentColumn}>
                <div className={styles.readinessBody}>
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

                  {canStartAssessment && !canAssess && !assessmentComplete ? (
                    <div className={styles.unablePanel}>
                      <h2>{awaitingStudentReview ? 'Waiting on the student' : 'Unable to assess'}</h2>
                      {awaitingStudentReview ? (
                        <>
                          <p>
                            This badge has already been assessed and the result is with the student. They need to review
                            the feedback before another assessment can be recorded.
                          </p>
                          <p>
                            If the result was recorded in error, an instructor can correct it from the student&apos;s
                            roster page rather than assessing again.
                          </p>
                        </>
                      ) : (
                        <p>
                          This badge is not open for assessment right now. If you think this is a mistake, contact your
                          instructor.
                        </p>
                      )}
                    </div>
                  ) : null}

                  {/* Checkers used to land straight in the rubric with no sense of
                      what the assessment covers; this read-only preview runs before
                      grading starts (issue #195). */}
                  {canStartNewAssessment && phase === 'overview' ? (
                    <div className={styles.overviewStack}>
                      <div className={styles.taInstructions}>
                        <h3 className={styles.taInstructionsTitle}>How this assessment works</h3>
                        <ol className={styles.processSteps}>
                          <li>Mark each task below as passed or failed, adding feedback where it helps the student.</li>
                          <li>Continue to review to check the outcome and everything you recorded.</li>
                          <li>Submit the assessment to save the result to the student&apos;s badge.</li>
                        </ol>
                      </div>

                      {/* Same layout the instructor authored the rubric in, read-only. */}
                      <RubricPreview
                        goalName={rubric?.goalName}
                        subgoals={rubric?.subgoals ?? []}
                        instructions={rubric?.instructions}
                        instructionsTitle="Instructions for the checker"
                        subgoalsLabel="Assessment rubric overview"
                      />
                    </div>
                  ) : null}

                  {canStartNewAssessment && isAssessmentStarted ? (
                    <div className={styles.overviewStack}>
                      {phase === 'grading' ? (
                        <RubricPreview
                          goalName={rubric?.goalName}
                          subgoals={rubricSubgoals}
                          instructions={rubric?.instructions}
                          instructionsTitle="Instructions for the checker"
                          subgoalsLabel="Assessment rubric grading"
                          columnHint="Mark each task the student demonstrated. Add feedback wherever it helps them."
                          renderSubgoalStatus={(subgoal) => renderSubgoalTally(subgoal.id)}
                          renderTaskControl={({ subgoal, task, subgoalIndex, taskIndex }) => {
                            const draft = taskDraftById.get(task.id);
                            const passed = draft?.passed ?? false;

                            return (
                              <button
                                type="button"
                                role="switch"
                                aria-checked={passed}
                                aria-label={`Task ${subgoalIndex + 1}.${taskIndex + 1} ${passed ? 'passed' : 'failed'}`}
                                className={passed ? styles.subgoalSliderOn : styles.subgoalSliderOff}
                                onClick={() => updateTaskDraft(subgoal.id, task.id, { passed: !passed })}
                              >
                                <span className={styles.subgoalSliderKnob} aria-hidden="true" />
                              </button>
                            );
                          }}
                          renderTaskFooter={({ subgoal, task, subgoalIndex, taskIndex }) => {
                            const draft = taskDraftById.get(task.id);
                            const isOpen = openFeedbackTaskIds.includes(task.id);

                            return (
                              <>
                                <button
                                  type="button"
                                  className={styles.feedbackToggle}
                                  aria-expanded={isOpen}
                                  aria-controls={`feedback-${task.id}`}
                                  onClick={() => toggleTaskFeedback(task.id)}
                                >
                                  <span
                                    className={isOpen ? styles.feedbackChevronOpen : styles.feedbackChevron}
                                    aria-hidden="true"
                                  >
                                    ›
                                  </span>
                                  <span>Feedback (optional)</span>
                                </button>

                                {isOpen ? (
                                  <label className={styles.criteriaField} id={`feedback-${task.id}`}>
                                    <span className={styles.visuallyHidden}>
                                      Feedback for task {subgoalIndex + 1}.{taskIndex + 1} (optional)
                                    </span>
                                    <textarea
                                      value={draft?.feedback ?? ''}
                                      onChange={(event) =>
                                        updateTaskDraft(subgoal.id, task.id, { feedback: event.target.value })
                                      }
                                      rows={2}
                                      autoFocus
                                    />
                                  </label>
                                ) : null}
                              </>
                            );
                          }}
                        />
                      ) : (
                        <div className={styles.confirmPanel}>
                          {/* Review step shows everything the checker recorded rather
                              than just the verdict (issue #195). Instructions stay
                              hidden here so they don't linger over the result (#177). */}
                          <RubricPreview
                            goalName={rubric?.goalName}
                            subgoals={rubricSubgoals}
                            showInstructions={false}
                            subgoalsLabel="Results by task"
                            columnHint={null}
                            renderSubgoalStatus={(subgoal) => renderSubgoalTally(subgoal.id)}
                            renderTaskControl={({ task }) => {
                              const passed = taskDraftById.get(task.id)?.passed ?? false;

                              return (
                                <span className={passed ? styles.taskResultPass : styles.taskResultFail}>
                                  {passed ? 'Passed' : 'Not passed'}
                                </span>
                              );
                            }}
                            renderTaskFooter={({ task }) => {
                              const feedback = taskDraftById.get(task.id)?.feedback ?? '';

                              return feedback.trim() ? (
                                <p className={styles.taskResultFeedback}>Feedback: {feedback}</p>
                              ) : null;
                            }}
                          />

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

                <div className={styles.actionRow}>
                  <BackButton onClick={handleBack} />
                  {phase === 'confirm' ? (
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
                      phase === 'confirm'
                        ? finalPassed
                          ? // Checkd Green needs black text — white on it is 1.6:1.
                            { backgroundColor: 'var(--checkd-green)', color: 'var(--checkd-black)' }
                          : { backgroundColor: '#b91c1c', color: 'var(--checkd-white)' }
                        : undefined
                    }
                    disabled={!canStartNewAssessment || isSubmitting}
                    onClick={() => {
                      if (phase === 'overview') {
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
                      : phase === 'overview'
                        ? 'Confirm and Start'
                        : phase === 'grading'
                          ? 'Continue to review'
                          : isSubmitting
                            ? 'Recording...'
                            : 'Submit Assessment'}
                  </button>
                </div>
              </section>

              {/* Student context lives in a compact rail so the assessment itself
                  owns the page (previously a full-width profile card on top). */}
              <aside className={styles.studentRail} aria-label="Student information">
                <div className={styles.studentIdentity}>
                  <div className={styles.studentAvatar}>
                    {profile.member.avatar ? (
                      <Image
                        src={avatarAsset(profile.member.avatar.base)}
                        alt="Student avatar"
                        width={56}
                        height={56}
                      />
                    ) : (
                      <span className={styles.studentAvatarFallback}>{generateInitials(profile.member)}</span>
                    )}
                  </div>
                  <div>
                    <p className={styles.studentName}>
                      {memberDisplay.headlineTop} {memberDisplay.headlineBottom}
                    </p>
                    <p className={styles.railMeta}>{profile.member.email || 'No email on file'}</p>
                  </div>
                </div>

                <div className={styles.railSection}>
                  <p className={styles.railTitle}>Student ID</p>
                  <p className={styles.railMeta}>{profile.member.externalId || 'Not provided'}</p>
                </div>

                <div className={styles.railSection}>
                  <p className={styles.railTitle}>Course</p>
                  <p className={styles.railMeta}>
                    {profile.course.title}
                    <br />
                    {`${profile.course.sections.length > 1 ? 'Sections' : 'Section'}: ${
                      profile.course.sections.join(', ') || 'Not provided'
                    }`}
                  </p>
                </div>

                <div className={styles.railSection}>
                  <p className={styles.railTitle}>Instructor</p>
                  {sideContact ? (
                    <p className={styles.railMeta}>
                      {contactDisplayName(sideContact.name, sideContact.email)}
                      <br />
                      {sideContact.email || 'Not provided'}
                    </p>
                  ) : (
                    <p className={styles.railMeta}>No instructor assigned.</p>
                  )}
                </div>

                <div className={styles.railSection}>
                  <p className={styles.railTitle}>Progress for {badgeDetail.badge.name}</p>
                  <p className={styles.railMeta}>
                    <span className={styles.railLabel}>Precheck:</span>{' '}
                    {badgeDetail.progress.precheckComplete ? 'Complete' : 'Incomplete'}
                    <br />
                    <span className={styles.railLabel}>Assessment:</span> {assessmentStatus}
                    <br />
                    <span className={styles.railLabel}>Currently at:</span> {currentStep}
                  </p>
                  <p className={canStartAssessment ? styles.railClearanceOk : styles.railClearanceBlocked}>
                    {canStartAssessment ? '✓ Cleared for Assessment' : '× Not cleared for Assessment'}
                  </p>
                </div>
              </aside>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
