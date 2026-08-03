import type { ReactNode } from 'react';

import styles from './RubricPreview.module.css';

export type RubricPreviewTask = {
  id: string;
  text: string;
  points: number;
};

export type RubricPreviewSubgoal = {
  id: string;
  text: string;
  passThreshold: number;
  tasks: RubricPreviewTask[];
};

export type RubricTaskSlotArgs = {
  subgoal: RubricPreviewSubgoal;
  task: RubricPreviewTask;
  subgoalIndex: number;
  taskIndex: number;
};

/**
 * Read-only twin of the badge editor's Create Rubric step: same goal band,
 * two-column body, and 1 / 1.1 numbering, with every authoring control stripped
 * out. The optional slots let the checker flow hang its grading controls
 * (pass/fail switch, feedback box, per-subgoal tally) on the same layout so the
 * rubric reads identically wherever it appears.
 */
export default function RubricPreview({
  goalName,
  subgoals,
  instructions,
  instructionsTitle = 'Assessor Instructions',
  showInstructions = true,
  subgoalsLabel,
  columnHint = 'Each subgoal passes when its passed tasks reach the pass threshold. The badge passes only when every subgoal passes.',
  renderSubgoalStatus,
  renderTaskControl,
  renderTaskFooter,
}: {
  goalName?: string | null;
  subgoals: RubricPreviewSubgoal[];
  /** Sanitized HTML authored in the badge editor's rich-text field. */
  instructions?: string | null;
  instructionsTitle?: string;
  /** Drops the instructions rail entirely; the subgoal column goes full width. */
  showInstructions?: boolean;
  /** Accessible name for the subgoal list region. */
  subgoalsLabel?: string;
  columnHint?: ReactNode;
  /** Replaces the "Pass at N of M points" line (e.g. the live grading tally). */
  renderSubgoalStatus?: (subgoal: RubricPreviewSubgoal, subgoalIndex: number) => ReactNode;
  /** Extra cell after the task's points (e.g. the pass/fail switch). */
  renderTaskControl?: (args: RubricTaskSlotArgs) => ReactNode;
  /** Full-width block under a task row (e.g. the optional feedback box). */
  renderTaskFooter?: (args: RubricTaskSlotArgs) => ReactNode;
}) {
  return (
    <div className={styles.panel}>
      <section className={styles.goalSection}>
        <div className={styles.sectionHeading}>
          <h3 className={styles.sectionTitle}>Goal</h3>
          <span className={styles.sectionHint}>The overall skill this badge assesses</span>
        </div>
        <p className={styles.goalValue}>{goalName?.trim() || 'No goal recorded for this badge.'}</p>
      </section>

      <div className={showInstructions ? styles.body : styles.bodyFullWidth}>
        <section className={styles.subgoalColumn}>
          <h3 className={styles.sectionTitle}>Subgoals &amp; tasks</h3>
          {columnHint ? <p className={styles.columnHint}>{columnHint}</p> : null}

          <div className={styles.subgoalList} aria-label={subgoalsLabel}>
            {subgoals.map((subgoal, subgoalIndex) => {
              const subgoalTotal = subgoal.tasks.reduce((sum, task) => sum + task.points, 0);

              return (
                <div key={subgoal.id} className={styles.subgoalBlock}>
                  <div className={styles.subgoalHeader}>
                    <span className={styles.subgoalNumber}>{subgoalIndex + 1}</span>
                    <span className={styles.subgoalText}>{subgoal.text}</span>
                    <span className={styles.thresholdText}>
                      {renderSubgoalStatus
                        ? renderSubgoalStatus(subgoal, subgoalIndex)
                        : `Pass at ${subgoal.passThreshold} of ${subgoalTotal} points`}
                    </span>
                  </div>

                  <ol className={styles.taskList}>
                    {subgoal.tasks.map((task, taskIndex) => {
                      const slotArgs = { subgoal, task, subgoalIndex, taskIndex };
                      const footer = renderTaskFooter?.(slotArgs);

                      return (
                        <li key={task.id} className={styles.taskItem}>
                          <div className={styles.taskRow}>
                            <span className={styles.taskNumber}>
                              {subgoalIndex + 1}.{taskIndex + 1}
                            </span>
                            <span className={styles.taskText}>{task.text}</span>
                            <span className={styles.taskPoints}>
                              {task.points} {task.points === 1 ? 'pt' : 'pts'}
                            </span>
                            {renderTaskControl ? (
                              <span className={styles.taskControl}>{renderTaskControl(slotArgs)}</span>
                            ) : null}
                          </div>
                          {footer ? <div className={styles.taskFooter}>{footer}</div> : null}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </div>
        </section>

        {showInstructions ? (
          <aside className={styles.instructionsColumn}>
            <h3 className={styles.sectionTitle}>{instructionsTitle}</h3>
            {instructions ? (
              <div
                className={`${styles.instructionsBody} rte-readonly`}
                dangerouslySetInnerHTML={{ __html: instructions }}
              />
            ) : (
              <p className={styles.columnHint}>No instructions were provided for this badge.</p>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
