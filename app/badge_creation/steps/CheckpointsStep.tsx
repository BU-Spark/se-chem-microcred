'use client';

import { useState } from 'react';
import RichTextEditor from '@/app/components/RichText/RichTextEditor';

import AutoGrowTextarea from '../components/AutoGrowTextarea';
import QuestionModal from '../components/QuestionModal';
import VideoCheckpointPlayer from '../components/VideoCheckpointPlayer';
import { parseTimecodeToSeconds } from '../lib/badge-helpers';
import styles from '../page.module.css';
import type { BadgeDraft, CheckpointDraft, CheckpointQuestionDraft } from '../types';

export default function CheckpointsStep({
  draft,
  videoId,
  videoThumbnail,
  updatePassingPercent,
  addCheckpoint,
  removeCheckpoint,
  updateCheckpoint,
  updateCheckpointQuestion,
  updateCheckpointQuestionOption,
  toggleCheckpointQuestionCorrectOption,
  addCheckpointQuestion,
  removeCheckpointQuestion,
  addCheckpointQuestionOption,
  removeCheckpointQuestionOption,
}: {
  draft: BadgeDraft;
  videoId: string | null;
  videoThumbnail: string | null;
  updatePassingPercent: (value: number) => void;
  addCheckpoint: (atSeconds?: number) => string;
  removeCheckpoint: (checkpointId: string) => void;
  updateCheckpoint: <K extends keyof CheckpointDraft>(
    checkpointId: string,
    field: K,
    value: CheckpointDraft[K]
  ) => void;
  updateCheckpointQuestion: <K extends keyof CheckpointQuestionDraft>(
    checkpointId: string,
    questionId: string,
    field: K,
    value: CheckpointQuestionDraft[K]
  ) => void;
  updateCheckpointQuestionOption: (
    checkpointId: string,
    questionId: string,
    optionIndex: number,
    value: string
  ) => void;
  toggleCheckpointQuestionCorrectOption: (checkpointId: string, questionId: string, optionIndex: number) => void;
  addCheckpointQuestion: (checkpointId: string) => void;
  removeCheckpointQuestion: (checkpointId: string, questionId: string) => void;
  addCheckpointQuestionOption: (checkpointId: string, questionId: string) => void;
  removeCheckpointQuestionOption: (checkpointId: string, questionId: string, optionIndex: number) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedCheckpoint = draft.checkpoints.find((checkpoint) => checkpoint.id === selectedId) ?? null;
  const checkpointTimes = draft.checkpoints.map((checkpoint) => parseTimecodeToSeconds(checkpoint.time));

  const handleAddAtTime = (seconds: number) => {
    const newId = addCheckpoint(seconds);
    setSelectedId(newId);
  };

  const handleRemove = (checkpointId: string) => {
    removeCheckpoint(checkpointId);
    if (checkpointId === selectedId) setSelectedId(null);
  };

  return (
    <div className={styles.checkpointLayout}>
      <div className={styles.cpRail}>
        <div className={styles.cpRailLine} aria-hidden="true" />
        {draft.checkpoints.map((checkpoint, index) => (
          <div key={checkpoint.id} className={styles.cpRailGroup}>
            <div className={styles.cpSegmentRow}>
              <div className={styles.cpSegmentLabel}>
                <span>Segment {index + 1}</span>
                <span>Starts {checkpoint.time}</span>
              </div>
              <div
                className={styles.cpSegmentThumb}
                style={videoThumbnail ? { backgroundImage: `url(${videoThumbnail})` } : undefined}
              />
            </div>
            <div className={styles.cpCheckpointRow}>
              <div className={styles.cpCheckpointLabel}>
                <span>{checkpoint.title}</span>
                <span>{checkpoint.points} points</span>
              </div>
              <button
                type="button"
                className={styles.cpCheckpointNode}
                onClick={() => setSelectedId(checkpoint.id)}
                aria-label={`Edit ${checkpoint.title}`}
              />
            </div>
          </div>
        ))}
        {/* Checkpoints are normally placed via the video "+"; this fallback keeps
            adding possible before a video is loaded so the step is never a dead end. */}
        {!videoId && (
          <button type="button" className={styles.cpRailAdd} onClick={() => handleAddAtTime(0)}>
            + Add checkpoint
          </button>
        )}
      </div>

      <div className={styles.checkpointMain}>
        <label className={styles.fieldStack}>
          <span>Passing threshold (%)</span>
          <input
            className={styles.textField}
            type="number"
            min={0}
            max={100}
            step={1}
            value={draft.passingPercent}
            aria-label="Lesson passing threshold percent"
            onChange={(event) =>
              updatePassingPercent(Math.min(100, Math.max(0, Math.round(Number(event.target.value) || 0))))
            }
          />
        </label>

        <VideoCheckpointPlayer
          videoId={videoId}
          title={draft.videoTitle || 'Lesson video'}
          checkpointTimes={checkpointTimes}
          onAddCheckpoint={handleAddAtTime}
        />
      </div>

      {selectedCheckpoint && (
        <QuestionModal title={selectedCheckpoint.title} onClose={() => setSelectedId(null)}>
          <div className={styles.checkpointEditor}>
            <div className={styles.cpMetaGrid}>
              <label className={styles.cpField}>
                <span className={styles.cpFieldLabel}>Timestamp</span>
                <input
                  className={styles.cpInput}
                  value={selectedCheckpoint.time}
                  onChange={(event) => updateCheckpoint(selectedCheckpoint.id, 'time', event.target.value)}
                />
              </label>

              <label className={styles.cpField}>
                <span className={styles.cpFieldLabel}>Points</span>
                <input
                  className={styles.cpInput}
                  type="number"
                  min={1}
                  value={selectedCheckpoint.points}
                  onChange={(event) =>
                    updateCheckpoint(selectedCheckpoint.id, 'points', Number(event.target.value) || 1)
                  }
                />
              </label>
            </div>

            <div className={styles.cpQuestionList}>
              {selectedCheckpoint.questions.map((question, questionIndex) => (
                <div key={question.id} className={styles.cpQuestionRow}>
                  <section className={styles.cpCard}>
                    <div className={styles.cpCardHeader}>
                      <h3 className={styles.cpQuestionTitle}>Question {questionIndex + 1}</h3>
                      {selectedCheckpoint.questions.length > 1 && (
                        <button
                          type="button"
                          className={styles.cpRemoveQuestion}
                          onClick={() => removeCheckpointQuestion(selectedCheckpoint.id, question.id)}
                        >
                          Remove question
                        </button>
                      )}
                    </div>

                    <div className={styles.cpField}>
                      <span className={styles.cpFieldLabel}>Question prompt</span>
                      <div className={styles.cpPrompt}>
                        <RichTextEditor
                          key={question.id}
                          namespace={`CheckpointQuestion-${selectedCheckpoint.id}-${question.id}`}
                          toolbar="inline"
                          ariaLabel={`Question ${questionIndex + 1} prompt`}
                          placeholder="Enter the question prompt…"
                          initialHTML={question.question}
                          onChange={(html) =>
                            updateCheckpointQuestion(selectedCheckpoint.id, question.id, 'question', html)
                          }
                        />
                      </div>
                    </div>
                  </section>

                  <section className={styles.cpCard}>
                    <label className={styles.cpField}>
                      <span className={styles.cpFieldLabel}>Question type</span>
                      <select
                        aria-label={`${selectedCheckpoint.title} question ${questionIndex + 1} type`}
                        className={styles.cpSelect}
                        value={question.questionType}
                        onChange={(event) =>
                          updateCheckpointQuestion(
                            selectedCheckpoint.id,
                            question.id,
                            'questionType',
                            event.target.value as CheckpointQuestionDraft['questionType']
                          )
                        }
                      >
                        <option value="multipleChoice">Multiple choice</option>
                        <option value="shortAnswer">Short answer number</option>
                      </select>
                    </label>

                    <div className={styles.cpDivider} aria-hidden="true" />

                    {question.questionType === 'multipleChoice' ? (
                      <div className={styles.cpChoiceList}>
                        {question.options.map((option, optionIndex) => (
                          <div key={`${question.id}-option-${optionIndex}`} className={styles.cpChoiceRow}>
                            <input
                              type="checkbox"
                              className={styles.cpCheckbox}
                              checked={question.correctIndices.includes(optionIndex)}
                              onChange={() =>
                                toggleCheckpointQuestionCorrectOption(selectedCheckpoint.id, question.id, optionIndex)
                              }
                              aria-label={`Question ${questionIndex + 1} choice ${optionIndex + 1} is correct`}
                            />
                            <AutoGrowTextarea
                              className={`${styles.cpInput} ${styles.cpChoiceInput}`}
                              value={option}
                              placeholder={`Choice ${optionIndex + 1}`}
                              onChange={(event) =>
                                updateCheckpointQuestionOption(
                                  selectedCheckpoint.id,
                                  question.id,
                                  optionIndex,
                                  event.target.value
                                )
                              }
                            />
                            {question.options.length > 2 ? (
                              <button
                                type="button"
                                className={styles.cpRemoveChoice}
                                aria-label={`Remove question ${questionIndex + 1} choice ${optionIndex + 1}`}
                                onClick={() =>
                                  removeCheckpointQuestionOption(selectedCheckpoint.id, question.id, optionIndex)
                                }
                              >
                                ×
                              </button>
                            ) : (
                              <span aria-hidden="true" />
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          className={styles.cpAddChoiceButton}
                          onClick={() => addCheckpointQuestionOption(selectedCheckpoint.id, question.id)}
                          disabled={question.options.length >= 8}
                        >
                          <span className={styles.cpAddIcon} aria-hidden="true">
                            +
                          </span>
                          Add choice
                        </button>
                      </div>
                    ) : (
                      <div className={styles.cpShortAnswerGrid}>
                        <label className={styles.cpField}>
                          <span className={styles.cpFieldLabel}>Exact numeric answer</span>
                          <input
                            aria-label={`${selectedCheckpoint.title} question ${questionIndex + 1} exact numeric answer`}
                            className={styles.cpInput}
                            value={question.numericAnswer}
                            inputMode="decimal"
                            placeholder="42"
                            onChange={(event) =>
                              updateCheckpointQuestion(
                                selectedCheckpoint.id,
                                question.id,
                                'numericAnswer',
                                event.target.value
                              )
                            }
                          />
                        </label>
                        <label className={styles.cpField}>
                          <span className={styles.cpFieldLabel}>Accepted minimum</span>
                          <input
                            aria-label={`${selectedCheckpoint.title} question ${questionIndex + 1} accepted minimum`}
                            className={styles.cpInput}
                            value={question.numericRangeMin}
                            inputMode="decimal"
                            placeholder="40"
                            onChange={(event) =>
                              updateCheckpointQuestion(
                                selectedCheckpoint.id,
                                question.id,
                                'numericRangeMin',
                                event.target.value
                              )
                            }
                          />
                        </label>
                        <label className={styles.cpField}>
                          <span className={styles.cpFieldLabel}>Accepted maximum</span>
                          <input
                            aria-label={`${selectedCheckpoint.title} question ${questionIndex + 1} accepted maximum`}
                            className={styles.cpInput}
                            value={question.numericRangeMax}
                            inputMode="decimal"
                            placeholder="45"
                            onChange={(event) =>
                              updateCheckpointQuestion(
                                selectedCheckpoint.id,
                                question.id,
                                'numericRangeMax',
                                event.target.value
                              )
                            }
                          />
                        </label>
                        <label className={styles.cpField}>
                          <span className={styles.cpFieldLabel}>Units set to</span>
                          <input
                            aria-label={`${selectedCheckpoint.title} question ${questionIndex + 1} unit`}
                            className={styles.cpInput}
                            value={question.unit}
                            placeholder="e.g. degrees C"
                            onChange={(event) =>
                              updateCheckpointQuestion(selectedCheckpoint.id, question.id, 'unit', event.target.value)
                            }
                          />
                        </label>
                      </div>
                    )}

                    <div className={styles.cpDivider} aria-hidden="true" />

                    <label className={styles.cpFeedbackRow}>
                      <input
                        type="checkbox"
                        className={styles.cpCheckbox}
                        checked={question.incorrectFeedbackEnabled}
                        aria-label={`${selectedCheckpoint.title} question ${questionIndex + 1} add incorrect-answer feedback`}
                        onChange={(event) =>
                          updateCheckpointQuestion(
                            selectedCheckpoint.id,
                            question.id,
                            'incorrectFeedbackEnabled',
                            event.target.checked
                          )
                        }
                      />
                      <span>Add feedback for incorrect answers</span>
                    </label>
                    {question.incorrectFeedbackEnabled && (
                      <textarea
                        aria-label={`${selectedCheckpoint.title} question ${questionIndex + 1} incorrect-answer feedback`}
                        className={`${styles.cpInput} ${styles.cpFeedbackText}`}
                        value={question.incorrectFeedback}
                        placeholder="Shown to learners who answer incorrectly."
                        onChange={(event) =>
                          updateCheckpointQuestion(
                            selectedCheckpoint.id,
                            question.id,
                            'incorrectFeedback',
                            event.target.value
                          )
                        }
                      />
                    )}
                  </section>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.cpModalFooter}>
            <button
              type="button"
              className={styles.cpRemoveCheckpoint}
              onClick={() => handleRemove(selectedCheckpoint.id)}
            >
              Remove checkpoint
            </button>
            <div className={styles.cpFooterActions}>
              <button
                type="button"
                className={styles.cpSecondaryAction}
                onClick={() => addCheckpointQuestion(selectedCheckpoint.id)}
              >
                Add question
              </button>
              <button type="button" className={styles.cpPrimaryAction} onClick={() => setSelectedId(null)}>
                Done
              </button>
            </div>
          </div>
        </QuestionModal>
      )}
    </div>
  );
}
