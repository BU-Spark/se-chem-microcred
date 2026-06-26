import styles from '../page.module.css';
import type { BadgeDraft, CheckpointDraft } from '../types';

export default function CheckpointsStep({
  draft,
  videoEmbedUrl,
  addCheckpoint,
  removeCheckpoint,
  updateCheckpoint,
  updateCheckpointOption,
  toggleCheckpointCorrectOption,
}: {
  draft: BadgeDraft;
  videoEmbedUrl: string | null;
  addCheckpoint: () => void;
  removeCheckpoint: (checkpointId: string) => void;
  updateCheckpoint: <K extends keyof CheckpointDraft>(
    checkpointId: string,
    field: K,
    value: CheckpointDraft[K]
  ) => void;
  updateCheckpointOption: (checkpointId: string, optionIndex: number, value: string) => void;
  toggleCheckpointCorrectOption: (checkpointId: string, optionIndex: number) => void;
}) {
  return (
    <div className={styles.checkpointLayout}>
      <div className={styles.timelineRail}>
        <div className={styles.timelineHeader}>
          <span># of Checkpoints: {draft.checkpoints.length}</span>
          <button type="button" className={styles.plusButton} onClick={addCheckpoint}>
            +
          </button>
        </div>

        <div className={styles.timelineList}>
          {draft.checkpoints.map((checkpoint, index) => (
            <div key={checkpoint.id} className={styles.timelineItem}>
              <div className={styles.timelineSegment}>{checkpoint.segmentLabel}</div>
              <div className={styles.timelineCheckpointMarker} />
              <div className={styles.timelineCheckpointCopy}>
                {checkpoint.title} {checkpoint.points} points
              </div>
              <button type="button" className={styles.removeTextButton} onClick={() => removeCheckpoint(checkpoint.id)}>
                Remove
              </button>
              {index < draft.checkpoints.length - 1 && <div className={styles.timelineConnector} />}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.checkpointMain}>
        <div className={styles.videoFrameShell}>
          {videoEmbedUrl ? (
            <iframe
              className={styles.videoFrame}
              src={videoEmbedUrl}
              title={draft.videoTitle || 'Lesson video'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className={styles.videoFallback}>Paste a valid YouTube link to load the training video.</div>
          )}
        </div>

        <div className={styles.checkpointEditorList}>
          {draft.checkpoints.map((checkpoint) => (
            <article key={checkpoint.id} className={styles.editorCard}>
              <div className={styles.editorCardHeader}>
                <h3>{checkpoint.title}</h3>
                <span>{checkpoint.time}</span>
              </div>

              <div className={styles.editorGrid}>
                <label className={styles.fieldStack}>
                  <span>Segment label</span>
                  <input
                    className={styles.textField}
                    value={checkpoint.segmentLabel}
                    onChange={(event) => updateCheckpoint(checkpoint.id, 'segmentLabel', event.target.value)}
                  />
                </label>

                <label className={styles.fieldStack}>
                  <span>Timestamp</span>
                  <input
                    className={styles.textField}
                    value={checkpoint.time}
                    onChange={(event) => updateCheckpoint(checkpoint.id, 'time', event.target.value)}
                  />
                </label>

                <label className={styles.fieldStack}>
                  <span>Points</span>
                  <input
                    className={styles.textField}
                    type="number"
                    min={1}
                    value={checkpoint.points}
                    onChange={(event) => updateCheckpoint(checkpoint.id, 'points', Number(event.target.value) || 1)}
                  />
                </label>
              </div>

              <label className={styles.fieldStack}>
                <span>Question prompt</span>
                <textarea
                  className={styles.textAreaCompact}
                  value={checkpoint.question}
                  onChange={(event) => updateCheckpoint(checkpoint.id, 'question', event.target.value)}
                />
              </label>

              <label className={styles.fieldStack}>
                <span>Question type</span>
                <select
                  aria-label={`${checkpoint.title} question type`}
                  className={styles.selectField}
                  value={checkpoint.questionType}
                  onChange={(event) =>
                    updateCheckpoint(
                      checkpoint.id,
                      'questionType',
                      event.target.value as CheckpointDraft['questionType']
                    )
                  }
                >
                  <option value="multipleChoice">Multiple choice</option>
                  <option value="shortAnswer">Short answer number</option>
                </select>
              </label>

              {checkpoint.questionType === 'multipleChoice' ? (
                <div className={styles.optionList}>
                  {checkpoint.options.map((option, optionIndex) => (
                    <label key={`${checkpoint.id}-option-${optionIndex}`} className={styles.optionRow}>
                      <input
                        type="checkbox"
                        checked={checkpoint.correctIndices.includes(optionIndex)}
                        onChange={() => toggleCheckpointCorrectOption(checkpoint.id, optionIndex)}
                        aria-label={`Choice ${optionIndex + 1} is correct`}
                      />
                      <input
                        className={styles.textField}
                        value={option}
                        placeholder={`Choice ${optionIndex + 1}`}
                        onChange={(event) => updateCheckpointOption(checkpoint.id, optionIndex, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <div className={styles.shortAnswerGrid}>
                  <label className={styles.fieldStack}>
                    <span>Exact numeric answer</span>
                    <input
                      aria-label={`${checkpoint.title} exact numeric answer`}
                      className={styles.textField}
                      value={checkpoint.numericAnswer}
                      inputMode="decimal"
                      placeholder="42"
                      onChange={(event) => updateCheckpoint(checkpoint.id, 'numericAnswer', event.target.value)}
                    />
                  </label>
                  <label className={styles.fieldStack}>
                    <span>Accepted minimum</span>
                    <input
                      aria-label={`${checkpoint.title} accepted minimum`}
                      className={styles.textField}
                      value={checkpoint.numericRangeMin}
                      inputMode="decimal"
                      placeholder="40"
                      onChange={(event) => updateCheckpoint(checkpoint.id, 'numericRangeMin', event.target.value)}
                    />
                  </label>
                  <label className={styles.fieldStack}>
                    <span>Accepted maximum</span>
                    <input
                      aria-label={`${checkpoint.title} accepted maximum`}
                      className={styles.textField}
                      value={checkpoint.numericRangeMax}
                      inputMode="decimal"
                      placeholder="45"
                      onChange={(event) => updateCheckpoint(checkpoint.id, 'numericRangeMax', event.target.value)}
                    />
                  </label>
                  <label className={styles.fieldStack}>
                    <span>Units set to</span>
                    <input
                      aria-label={`${checkpoint.title} unit`}
                      className={styles.textField}
                      value={checkpoint.unit}
                      placeholder="e.g. °C (leave blank for none)"
                      onChange={(event) => updateCheckpoint(checkpoint.id, 'unit', event.target.value)}
                    />
                  </label>
                </div>
              )}

              <div className={styles.feedbackBlock}>
                <label className={styles.feedbackToggleRow}>
                  <input
                    type="checkbox"
                    checked={checkpoint.incorrectFeedbackEnabled}
                    aria-label={`${checkpoint.title} add incorrect-answer feedback`}
                    onChange={(event) =>
                      updateCheckpoint(checkpoint.id, 'incorrectFeedbackEnabled', event.target.checked)
                    }
                  />
                  <span>Add feedback for incorrect answers</span>
                </label>
                {checkpoint.incorrectFeedbackEnabled && (
                  <textarea
                    aria-label={`${checkpoint.title} incorrect-answer feedback`}
                    className={styles.textAreaCompact}
                    value={checkpoint.incorrectFeedback}
                    placeholder="Shown to learners who answer incorrectly."
                    onChange={(event) => updateCheckpoint(checkpoint.id, 'incorrectFeedback', event.target.value)}
                  />
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
