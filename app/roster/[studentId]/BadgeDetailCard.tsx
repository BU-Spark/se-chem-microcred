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
    category: string | null;
    status: string;
    awardedAt: string | null;
    score: number | null;
  };
  progress: {
    percentComplete: number;
    precheckComplete: boolean;
    assessmentComplete: boolean;
    currentCheckpoint: string | null;
    totalCheckpoints: number;
    completedCheckpoints: number;
  };
  checkpoints: Array<{
    id: string;
    title: string;
    lessonTitle: string;
    questions: Array<{
      id: string;
      title: string;
      prompt: string;
      attempts: Array<{
        id: string;
        label: string;
        answeredText: string;
        isCorrect: boolean | null;
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
    }>;
  };
};

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
      <div className={styles.progressRingCenter}>{boundedPercent}%</div>
    </div>
  );
}

export function BadgeDetailCard({ detail, tone }: { detail: BadgeDetailResponse; tone: BadgeDetailTone }) {
  const [openCheckpointId, setOpenCheckpointId] = useState<string | null>(detail.checkpoints[0]?.id ?? null);
  const [openQuestionKey, setOpenQuestionKey] = useState<string | null>(() => {
    const firstCheckpoint = detail.checkpoints[0];
    const firstQuestion = firstCheckpoint?.questions[0];
    return firstCheckpoint && firstQuestion ? `${firstCheckpoint.id}:${firstQuestion.id}` : null;
  });
  const [isGradingOpen, setIsGradingOpen] = useState(true);
  const [openAssessmentAttemptId, setOpenAssessmentAttemptId] = useState<string | null>(null);

  useEffect(() => {
    const firstCheckpoint = detail.checkpoints[0];
    const firstQuestion = firstCheckpoint?.questions[0];

    setOpenCheckpointId(firstCheckpoint?.id ?? null);
    setOpenQuestionKey(firstCheckpoint && firstQuestion ? `${firstCheckpoint.id}:${firstQuestion.id}` : null);
    setIsGradingOpen(true);
    setOpenAssessmentAttemptId(null);
  }, [detail]);

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
            <span className={styles.progressStatusValue}>{detail.progress.currentCheckpoint || '--'}</span>
          </p>
        </div>
      </div>

      <div className={styles.detailDivider} />

      {tone === 'completed' ? (
        <div className={styles.detailContent}>
          <section className={styles.detailSection}>
            <h3 className={styles.detailSectionTitle}>Assessment Info</h3>
            <p className={styles.assessmentMeta}>
              Completed on: <strong>{formatDate(detail.assessment.completedOn)}</strong>
            </p>

            <button
              type="button"
              className={styles.subAccordionButton}
              onClick={() => setIsGradingOpen((current) => !current)}
              aria-expanded={isGradingOpen}
            >
              <span>Assessor Grading</span>
              <Chevron isOpen={isGradingOpen} />
            </button>

            {isGradingOpen ? (
              <div className={styles.gradingBox}>
                {detail.assessment.gradingRows.map((row) => (
                  <div key={row.id} className={styles.gradingRow}>
                    <AttemptStatusIcon isCorrect={row.passed} />
                    <p className={styles.gradingTitle}>{row.title}</p>
                    <p className={styles.gradingOutcome}>{row.outcome}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className={styles.detailSection}>
            <h3 className={styles.detailSectionTitle}>Assessment History</h3>
            <p className={styles.assessmentMeta}>
              Number of Attempts: <strong>{detail.assessment.attemptCount}</strong>
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
                          <p className={styles.assessmentAttemptLine}>Completed: {formatDate(attempt.completedAt)}</p>
                          <p className={styles.assessmentAttemptLine}>
                            Outcome: <strong>{attempt.passed === false ? 'Needs reassessment' : 'Passed'}</strong>
                          </p>
                          <p className={styles.assessmentAttemptLine}>
                            Score: {attempt.score != null ? `${attempt.score}%` : 'Not recorded'}
                          </p>
                          {attempt.assessorName ? (
                            <p className={styles.assessmentAttemptLine}>Assessor: {attempt.assessorName}</p>
                          ) : null}
                          {attempt.feedback ? (
                            <p className={styles.assessmentAttemptFeedback}>{attempt.feedback}</p>
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
        </div>
      ) : (
        <section className={styles.detailSection}>
          <h3 className={styles.detailSectionTitle}>Answer History</h3>

          {detail.checkpoints.length === 0 ? (
            <p className={styles.emptyState}>No checkpoint history recorded yet.</p>
          ) : (
            <div className={styles.checkpointList}>
              {detail.checkpoints.map((checkpoint) => {
                const isCheckpointOpen = openCheckpointId === checkpoint.id;

                return (
                  <div key={checkpoint.id} className={styles.checkpointBlock}>
                    <button
                      type="button"
                      className={styles.checkpointButton}
                      onClick={() =>
                        setOpenCheckpointId((current) => (current === checkpoint.id ? null : checkpoint.id))
                      }
                      aria-expanded={isCheckpointOpen}
                    >
                      <span>{checkpoint.title}</span>
                      <Chevron isOpen={isCheckpointOpen} />
                    </button>

                    {isCheckpointOpen ? (
                      <div className={styles.checkpointQuestions}>
                        {checkpoint.questions.map((question) => {
                          const questionKey = `${checkpoint.id}:${question.id}`;
                          const isQuestionOpen = openQuestionKey === questionKey;

                          return (
                            <div key={question.id} className={styles.questionBlock}>
                              <button
                                type="button"
                                className={styles.questionButton}
                                onClick={() =>
                                  setOpenQuestionKey((current) => (current === questionKey ? null : questionKey))
                                }
                                aria-expanded={isQuestionOpen}
                              >
                                <span>{question.title}</span>
                                <Chevron isOpen={isQuestionOpen} />
                              </button>

                              {isQuestionOpen ? (
                                <div className={styles.questionPanel}>
                                  <p className={styles.questionPrompt}>{question.prompt}</p>

                                  {question.attempts.length > 0 ? (
                                    <div className={styles.answerCard}>
                                      {question.attempts.map((attempt) => (
                                        <div key={attempt.id} className={styles.answerRow}>
                                          <AttemptStatusIcon isCorrect={attempt.isCorrect} />
                                          <span className={styles.answerAttemptLabel}>{attempt.label}</span>
                                          <span className={styles.answerAttemptValue}>
                                            Answered: {attempt.answeredText}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className={styles.emptyState}>No attempts recorded for this question yet.</p>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
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
