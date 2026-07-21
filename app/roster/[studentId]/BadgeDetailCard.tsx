'use client';

import { useEffect, useState } from 'react';

import styles from './page.module.css';

export type BadgeDetailTone = 'progress' | 'completed';

export type BadgeDetailResponse = {
  badge: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    status: string;
    awardedAt: string | null;
    score: number | null;
    cooldownUntil?: string | null;
    reassessmentLimit?: number | null;
    cooldownDays?: number | null;
    reassessmentRequired?: boolean | null;
    allowCooldownOverride?: boolean;
  };
  progress: {
    percentComplete: number;
    precheckComplete: boolean;
    assessmentComplete: boolean;
    currentCheckpoint: string | null;
    totalCheckpoints: number;
    completedCheckpoints: number;
  };
  // Legacy flat checkpoint view — superseded by qevAttempts (kept for back-compat).
  checkpoints?: Array<{
    id: string;
    title: string;
    lessonTitle: string;
    questions: Array<{ id: string; title: string; prompt: string; attempts: unknown[] }>;
  }>;
  // Precheck (QEV) answers grouped by watch-through (run), like the in-person attempts.
  qevAttempts: Array<{
    id: string;
    label: string;
    lessonTitle: string;
    passed: boolean | null;
    gradePercent: number | null;
    correctAnswers: number | null;
    totalQuestions: number | null;
    completedAt: string | null;
    inProgress: boolean;
    checkpoints: Array<{
      id: string;
      title: string;
      timeCompleted: string | null;
      questions: Array<{
        id: string;
        title: string;
        prompt: string | null;
        answers: Array<{ answeredText: string; isCorrect: boolean | null }>;
      }>;
    }>;
  }>;
  assessment: {
    completedOn: string | null;
    attemptCount: number;
    gradingRows: Array<{
      id: string;
      title: string;
      outcome: string;
      passed: boolean;
    }>;
    attempts: Array<{
      id: string;
      label: string;
      score: number | null;
      completedAt: string | null;
      passed?: boolean;
      feedback?: string | null;
      assessorName?: string | null;
      responses?: Array<{
        id: string;
        title: string;
        points: number;
        passed: boolean;
        feedback?: string | null;
        isOverride: boolean;
      }>;
    }>;
  };
};

const ORDINAL_SUFFIXES = ['th', 'st', 'nd', 'rd'];
function ordinal(n: number) {
  const v = n % 100;
  return `${n}${ORDINAL_SUFFIXES[(v - 20) % 10] ?? ORDINAL_SUFFIXES[v] ?? ORDINAL_SUFFIXES[0]}`;
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Not available';
  }

  return parsed.toLocaleDateString();
}

// Time-of-day first, then date — used for "when an answer/attempt happened".
function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Not available';
  }

  const time = parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${time} · ${parsed.toLocaleDateString()}`;
}

function Chevron({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="18"
      height="18"
      aria-hidden="true"
      className={[styles.chevron, isOpen ? styles.chevronOpen : ''].join(' ')}
    >
      <path
        d="M3 6.25 8 11l5-4.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AttemptStatusIcon({ isCorrect }: { isCorrect: boolean | null }) {
  const className = [
    styles.attemptStatusIcon,
    isCorrect === true
      ? styles.attemptStatusIconSuccess
      : isCorrect === false
        ? styles.attemptStatusIconFailure
        : styles.attemptStatusIconNeutral,
  ].join(' ');

  return (
    <span className={className} aria-hidden="true">
      {isCorrect === true ? '✓' : isCorrect === false ? '×' : '•'}
    </span>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const boundedPercent = Math.min(100, Math.max(0, percent));
  const dashOffset = circumference - (boundedPercent / 100) * circumference;

  return (
    <div className={styles.progressRing}>
      <svg viewBox="0 0 140 140" className={styles.progressRingSvg} aria-hidden="true">
        <circle cx="70" cy="70" r={radius} className={styles.progressRingTrack} />
        <circle
          cx="70"
          cy="70"
          r={radius}
          className={styles.progressRingValue}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: dashOffset,
          }}
        />
      </svg>
      <div className={styles.progressRingCenter}>
        <span className={styles.progressRingNumber}>{boundedPercent}</span>
        <span className={styles.progressRingPercent}>%</span>
      </div>
    </div>
  );
}

export function BadgeDetailCard({ detail, tone }: { detail: BadgeDetailResponse; tone: BadgeDetailTone }) {
  const [activeTab, setActiveTab] = useState<'assessment' | 'precheck'>(
    tone === 'completed' ? 'assessment' : 'precheck'
  );
  const [openAssessmentAttemptId, setOpenAssessmentAttemptId] = useState<string | null>(null);
  const latestRunId = detail.qevAttempts.at(-1)?.id ?? null;
  const [openRunId, setOpenRunId] = useState<string | null>(latestRunId);
  const [openRunCheckpointKey, setOpenRunCheckpointKey] = useState<string | null>(null);

  useEffect(() => {
    setOpenAssessmentAttemptId(null);
    const latestRun = detail.qevAttempts.at(-1) ?? null;
    setOpenRunId(latestRun?.id ?? null);
    const firstCheckpoint = latestRun?.checkpoints[0];
    setOpenRunCheckpointKey(latestRun && firstCheckpoint ? `${latestRun.id}:${firstCheckpoint.id}` : null);
  }, [detail]);

  // "Currently at": before precheck is cleared, the current checkpoint; after,
  // the in-person attempt state (e.g. "1st attempt: still learning").
  const latestAssessment = detail.assessment.attempts.at(-1) ?? null;
  const currentlyAt = detail.progress.precheckComplete
    ? detail.assessment.attemptCount > 0
      ? `${ordinal(detail.assessment.attemptCount)} attempt: ${latestAssessment?.passed ? 'proficient' : 'still learning'}`
      : 'Not yet assessed'
    : detail.progress.currentCheckpoint || '--';

  return (
    <section className={styles.detailCard}>
      <div className={styles.detailCardHeader}>
        <span className={styles.detailCardKicker}>Student Progress for:</span>
        <span className={styles.detailCardHeading}>{detail.badge.name}</span>
        <Chevron isOpen={false} />
      </div>

      <div className={styles.detailSummary}>
        <div className={styles.progressSummaryColumn}>
          <ProgressRing percent={detail.progress.percentComplete} />
          <p className={styles.progressSummaryCaption}>Complete with precheck</p>
        </div>

        <div className={styles.progressStatusColumn}>
          <p className={styles.progressStatusLine}>
            <span className={styles.progressStatusLabel}>Precheck status:</span>{' '}
            <span className={styles.progressStatusValue}>
              {detail.progress.precheckComplete ? 'Complete' : 'Incomplete'}
            </span>
          </p>
          <p className={styles.progressStatusLine}>
            <span className={styles.progressStatusLabel}>Assessment status:</span>{' '}
            <span className={styles.progressStatusValue}>
              {detail.progress.assessmentComplete ? 'Complete' : 'Incomplete'}
            </span>
          </p>
          <p className={styles.progressStatusLine}>
            <span className={styles.progressStatusLabel}>Currently at:</span>{' '}
            <span className={styles.progressStatusValue}>{currentlyAt}</span>
          </p>
        </div>
      </div>

      <div className={styles.detailDivider} />

      <div className={styles.detailTabs} role="tablist" aria-label="Badge detail history">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'assessment'}
          className={[styles.detailTab, activeTab === 'assessment' ? styles.detailTabActive : ''].join(' ')}
          onClick={() => setActiveTab('assessment')}
        >
          Assessment history
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'precheck'}
          className={[styles.detailTab, activeTab === 'precheck' ? styles.detailTabActive : ''].join(' ')}
          onClick={() => setActiveTab('precheck')}
        >
          Precheck answer history
        </button>
      </div>

      {activeTab === 'assessment' ? (
        <section className={styles.detailSection}>
          <p className={styles.assessmentMeta}>
            Completed on: <strong>{formatDate(detail.assessment.completedOn)}</strong> · Number of attempts:{' '}
            <strong>{detail.assessment.attemptCount}</strong>
          </p>

          {detail.assessment.attempts.length > 0 ? (
            <div className={styles.assessmentAttemptList}>
              {detail.assessment.attempts.map((attempt) => {
                const isOpen = openAssessmentAttemptId === attempt.id;

                return (
                  <div key={attempt.id} className={styles.assessmentAttemptItem}>
                    <button
                      type="button"
                      className={styles.assessmentAttemptButton}
                      onClick={() =>
                        setOpenAssessmentAttemptId((current) => (current === attempt.id ? null : attempt.id))
                      }
                      aria-expanded={isOpen}
                    >
                      <span>{attempt.label}</span>
                      <Chevron isOpen={isOpen} />
                    </button>

                    {isOpen ? (
                      <div className={styles.assessmentAttemptPanel}>
                        <p className={styles.assessmentAttemptLine}>Time: {formatDateTime(attempt.completedAt)}</p>
                        <p className={styles.assessmentAttemptLine}>
                          Checker: {attempt.assessorName || 'Not recorded'}
                        </p>
                        <p className={styles.assessmentAttemptLine}>
                          Assessment result:{' '}
                          <strong>{attempt.passed === false ? 'still learning' : 'proficient'}</strong>
                        </p>
                        <p className={styles.assessmentAttemptLine}>
                          Score: {attempt.score != null ? `${attempt.score}%` : 'Not recorded'}
                        </p>
                        {attempt.feedback ? (
                          <p className={styles.assessmentAttemptFeedback}>{attempt.feedback}</p>
                        ) : null}
                        {attempt.responses && attempt.responses.length > 0 ? (
                          <div className={styles.gradingBox}>
                            {attempt.responses.map((row) => (
                              <div key={row.id} className={styles.gradingRow}>
                                <AttemptStatusIcon isCorrect={row.passed} />
                                <p className={styles.gradingTitle}>{row.title}</p>
                                <p className={styles.gradingOutcome}>
                                  {row.feedback ||
                                    (row.isOverride
                                      ? 'Overridden to still learning'
                                      : row.passed
                                        ? `Passed (+${row.points} ${row.points === 1 ? 'pt' : 'pts'})`
                                        : 'Not passed')}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={styles.emptyState}>No assessment attempts recorded yet.</p>
          )}
        </section>
      ) : (
        <section className={styles.detailSection}>
          <h3 className={styles.detailSectionTitle}>Precheck answer history</h3>

          {detail.qevAttempts.length === 0 ? (
            <p className={styles.emptyState}>No precheck attempts recorded yet.</p>
          ) : (
            <div className={styles.assessmentAttemptList}>
              {detail.qevAttempts.map((run) => {
                const isRunOpen = openRunId === run.id;
                const resultLabel = run.inProgress
                  ? 'In progress'
                  : run.passed
                    ? `Passed${run.gradePercent != null ? ` · ${run.gradePercent}%` : ''}`
                    : `Did not pass${run.gradePercent != null ? ` · ${run.gradePercent}%` : ''}`;

                return (
                  <div key={run.id} className={styles.assessmentAttemptItem}>
                    <button
                      type="button"
                      className={styles.assessmentAttemptButton}
                      onClick={() => setOpenRunId((current) => (current === run.id ? null : run.id))}
                      aria-expanded={isRunOpen}
                    >
                      <span>
                        {run.label} — {resultLabel}
                      </span>
                      <Chevron isOpen={isRunOpen} />
                    </button>

                    {isRunOpen ? (
                      <div className={styles.assessmentAttemptPanel}>
                        {run.completedAt ? (
                          <p className={styles.assessmentAttemptLine}>Completed: {formatDateTime(run.completedAt)}</p>
                        ) : null}
                        {run.checkpoints.length === 0 ? (
                          <p className={styles.emptyState}>No checkpoint answers recorded for this attempt.</p>
                        ) : (
                          <div className={styles.checkpointList}>
                            {run.checkpoints.map((checkpoint) => {
                              const checkpointKey = `${run.id}:${checkpoint.id}`;
                              const isCheckpointOpen = openRunCheckpointKey === checkpointKey;

                              return (
                                <div key={checkpoint.id} className={styles.checkpointBlock}>
                                  <button
                                    type="button"
                                    className={styles.checkpointButton}
                                    onClick={() =>
                                      setOpenRunCheckpointKey((current) =>
                                        current === checkpointKey ? null : checkpointKey
                                      )
                                    }
                                    aria-expanded={isCheckpointOpen}
                                  >
                                    <span>{checkpoint.title}</span>
                                    <Chevron isOpen={isCheckpointOpen} />
                                  </button>

                                  {isCheckpointOpen ? (
                                    <div className={styles.checkpointQuestions}>
                                      {checkpoint.timeCompleted ? (
                                        <p className={styles.assessmentAttemptLine}>
                                          Time completed: {formatDateTime(checkpoint.timeCompleted)}
                                        </p>
                                      ) : null}
                                      {checkpoint.questions.map((question) => (
                                        <div key={question.id} className={styles.questionBlock}>
                                          <p className={styles.questionPrompt}>{question.prompt || question.title}</p>
                                          <div className={styles.answerCard}>
                                            {question.answers.map((answer, answerIndex) => (
                                              <div key={answerIndex} className={styles.answerRow}>
                                                <AttemptStatusIcon isCorrect={answer.isCorrect} />
                                                <span className={styles.answerAttemptValue}>
                                                  Answered: {answer.answeredText}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
