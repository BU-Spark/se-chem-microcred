'use client';

import { useEffect, useRef } from 'react';

import styles from '../page.module.css';
import type { BadgeDraft, RubricSubgoalDraft } from '../types';

export default function RubricStep({
  draft,
  updateRubricGoalName,
  updateRubricGoalThreshold,
  updateSubgoal,
  addSubgoal,
  removeSubgoal,
}: {
  draft: BadgeDraft;
  updateRubricGoalName: (name: string) => void;
  updateRubricGoalThreshold: (points: number) => void;
  updateSubgoal: (subgoalId: string, patch: Partial<Omit<RubricSubgoalDraft, 'id'>>) => void;
  addSubgoal: () => void;
  removeSubgoal: (subgoalId: string) => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  // Set when Enter spawns a new row so focus follows into the new textarea
  // once it renders (the parent owns the subgoals, so we move focus post-commit).
  const focusNewItemRef = useRef(false);

  const { rubricGoal } = draft;
  const totalPoints = rubricGoal.subgoals.reduce((sum, subgoal) => sum + (subgoal.points || 0), 0);
  const thresholdTooHigh = rubricGoal.passThreshold > totalPoints;

  useEffect(() => {
    if (!focusNewItemRef.current) return;
    focusNewItemRef.current = false;
    const fields = listRef.current?.querySelectorAll('textarea');
    fields?.[fields.length - 1]?.focus();
  }, [draft.rubricGoal.subgoals.length]);

  return (
    <div className={styles.rubricStack}>
      <div className={styles.editorCard}>
        <h3 className={styles.panelTitle}>Goal</h3>
        <div className={styles.gradingPromptRow}>
          <input
            id="rubric-goal-name"
            aria-label="Rubric goal name"
            className={styles.gradingPromptInput}
            value={rubricGoal.name}
            placeholder="What should the student achieve?"
            onChange={(event) => updateRubricGoalName(event.target.value)}
          />
          <label
            htmlFor="rubric-goal-name"
            className={styles.gradingPencil}
            aria-label="Edit rubric goal name"
            title="Edit goal"
          >
            ✎
          </label>
        </div>
        <div className={styles.rubricThresholdRow}>
          <label htmlFor="rubric-pass-threshold">Pass at</label>
          <input
            id="rubric-pass-threshold"
            aria-label="Pass threshold points"
            className={styles.rubricPointsInput}
            type="number"
            min={0}
            max={totalPoints}
            step={1}
            value={rubricGoal.passThreshold}
            onChange={(event) => updateRubricGoalThreshold(Math.max(0, Math.round(Number(event.target.value) || 0)))}
          />
          <span>of {totalPoints} points</span>
        </div>
        {thresholdTooHigh && (
          <p className={styles.rubricThresholdWarning} role="alert">
            The pass threshold can&apos;t exceed the {totalPoints}-point total. It will be capped when the badge is
            saved.
          </p>
        )}
      </div>

      <div className={styles.editorCard}>
        <h3 className={styles.panelTitle}>Subgoals</h3>
        <ol ref={listRef} className={styles.rubricOrderedList}>
          {rubricGoal.subgoals.map((subgoal, index) => (
            <li key={subgoal.id} className={styles.rubricOrderedItem}>
              <span className={styles.rubricOrderedNumber}>{index + 1}.</span>
              <textarea
                aria-label={`Subgoal ${index + 1}`}
                className={styles.rubricLineInput}
                value={subgoal.text}
                rows={1}
                onChange={(event) => updateSubgoal(subgoal.id, { text: event.target.value })}
                onKeyDown={(event) => {
                  // Enter on a filled row spawns the next numbered row; Enter on
                  // an empty row is a no-op; Backspace on an empty row removes it.
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (subgoal.text.trim()) {
                      focusNewItemRef.current = true;
                      addSubgoal();
                    }
                  } else if (event.key === 'Backspace' && !subgoal.text && rubricGoal.subgoals.length > 1) {
                    event.preventDefault();
                    removeSubgoal(subgoal.id);
                  }
                }}
                placeholder="Start typing..."
              />
              <input
                aria-label={`Subgoal ${index + 1} points`}
                className={styles.rubricPointsInput}
                type="number"
                min={0}
                step={1}
                value={subgoal.points}
                onChange={(event) =>
                  updateSubgoal(subgoal.id, { points: Math.max(0, Math.round(Number(event.target.value) || 0)) })
                }
              />
              <span className={styles.rubricPointsLabel}>pts</span>
              {rubricGoal.subgoals.length > 1 && (
                <button
                  type="button"
                  className={styles.rubricGhostRemove}
                  onClick={() => removeSubgoal(subgoal.id)}
                  aria-label={`Remove subgoal ${index + 1}`}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ol>
        <div className={styles.rubricTotalRow}>
          <span>Total: {totalPoints} points</span>
        </div>
        <button type="button" className={styles.addCriterionButton} aria-label="Add subgoal" onClick={addSubgoal}>
          +
        </button>
      </div>
    </div>
  );
}
