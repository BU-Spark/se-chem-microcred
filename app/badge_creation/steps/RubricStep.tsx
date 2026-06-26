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
  addRubricCriterionOption: (criterionId: string) => void;
  removeRubricCriterionOption: (criterionId: string, optionIndex: number) => void;
}) {
  return (
    <div className={styles.rubricLayout}>
      <div className={styles.editorCard}>
        <h3 className={styles.panelTitle}>Create Rubric</h3>
        <div className={styles.numberedRubricList}>
          {draft.rubricItems.map((item, index) => (
            <div key={item.id} className={styles.numberedRubricItem}>
              <span className={styles.rubricNumber}>{index + 1}.</span>
              <textarea
                aria-label={`Rubric item ${index + 1}`}
                className={styles.textAreaCompact}
                value={item.text}
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
                placeholder="Describe the performance expectation."
              />
              <button
                type="button"
                className={styles.removeTextButton}
                onClick={() => removeRubricItem(item.id)}
                disabled={draft.rubricItems.length <= 1}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button type="button" className={styles.secondaryButton} onClick={addRubricItem}>
          Add Rubric Item
        </button>
      </div>

      <div className={styles.editorCard}>
        <h3 className={styles.panelTitle}>Instructor Grading</h3>
        <div className={styles.rubricList}>
          {draft.rubricCriteria.map((criterion, criterionIndex) => (
            <div key={criterion.id} className={styles.rubricCriterionCard}>
              <label className={styles.fieldStack}>
                <span>Criterion {criterionIndex + 1}</span>
                <textarea
                  className={styles.textAreaCompact}
                  aria-label={`Criterion ${criterionIndex + 1}`}
                  value={criterion.prompt}
                  onChange={(event) => updateRubricCriterion(criterion.id, 'prompt', event.target.value)}
                  placeholder="What should the instructor evaluate?"
                />
              </label>
              <div className={styles.gradingOptionsList}>
                {criterion.options.map((option, optionIndex) => (
                  <label key={`${criterion.id}-option-${optionIndex}`} className={styles.optionRow}>
                    <input type="checkbox" aria-label={`Criterion ${criterionIndex + 1} option ${optionIndex + 1}`} />
                    <input
                      className={styles.textField}
                      value={option}
                      placeholder={`Selection option ${optionIndex + 1}`}
                      onChange={(event) => updateRubricCriterionOption(criterion.id, optionIndex, event.target.value)}
                    />
                    <button
                      type="button"
                      className={styles.removeTextButton}
                      onClick={() => removeRubricCriterionOption(criterion.id, optionIndex)}
                      disabled={criterion.options.length <= 1}
                    >
                      Remove
                    </button>
                  </label>
                ))}
              </div>
              <div className={styles.inlineActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => addRubricCriterionOption(criterion.id)}
                >
                  Add Option
                </button>
                <button
                  type="button"
                  className={styles.removeTextButton}
                  onClick={() => removeRubricCriterion(criterion.id)}
                  disabled={draft.rubricCriteria.length <= 1}
                >
                  Remove Criterion
                </button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className={styles.secondaryButton} onClick={addRubricCriterion}>
          Add Criterion
        </button>
      </div>
    </div>
  );
}
