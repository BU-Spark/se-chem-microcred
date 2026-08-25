'use client';

import { useMemo, useState } from 'react';
import RichTextEditor from '@/app/components/RichText/RichTextEditor';
import { LessonVideoPage } from '@/app/lessons/[lessonId]/video';

import QuestionModal from '../components/QuestionModal';
import VideoCheckpointPlayer from '../components/VideoCheckpointPlayer';
import { parseTimecodeToSeconds } from '../lib/badge-helpers';
import { buildPreviewLesson } from '../lib/preview-lesson';
import styles from '../page.module.css';
import type { BadgeDraft, CheckpointDraft, CheckpointQuestionDraft } from '../types';

type CheckpointsTab = 'create' | 'preview';

// Points are authored per question (issue #248); the checkpoint-level total
// shown in the rail and modal header is just their sum, not authored directly.
function checkpointTotalPoints(checkpoint: CheckpointDraft) {
  return checkpoint.questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0);
}

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
  const [activeTab, setActiveTab] = useState<CheckpointsTab>('create');
  // Bumped every time the preview is (re)opened so the player remounts and each
  // preview run starts from a clean first-time state.
  const [previewRun, setPreviewRun] = useState(0);

  const selectedCheckpoint = draft.checkpoints.find((checkpoint) => checkpoint.id === selectedId) ?? null;
  const checkpointTimes = draft.checkpoints.map((checkpoint) => parseTimecodeToSeconds(checkpoint.time));

  const canPreview = Boolean(videoId) && draft.checkpoints.length > 0;
  const previewDisabledReason = !videoId
    ? 'Add a lesson video on the previous step to preview it.'
    : 'Add at least one checkpoint to preview the student experience.';

  const previewLesson = useMemo(() => buildPreviewLesson(draft), [draft]);

  const handleAddAtTime = (seconds: number) => {
    const newId = addCheckpoint(seconds);
    setSelectedId(newId);
  };

  const handleRemove = (checkpointId: string) => {
    removeCheckpoint(checkpointId);
    if (checkpointId === selectedId) setSelectedId(null);
  };

  const openPreview = () => {
    if (!canPreview) return;
    setSelectedId(null);
    setPreviewRun((run) => run + 1);
    setActiveTab('preview');
  };

  const tabs = (
    <div className={styles.modeTabs} role="tablist" aria-label="Checkpoint editor mode">
      <button
        type="button"
        role="tab"
        id="checkpoints-tab-create"
        aria-selected={activeTab === 'create'}
        aria-controls="checkpoints-panel-create"
        className={`${styles.modeTab} ${activeTab === 'create' ? styles.modeTabActive : ''}`.trim()}
        onClick={() => setActiveTab('create')}
      >
        Create
      </button>
      <button
        type="button"
        role="tab"
        id="checkpoints-tab-preview"
        aria-selected={activeTab === 'preview'}
        aria-controls="checkpoints-panel-preview"
        className={`${styles.modeTab} ${activeTab === 'preview' ? styles.modeTabActive : ''}`.trim()}
        onClick={openPreview}
        disabled={!canPreview}
        title={canPreview ? 'Watch the lesson the way a student will' : previewDisabledReason}
      >
        Preview
      </button>
    </div>
  );

  if (activeTab === 'preview') {
    return (
      <div className={styles.previewShell}>
        {tabs}
        <div
          role="tabpanel"
          id="checkpoints-panel-preview"
          aria-labelledby="checkpoints-tab-preview"
          className={styles.previewPanel}
        >
          <p className={styles.previewNotice}>
            Preview only — this is the student view of your draft. Answers are graded so you can check your keys, but
            nothing is saved and no student progress is affected. Unlike a student, you can scrub anywhere and click a
            marker on the timeline to jump straight to a checkpoint; anything you skip counts as unanswered in the grade
            shown at the end.
          </p>
          <LessonVideoPage
            key={`preview-run-${previewRun}`}
            lesson={previewLesson}
            studentEmail=""
            studentId=""
            resumeRequested={false}
            previewMode
            onExitPreview={() => setActiveTab('create')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.previewShell}>
      {tabs}
      <p className={styles.cardSubtitle}>
        Select where you want to add a checkpoint in the video timeline, and click the plus button to create the
        checkpoint.
      </p>
      <div role="tabpanel" id="checkpoints-panel-create" aria-labelledby="checkpoints-tab-create">
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
                    <span>{checkpointTotalPoints(checkpoint)} points</span>
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

                  <div className={styles.cpField}>
                    <span className={styles.cpFieldLabel}>Total points</span>
                    <span className={styles.cpComputedValue}>
                      {checkpointTotalPoints(selectedCheckpoint)}{' '}
                      {checkpointTotalPoints(selectedCheckpoint) === 1 ? 'point' : 'points'}
                    </span>
                  </div>
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
                        <div className={styles.cpAnswerMetaRow}>
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

                          <label className={styles.cpField}>
                            <span className={styles.cpFieldLabel}>Points</span>
                            <input
                              className={styles.cpInput}
                              type="number"
                              min={0}
                              value={question.points}
                              aria-label={`Question ${questionIndex + 1} points`}
                              onChange={(event) =>
                                updateCheckpointQuestion(
                                  selectedCheckpoint.id,
                                  question.id,
                                  'points',
                                  Math.max(0, Math.round(Number(event.target.value))) || 0
                                )
                              }
                            />
                          </label>
                        </div>

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
                                    toggleCheckpointQuestionCorrectOption(
                                      selectedCheckpoint.id,
                                      question.id,
                                      optionIndex
                                    )
                                  }
                                  aria-label={`Question ${questionIndex + 1} choice ${optionIndex + 1} is correct`}
                                />
                                <div className={styles.cpChoiceEditor}>
                                  {/* Options have no stable id of their own, and the editor
                                      is uncontrolled after mount (Lexical), so removing a
                                      choice would leave a surviving editor showing stale
                                      text once indices shift. Keying on the option count
                                      too forces every choice editor in the question to
                                      remount (and re-read the current text) whenever one is
                                      added or removed, without remounting on every keystroke. */}
                                  <RichTextEditor
                                    key={`${question.id}-option-${optionIndex}-of-${question.options.length}`}
                                    namespace={`CheckpointChoice-${selectedCheckpoint.id}-${question.id}-${optionIndex}`}
                                    toolbar="inline"
                                    ariaLabel={`Question ${questionIndex + 1} choice ${optionIndex + 1}`}
                                    placeholder={`Choice ${optionIndex + 1}`}
                                    initialHTML={option}
                                    onChange={(html) =>
                                      updateCheckpointQuestionOption(
                                        selectedCheckpoint.id,
                                        question.id,
                                        optionIndex,
                                        html
                                      )
                                    }
                                  />
                                </div>
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
                                  updateCheckpointQuestion(
                                    selectedCheckpoint.id,
                                    question.id,
                                    'unit',
                                    event.target.value
                                  )
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
      </div>
    </div>
  );
}
