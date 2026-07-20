'use client';

import { useEffect, useRef } from 'react';

import RichTextEditor from '@/app/_components/RichTextEditor';
import styles from '../page.module.css';
import type { BadgeDraft, RubricSubgoalDraft, RubricTaskDraft } from '../types';

export default function RubricStep({
  draft,
  updateRubricGoalName,
  updateRubricInstructions,
  updateSubgoal,
  addSubgoal,
  removeSubgoal,
  updateTask,
  addTask,
  removeTask,
}: {
  draft: BadgeDraft;
  updateRubricGoalName: (name: string) => void;
  updateRubricInstructions: (taInstructions: string) => void;
  updateSubgoal: (subgoalId: string, patch: Partial<Pick<RubricSubgoalDraft, 'text' | 'passThreshold'>>) => void;
  addSubgoal: () => void;
  removeSubgoal: (subgoalId: string) => void;
  updateTask: (subgoalId: string, taskId: string, patch: Partial<Omit<RubricTaskDraft, 'id'>>) => void;
  addTask: (subgoalId: string) => void;
  removeTask: (subgoalId: string, taskId: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  // Set to a subgoal id when Enter spawns a new task row, so focus follows into
  // that subgoal's new textarea once it renders (the parent owns the tasks).
  const focusSubgoalRef = useRef<string | null>(null);

  const { rubricGoal } = draft;
  const totalTasks = rubricGoal.subgoals.reduce((sum, subgoal) => sum + subgoal.tasks.length, 0);

  useEffect(() => {
    const subgoalId = focusSubgoalRef.current;
    if (!subgoalId) return;
    focusSubgoalRef.current = null;
    const block = listRef.current?.querySelector(`[data-subgoal-id="${subgoalId}"]`);
    const fields = block?.querySelectorAll('textarea');
    (fields?.[fields.length - 1] as HTMLTextAreaElement | undefined)?.focus();
  }, [totalTasks]);

  return (
    <div className={styles.rubricStack}>
      <div className={styles.editorCard}>
        <h3 className={styles.panelTitle}>Goal</h3>
        <p className={styles.panelHint}>The overall skill this badge assesses — usually the badge name.</p>
        <label htmlFor="rubric-goal-name" className={styles.rubricFieldLabel}>
          Name{' '}
          <span className={styles.rubricRequiredMark} aria-hidden="true">
            *
          </span>
        </label>
        <div className={styles.gradingPromptRow}>
          <input
            id="rubric-goal-name"
            aria-label="Rubric goal name"
            className={styles.gradingPromptInput}
            value={rubricGoal.name}
            placeholder={draft.badgeName || 'What should the student achieve?'}
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
      </div>

      <div className={styles.editorCard} ref={listRef}>
        <h3 className={styles.panelTitle}>Subgoals</h3>
        <p className={styles.panelHint}>
          Group the skill into subgoals (e.g. &ldquo;Turning on&rdquo;, &ldquo;Cleaning&rdquo;). Each subgoal holds
          pass/fail tasks, and passes when its passed tasks&rsquo; points reach its threshold. The student earns the
          badge only when every subgoal passes.
        </p>

        <div className={styles.rubricSubgoalList}>
          {rubricGoal.subgoals.map((subgoal, subgoalIndex) => {
            const subgoalTotal = subgoal.tasks.reduce((sum, task) => sum + (task.points || 0), 0);
            const thresholdTooHigh = subgoal.passThreshold > subgoalTotal;

            return (
              <div key={subgoal.id} className={styles.rubricSubgoalBlock} data-subgoal-id={subgoal.id}>
                <div className={styles.rubricSubgoalHeader}>
                  <span className={styles.rubricOrderedNumber}>{subgoalIndex + 1}.</span>
                  <input
                    aria-label={`Subgoal ${subgoalIndex + 1} title`}
                    className={styles.rubricSubgoalTitleInput}
                    value={subgoal.text}
                    placeholder="Subgoal title"
                    onChange={(event) => updateSubgoal(subgoal.id, { text: event.target.value })}
                  />
                  {rubricGoal.subgoals.length > 1 && (
                    <button
                      type="button"
                      className={styles.rubricGhostRemove}
                      onClick={() => removeSubgoal(subgoal.id)}
                      aria-label={`Remove subgoal ${subgoalIndex + 1}`}
                    >
                      Remove subgoal ×
                    </button>
                  )}
                </div>

                <ol className={styles.rubricOrderedList}>
                  {subgoal.tasks.map((task, taskIndex) => (
                    <li key={task.id} className={styles.rubricOrderedItem}>
                      <span className={styles.rubricOrderedNumber}>{taskIndex + 1}.</span>
                      <textarea
                        aria-label={`Subgoal ${subgoalIndex + 1} task ${taskIndex + 1}`}
                        className={styles.rubricLineInput}
                        value={task.text}
                        rows={1}
                        onChange={(event) => updateTask(subgoal.id, task.id, { text: event.target.value })}
                        onKeyDown={(event) => {
                          // Enter on a filled task spawns the next task row; Enter on
                          // an empty row is a no-op; Backspace on an empty row removes it.
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            if (task.text.trim()) {
                              focusSubgoalRef.current = subgoal.id;
                              addTask(subgoal.id);
                            }
                          } else if (event.key === 'Backspace' && !task.text && subgoal.tasks.length > 1) {
                            event.preventDefault();
                            focusSubgoalRef.current = subgoal.id;
                            removeTask(subgoal.id, task.id);
                          }
                        }}
                        placeholder="Task the student must complete..."
                      />
                      <input
                        aria-label={`Subgoal ${subgoalIndex + 1} task ${taskIndex + 1} points`}
                        className={styles.rubricPointsInput}
                        type="number"
                        min={0}
                        step={1}
                        value={task.points}
                        onChange={(event) =>
                          updateTask(subgoal.id, task.id, {
                            points: Math.max(0, Math.round(Number(event.target.value) || 0)),
                          })
                        }
                      />
                      <span className={styles.rubricPointsLabel}>pts</span>
                      {subgoal.tasks.length > 1 && (
                        <button
                          type="button"
                          className={styles.rubricGhostRemove}
                          onClick={() => removeTask(subgoal.id, task.id)}
                          aria-label={`Remove subgoal ${subgoalIndex + 1} task ${taskIndex + 1}`}
                        >
                          ×
                        </button>
                      )}
                    </li>
                  ))}
                </ol>

                <button
                  type="button"
                  className={styles.addTaskButton}
                  aria-label={`Add task to subgoal ${subgoalIndex + 1}`}
                  onClick={() => addTask(subgoal.id)}
                >
                  + New task
                </button>

                <div className={styles.rubricThresholdRow}>
                  <label htmlFor={`subgoal-threshold-${subgoal.id}`}>Pass at</label>
                  <input
                    id={`subgoal-threshold-${subgoal.id}`}
                    aria-label={`Subgoal ${subgoalIndex + 1} pass threshold points`}
                    className={styles.rubricPointsInput}
                    type="number"
                    min={0}
                    max={subgoalTotal}
                    step={1}
                    value={subgoal.passThreshold}
                    onChange={(event) =>
                      updateSubgoal(subgoal.id, {
                        passThreshold: Math.max(0, Math.round(Number(event.target.value) || 0)),
                      })
                    }
                  />
                  <span>of {subgoalTotal} points</span>
                </div>
                {thresholdTooHigh && (
                  <p className={styles.rubricThresholdWarning} role="alert">
                    The pass threshold can&apos;t exceed this subgoal&apos;s {subgoalTotal}-point total. It will be
                    capped when the badge is saved.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <button type="button" className={styles.addSubgoalButton} aria-label="Add subgoal" onClick={addSubgoal}>
          + Add subgoal
        </button>
      </div>

      <div className={styles.editorCard}>
        <h3 className={styles.panelTitle}>Assessor Instructions</h3>
        <p className={styles.panelHint}>
          Notes for the assessor to relay to students during assessment. Shown alongside this rubric while grading.
        </p>
        <RichTextEditor
          namespace="ta-instructions"
          placeholder="Add any guidance the TA should share with students…"
          initialHTML={rubricGoal.taInstructions}
          onChange={updateRubricInstructions}
        />
      </div>
    </div>
  );
}
