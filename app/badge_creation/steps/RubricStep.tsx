'use client';

import { useEffect, useRef } from 'react';

import styles from '../page.module.css';
import type { BadgeDraft, RubricCriterion } from '../types';

export default function RubricStep({
  draft,
  updateRubricItem,
  addRubricItem,
  removeRubricItem,
  updateRubricCriterion,
  addRubricCriterion,
  removeRubricCriterion,
  updateRubricCriterionOption,
  updateRubricCriterionOptionFeedback,
  addRubricCriterionOption,
  removeRubricCriterionOption,
}: {
  draft: BadgeDraft;
  updateRubricItem: (itemId: string, text: string) => void;
  addRubricItem: () => void;
  removeRubricItem: (itemId: string) => void;
  updateRubricCriterion: <K extends keyof RubricCriterion>(
    criterionId: string,
    field: K,
    value: RubricCriterion[K]
  ) => void;
  addRubricCriterion: () => void;
  removeRubricCriterion: (criterionId: string) => void;
  updateRubricCriterionOption: (criterionId: string, optionIndex: number, value: string) => void;
  updateRubricCriterionOptionFeedback: (criterionId: string, optionIndex: number, value: string) => void;
  addRubricCriterionOption: (criterionId: string) => void;
  removeRubricCriterionOption: (criterionId: string, optionIndex: number) => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  // Set when Enter spawns a new row so focus follows into the new textarea
  // once it renders (the parent owns the items, so we move focus post-commit).
  const focusNewItemRef = useRef(false);

  useEffect(() => {
    if (!focusNewItemRef.current) return;
    focusNewItemRef.current = false;
    const fields = listRef.current?.querySelectorAll('textarea');
    fields?.[fields.length - 1]?.focus();
  }, [draft.rubricItems.length]);

  return (
    <div className={styles.rubricStack}>
      <div className={styles.editorCard}>
        <h3 className={styles.panelTitle}>Create Rubric</h3>
        <ol ref={listRef} className={styles.rubricOrderedList}>
          {draft.rubricItems.map((item, index) => (
            <li key={item.id} className={styles.rubricOrderedItem}>
              <span className={styles.rubricOrderedNumber}>{index + 1}.</span>
              <textarea
                aria-label={`Rubric item ${index + 1}`}
                className={styles.rubricLineInput}
                value={item.text}
                rows={1}
                onChange={(event) => updateRubricItem(item.id, event.target.value)}
                onKeyDown={(event) => {
                  // Enter on a filled row spawns the next numbered row; Enter on
                  // an empty row is a no-op; Backspace on an empty row removes it.
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (item.text.trim()) addRubricItem();
                  } else if (event.key === 'Backspace' && !item.text && draft.rubricItems.length > 1) {
                    event.preventDefault();
                    removeRubricItem(item.id);
                  }
                }}
                placeholder="Start typing..."
              />
              {draft.rubricItems.length > 1 && (
                <button
                  type="button"
                  className={styles.rubricGhostRemove}
                  onClick={() => removeRubricItem(item.id)}
                  aria-label={`Remove rubric item ${index + 1}`}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.editorCard}>
        <h3 className={styles.panelTitle}>Instructor Grading</h3>
        <div className={styles.gradingList}>
          {draft.rubricCriteria.map((criterion, criterionIndex) => (
            <div key={criterion.id} className={styles.gradingCriterion}>
              <div className={styles.gradingPromptRow}>
                <input
                  id={`criterion-prompt-${criterion.id}`}
                  aria-label={`Criterion ${criterionIndex + 1}`}
                  className={styles.gradingPromptInput}
                  value={criterion.prompt}
                  placeholder="What should the instructor evaluate?"
                  onChange={(event) => updateRubricCriterion(criterion.id, 'prompt', event.target.value)}
                />
                <label
                  htmlFor={`criterion-prompt-${criterion.id}`}
                  className={styles.gradingPencil}
                  aria-label={`Edit criterion ${criterionIndex + 1}`}
                  title="Edit criterion"
                >
                  ✎
                </label>
              </div>

              <div className={styles.gradingOptionsGrid}>
                {criterion.options.map((option, optionIndex) => (
                  <div key={`${criterion.id}-option-${optionIndex}`} className={styles.gradingOptionRow}>
                    <div className={styles.gradingOptionLeft}>
                      <span className={styles.gradingCheckbox} aria-hidden="true" />
                      <input
                        className={styles.gradingUnderlineInput}
                        value={option}
                        placeholder={`Selection option ${optionIndex + 1}`}
                        onChange={(event) => updateRubricCriterionOption(criterion.id, optionIndex, event.target.value)}
                      />
                    </div>
                    <div className={styles.gradingFeedbackCell}>
                      <span
                        className={`${styles.gradingCheckbox} ${
                          criterion.optionFeedback[optionIndex]?.trim() ? styles.gradingCheckboxFilled : ''
                        }`}
                        aria-hidden="true"
                      />
                      <input
                        className={`${styles.gradingUnderlineInput} ${styles.gradingFeedbackInput}`}
                        value={criterion.optionFeedback[optionIndex] ?? ''}
                        placeholder="Add prewritten feedback for this option"
                        aria-label={`Criterion ${criterionIndex + 1} option ${optionIndex + 1} feedback`}
                        onChange={(event) =>
                          updateRubricCriterionOptionFeedback(criterion.id, optionIndex, event.target.value)
                        }
                      />
                    </div>
                    {criterion.options.length > 1 && (
                      <button
                        type="button"
                        className={styles.rubricGhostRemove}
                        onClick={() => removeRubricCriterionOption(criterion.id, optionIndex)}
                        aria-label={`Remove criterion ${criterionIndex + 1} option ${optionIndex + 1}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className={styles.gradingCriterionActions}>
                <button
                  type="button"
                  className={styles.gradingAddItem}
                  onClick={() => addRubricCriterionOption(criterion.id)}
                >
                  <span className={styles.gradingCheckbox} aria-hidden="true" />
                  Add rubric item
                </button>
                {draft.rubricCriteria.length > 1 && (
                  <button
                    type="button"
                    className={styles.rubricGhostRemove}
                    onClick={() => removeRubricCriterion(criterion.id)}
                    aria-label={`Remove criterion ${criterionIndex + 1}`}
                  >
                    Remove criterion
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className={styles.addCriterionButton}
          aria-label="Add Criterion"
          onClick={addRubricCriterion}
        >
          +
        </button>
      </div>
    </div>
  );
}
