'use client';

import { useState } from 'react';
import RichTextEditor from '@/app/_components/RichTextEditor';

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
            <div className={styles.editorGrid}>
              <label className={styles.fieldStack}>
                <span>Timestamp</span>
                <input
                  className={styles.textField}
                  value={selectedCheckpoint.time}
                  onChange={(event) => updateCheckpoint(selectedCheckpoint.id, 'time', event.target.value)}
                />
              </label>

              <label className={styles.fieldStack}>
                <span>Points</span>
                <input
                  className={styles.textField}
                  type="number"
                  min={1}
                  value={selectedCheckpoint.points}
                  onChange={(event) =>
                    updateCheckpoint(selectedCheckpoint.id, 'points', Number(event.target.value) || 1)
                  }
                />
              </label>
            </div>

            <div className={styles.questionEditorList}>
              {selectedCheckpoint.questions.map((question, questionIndex) => (
                <section key={question.id} className={styles.questionEditorCard}>
                  <div className={styles.questionEditorHeader}>
                    <h3>Question {questionIndex + 1}</h3>
                    {selectedCheckpoint.questions.length > 1 && (
                      <button
                        type="button"
                        className={styles.removeTextButton}
                        onClick={() => removeCheckpointQuestion(selectedCheckpoint.id, question.id)}
                      >
                        Remove question
                      </button>
                    )}
                  </div>

                  <div className={styles.fieldStack}>
                    <span>Question prompt</span>
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

                  <label className={styles.fieldStack}>
                    <span>Question type</span>
                    <select
                      aria-label={`${selectedCheckpoint.title} question ${questionIndex + 1} type`}
                      className={styles.selectField}
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

                  {question.questionType === 'multipleChoice' ? (
                    <div className={styles.optionList}>
                      {question.options.map((option, optionIndex) => (
                        <div key={`${question.id}-option-${optionIndex}`} className={styles.optionRow}>
                          <input
                            type="checkbox"
                            checked={question.correctIndices.includes(optionIndex)}
                            onChange={() =>
                              toggleCheckpointQuestionCorrectOption(selectedCheckpoint.id, question.id, optionIndex)
                            }
                            aria-label={`Question ${questionIndex + 1} choice ${optionIndex + 1} is correct`}
                          />
                          <input
                            className={styles.textField}
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
                          {question.options.length > 2 && (
                            <button
                              type="button"
                              className={styles.removeTextButton}
                              onClick={() =>
                                removeCheckpointQuestionOption(selectedCheckpoint.id, question.id, optionIndex)
                              }
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => addCheckpointQuestionOption(selectedCheckpoint.id, question.id)}
                        disabled={question.options.length >= 8}
                      >
                        Add choice
                      </button>
                    </div>
                  ) : (
                    <div className={styles.shortAnswerGrid}>
                      <label className={styles.fieldStack}>
                        <span>Exact numeric answer</span>
                        <input
                          aria-label={`${selectedCheckpoint.title} question ${questionIndex + 1} exact numeric answer`}
                          className={styles.textField}
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
                      <label className={styles.fieldStack}>
                        <span>Accepted minimum</span>
                        <input
                          aria-label={`${selectedCheckpoint.title} question ${questionIndex + 1} accepted minimum`}
                          className={styles.textField}
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
                      <label className={styles.fieldStack}>
                        <span>Accepted maximum</span>
                        <input
                          aria-label={`${selectedCheckpoint.title} question ${questionIndex + 1} accepted maximum`}
                          className={styles.textField}
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
                      <label className={styles.fieldStack}>
                        <span>Units set to</span>
                        <input
                          aria-label={`${selectedCheckpoint.title} question ${questionIndex + 1} unit`}
                          className={styles.textField}
                          value={question.unit}
                          placeholder="e.g. degrees C (leave blank for none)"
                          onChange={(event) =>
                            updateCheckpointQuestion(selectedCheckpoint.id, question.id, 'unit', event.target.value)
                          }
                        />
                      </label>
                    </div>
                  )}

                  <div className={styles.feedbackBlock}>
                    <label className={styles.feedbackToggleRow}>
                      <input
                        type="checkbox"
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
                        className={styles.textAreaCompact}
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
                  </div>
                </section>
              ))}
            </div>

            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => addCheckpointQuestion(selectedCheckpoint.id)}
            >
              Add question
            </button>

            <div className={styles.inlineActions}>
              <button
                type="button"
                className={styles.removeTextButton}
                onClick={() => handleRemove(selectedCheckpoint.id)}
              >
                Remove checkpoint
              </button>
              <button type="button" className={styles.secondaryButton} onClick={() => setSelectedId(null)}>
                Done
              </button>
            </div>
          </div>
        </QuestionModal>
      )}
    </div>
  );
}
