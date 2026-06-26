'use client';

import { useState } from 'react';

import QuestionModal from '../components/QuestionModal';
import VideoCheckpointPlayer from '../components/VideoCheckpointPlayer';
import { parseTimecodeToSeconds } from '../lib/badge-helpers';
import styles from '../page.module.css';
import type { BadgeDraft, CheckpointDraft } from '../types';

export default function CheckpointsStep({
  draft,
  videoId,
  videoThumbnail,
  addCheckpoint,
  removeCheckpoint,
  updateCheckpoint,
  updateCheckpointOption,
  toggleCheckpointCorrectOption,
}: {
  draft: BadgeDraft;
  videoId: string | null;
  videoThumbnail: string | null;
  addCheckpoint: (atSeconds?: number) => string;
  removeCheckpoint: (checkpointId: string) => void;
  updateCheckpoint: <K extends keyof CheckpointDraft>(
    checkpointId: string,
    field: K,
    value: CheckpointDraft[K]
  ) => void;
  updateCheckpointOption: (checkpointId: string, optionIndex: number, value: string) => void;
  toggleCheckpointCorrectOption: (checkpointId: string, optionIndex: number) => void;
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

            <label className={styles.fieldStack}>
              <span>Question prompt</span>
              <textarea
                className={styles.textAreaCompact}
                value={selectedCheckpoint.question}
                onChange={(event) => updateCheckpoint(selectedCheckpoint.id, 'question', event.target.value)}
              />
            </label>

            <label className={styles.fieldStack}>
              <span>Question type</span>
              <select
                aria-label={`${selectedCheckpoint.title} question type`}
                className={styles.selectField}
                value={selectedCheckpoint.questionType}
                onChange={(event) =>
                  updateCheckpoint(
                    selectedCheckpoint.id,
                    'questionType',
                    event.target.value as CheckpointDraft['questionType']
                  )
                }
              >
                <option value="multipleChoice">Multiple choice</option>
                <option value="shortAnswer">Short answer number</option>
              </select>
            </label>

            {selectedCheckpoint.questionType === 'multipleChoice' ? (
              <div className={styles.optionList}>
                {selectedCheckpoint.options.map((option, optionIndex) => (
                  <label key={`${selectedCheckpoint.id}-option-${optionIndex}`} className={styles.optionRow}>
                    <input
                      type="checkbox"
                      checked={selectedCheckpoint.correctIndices.includes(optionIndex)}
                      onChange={() => toggleCheckpointCorrectOption(selectedCheckpoint.id, optionIndex)}
                      aria-label={`Choice ${optionIndex + 1} is correct`}
                    />
                    <input
                      className={styles.textField}
                      value={option}
                      placeholder={`Choice ${optionIndex + 1}`}
                      onChange={(event) =>
                        updateCheckpointOption(selectedCheckpoint.id, optionIndex, event.target.value)
                      }
                    />
                  </label>
                ))}
              </div>
            ) : (
              <div className={styles.shortAnswerGrid}>
                <label className={styles.fieldStack}>
                  <span>Exact numeric answer</span>
                  <input
                    aria-label={`${selectedCheckpoint.title} exact numeric answer`}
                    className={styles.textField}
                    value={selectedCheckpoint.numericAnswer}
                    inputMode="decimal"
                    placeholder="42"
                    onChange={(event) => updateCheckpoint(selectedCheckpoint.id, 'numericAnswer', event.target.value)}
                  />
                </label>
                <label className={styles.fieldStack}>
                  <span>Accepted minimum</span>
                  <input
                    aria-label={`${selectedCheckpoint.title} accepted minimum`}
                    className={styles.textField}
                    value={selectedCheckpoint.numericRangeMin}
                    inputMode="decimal"
                    placeholder="40"
                    onChange={(event) => updateCheckpoint(selectedCheckpoint.id, 'numericRangeMin', event.target.value)}
                  />
                </label>
                <label className={styles.fieldStack}>
                  <span>Accepted maximum</span>
                  <input
                    aria-label={`${selectedCheckpoint.title} accepted maximum`}
                    className={styles.textField}
                    value={selectedCheckpoint.numericRangeMax}
                    inputMode="decimal"
                    placeholder="45"
                    onChange={(event) => updateCheckpoint(selectedCheckpoint.id, 'numericRangeMax', event.target.value)}
                  />
                </label>
                <label className={styles.fieldStack}>
                  <span>Units set to</span>
                  <input
                    aria-label={`${selectedCheckpoint.title} unit`}
                    className={styles.textField}
                    value={selectedCheckpoint.unit}
                    placeholder="e.g. °C (leave blank for none)"
                    onChange={(event) => updateCheckpoint(selectedCheckpoint.id, 'unit', event.target.value)}
                  />
                </label>
              </div>
            )}

            <div className={styles.feedbackBlock}>
              <label className={styles.feedbackToggleRow}>
                <input
                  type="checkbox"
                  checked={selectedCheckpoint.incorrectFeedbackEnabled}
                  aria-label={`${selectedCheckpoint.title} add incorrect-answer feedback`}
                  onChange={(event) =>
                    updateCheckpoint(selectedCheckpoint.id, 'incorrectFeedbackEnabled', event.target.checked)
                  }
                />
                <span>Add feedback for incorrect answers</span>
              </label>
              {selectedCheckpoint.incorrectFeedbackEnabled && (
                <textarea
                  aria-label={`${selectedCheckpoint.title} incorrect-answer feedback`}
                  className={styles.textAreaCompact}
                  value={selectedCheckpoint.incorrectFeedback}
                  placeholder="Shown to learners who answer incorrectly."
                  onChange={(event) => updateCheckpoint(selectedCheckpoint.id, 'incorrectFeedback', event.target.value)}
                />
              )}
            </div>

            <div className={styles.inlineActions}>
              <button
                type="button"
                className={styles.removeTextButton}
                onClick={() => handleRemove(selectedCheckpoint.id)}
                disabled={draft.checkpoints.length <= 1}
              >
                Remove checkpoint
              </button>
            </div>
          </div>
        </QuestionModal>
      )}
    </div>
  );
}
