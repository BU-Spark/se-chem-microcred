'use client';

import { useEffect, useRef } from 'react';

import RichTextEditor from '@/app/components/RichText/RichTextEditor';
import styles from '../page.module.css';
import type { BadgeDraft, RubricSubgoalDraft, RubricTaskDraft } from '../types';

const MAX_TASK_POINTS = 10;

/** Selectable values 1..max, plus `current` so an out-of-range saved value still shows. */
function pointOptions(max: number, current: number) {
  const values = new Set<number>();
  for (let value = 1; value <= Math.max(1, max); value += 1) values.add(value);
  values.add(Math.max(0, current));
  return Array.from(values).sort((left, right) => left - right);
}

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
    <div className={styles.rubricPanel}>
      <section className={styles.rubricGoalSection}>
        <div className={styles.rubricSectionHeading}>
          <label htmlFor="rubric-goal-name" className={styles.rubricSectionTitle}>
            Goal
          </label>
          <span className={styles.rubricSectionHint}>The overall skill this badge assesses</span>
        </div>
        <input
          id="rubric-goal-name"
          aria-label="Rubric goal name"
          className={styles.rubricGoalInput}
          value={rubricGoal.name}
          placeholder={draft.badgeName || 'What should the student achieve?'}
          onChange={(event) => updateRubricGoalName(event.target.value)}
        />
      </section>

      <div className={styles.rubricBody}>
        <section className={styles.rubricSubgoalColumn}>
          <h3 className={styles.rubricSectionTitle}>Subgoals &amp; tasks</h3>
          <p className={styles.rubricColumnHint}>
            Break the skill into subgoals and tasks. Set points for each task and define the pass threshold.
          </p>

          <div className={styles.rubricSubgoalList} ref={listRef}>
            {rubricGoal.subgoals.map((subgoal, subgoalIndex) => {
              const subgoalTotal = subgoal.tasks.reduce((sum, task) => sum + (task.points || 0), 0);
              const thresholdTooHigh = subgoal.passThreshold > subgoalTotal;

              return (
                <div key={subgoal.id} className={styles.rubricSubgoalBlock} data-subgoal-id={subgoal.id}>
                  <div className={styles.rubricSubgoalHeader}>
                    <span className={styles.rubricSubgoalNumber}>{subgoalIndex + 1}</span>
                    <input
                      aria-label={`Subgoal ${subgoalIndex + 1} title`}
                      className={styles.rubricSubgoalTitleInput}
                      value={subgoal.text}
                      placeholder="Subgoal title"
                      onChange={(event) => updateSubgoal(subgoal.id, { text: event.target.value })}
                    />
                    <div className={styles.rubricThresholdRow}>
                      <label htmlFor={`subgoal-threshold-${subgoal.id}`} className={styles.rubricThresholdLabel}>
                        Pass at
                      </label>
                      <select
                        id={`subgoal-threshold-${subgoal.id}`}
                        aria-label={`Subgoal ${subgoalIndex + 1} pass threshold points`}
                        className={styles.rubricSelect}
                        value={subgoal.passThreshold}
                        onChange={(event) =>
                          updateSubgoal(subgoal.id, {
                            passThreshold: Math.max(0, Math.round(Number(event.target.value) || 0)),
                          })
                        }
                      >
                        {pointOptions(subgoalTotal, subgoal.passThreshold).map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                      <span className={styles.rubricThresholdTotal}>of {subgoalTotal} points</span>
                    </div>
                    {rubricGoal.subgoals.length > 1 ? (
                      <button
                        type="button"
                        className={styles.rubricRemoveButton}
                        onClick={() => removeSubgoal(subgoal.id)}
                        aria-label={`Remove subgoal ${subgoalIndex + 1}`}
                        title="Remove subgoal"
                      >
                        ×
                      </button>
                    ) : (
                      <span className={styles.rubricRemoveSpacer} aria-hidden="true" />
                    )}
                  </div>

                  <ol className={styles.rubricTaskList}>
                    {subgoal.tasks.map((task, taskIndex) => (
                      <li key={task.id} className={styles.rubricTaskRow}>
                        <span className={styles.rubricTaskNumber}>
                          {subgoalIndex + 1}.{taskIndex + 1}
                        </span>
                        <textarea
                          aria-label={`Subgoal ${subgoalIndex + 1} task ${taskIndex + 1}`}
                          className={styles.rubricTaskInput}
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
                        <select
                          aria-label={`Subgoal ${subgoalIndex + 1} task ${taskIndex + 1} points`}
                          className={styles.rubricSelect}
                          value={task.points}
                          onChange={(event) =>
                            updateTask(subgoal.id, task.id, {
                              points: Math.max(0, Math.round(Number(event.target.value) || 0)),
                            })
                          }
                        >
                          {pointOptions(MAX_TASK_POINTS, task.points).map((value) => (
                            <option key={value} value={value}>
                              {value} pt{value === 1 ? '' : 's'}
                            </option>
                          ))}
                        </select>
                        {subgoal.tasks.length > 1 ? (
                          <button
                            type="button"
                            className={styles.rubricRemoveButton}
                            onClick={() => removeTask(subgoal.id, task.id)}
                            aria-label={`Remove subgoal ${subgoalIndex + 1} task ${taskIndex + 1}`}
                            title="Remove task"
                          >
                            ×
                          </button>
                        ) : (
                          <span className={styles.rubricRemoveSpacer} aria-hidden="true" />
                        )}
                      </li>
                    ))}
                  </ol>

                  {thresholdTooHigh && (
                    <p className={styles.rubricThresholdWarning} role="alert">
                      The pass threshold can&apos;t exceed this subgoal&apos;s {subgoalTotal}-point total. It will be
                      capped when the badge is saved.
                    </p>
                  )}

                  <button
                    type="button"
                    className={styles.addTaskButton}
                    aria-label={`Add task to subgoal ${subgoalIndex + 1}`}
                    onClick={() => addTask(subgoal.id)}
                  >
                    <span aria-hidden="true">+</span> New task
                  </button>
                </div>
              );
            })}
          </div>

          <button type="button" className={styles.addSubgoalButton} aria-label="Add subgoal" onClick={addSubgoal}>
            <span className={styles.addSubgoalIcon} aria-hidden="true">
              +
            </span>
            Add subgoal
          </button>
        </section>

        <aside className={styles.rubricInstructionsColumn}>
          <h3 className={styles.rubricSectionTitle}>Assessor Instructions</h3>
          <p className={styles.rubricColumnHint}>
            Provide clear steps or guidance for assessors to follow when evaluating this badge.
          </p>
          <RichTextEditor
            namespace="ta-instructions"
            ariaLabel="Assessor instructions"
            placeholder="Add any guidance the assessor should share with students…"
            initialHTML={rubricGoal.taInstructions}
            onChange={updateRubricInstructions}
          />
        </aside>
      </div>
    </div>
  );
}
