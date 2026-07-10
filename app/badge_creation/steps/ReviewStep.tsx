import { buildVideoThumbnail } from '../lib/badge-helpers';
import styles from '../page.module.css';
import type { BadgeDraft } from '../types';

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={styles.reviewEdit} onClick={onClick}>
      Edit <span aria-hidden="true">✎</span>
    </button>
  );
}

export default function ReviewStep({ draft, goToStep }: { draft: BadgeDraft; goToStep: (stepIndex: number) => void }) {
  const videoThumbnail = buildVideoThumbnail(draft.youtubeUrl);

  return (
    <div className={styles.reviewStack}>
      <section className={styles.reviewCard}>
        <div className={styles.reviewCardHeader}>
          <h3>Badge Info</h3>
          <EditButton onClick={() => goToStep(0)} />
        </div>

        <p className={styles.reviewBadgeName}>{draft.badgeName || 'Untitled badge'}</p>

        {draft.badgeDescription && (
          <div className={styles.reviewField}>
            <span className={styles.reviewFieldLabel}>Badge Description</span>
            <div className={styles.reviewDescriptionBox}>{draft.badgeDescription}</div>
          </div>
        )}

        <div className={styles.reviewSkillsRow}>
          <div className={styles.reviewField}>
            <span className={styles.reviewFieldLabel}>Badge Skills:</span>
            {draft.skills.length > 0 ? (
              <div className={styles.reviewChips}>
                {draft.skills.map((skill) => (
                  <span key={skill} className={styles.reviewChip}>
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              <span className={styles.reviewMuted}>No skills added</span>
            )}
          </div>
          <div className={styles.reviewSkillCount}>
            <strong>{draft.skills.length}/5</strong>
            <span>skills added</span>
          </div>
        </div>
      </section>

      <section className={styles.reviewCard}>
        <div className={styles.reviewCardHeader}>
          <h3>Lesson Video</h3>
          <EditButton onClick={() => goToStep(1)} />
        </div>
        <p className={styles.reviewBadgeName}>{draft.youtubeUrl || 'No video linked'}</p>
        <h4 className={styles.reviewVideoTitle}>{draft.videoTitle || 'Untitled video'}</h4>
        <p className={styles.reviewMeta}>
          Length: <strong>{draft.videoLength || '—'}</strong>
        </p>
      </section>

      <section className={styles.reviewCard}>
        <div className={styles.reviewCardHeader}>
          <h3>Checkpoints</h3>
          <EditButton onClick={() => goToStep(2)} />
        </div>
        <p className={styles.reviewMeta}>
          # of Checkpoints: <strong>{draft.checkpoints.length}</strong>
        </p>
        <p className={styles.reviewMeta}>
          Passing threshold: <strong>{draft.passingPercent}%</strong>
        </p>

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
                  <span className={styles.cpNodeStatic} aria-hidden="true" />
                </div>
              </div>
            ))}
          </div>

          <div className={styles.checkpointMain}>
            <div
              className={styles.reviewVideoPreview}
              style={videoThumbnail ? { backgroundImage: `url(${videoThumbnail})` } : undefined}
            >
              {!videoThumbnail && <span>No video preview</span>}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.reviewCard}>
        <div className={styles.reviewCardHeader}>
          <h3>Rubric</h3>
          <EditButton onClick={() => goToStep(3)} />
        </div>

        <p className={styles.reviewGradingPrompt}>
          {draft.rubricGoal.name || <span className={styles.reviewMuted}>Untitled goal</span>}
        </p>

        <ol className={styles.reviewOrderedList}>
          {draft.rubricGoal.subgoals.map((subgoal) => {
            const subgoalTotal = subgoal.tasks.reduce((sum, task) => sum + (task.points || 0), 0);
            return (
              <li key={subgoal.id}>
                {subgoal.text || <span className={styles.reviewMuted}>Untitled subgoal</span>}{' '}
                <strong>
                  (pass at {subgoal.passThreshold} of {subgoalTotal} pts)
                </strong>
                {subgoal.tasks.length > 0 ? (
                  <ul className={styles.reviewTaskList}>
                    {subgoal.tasks.map((task) => (
                      <li key={task.id}>
                        {task.text || <span className={styles.reviewMuted}>Empty task</span>}{' '}
                        <strong>
                          ({task.points} {task.points === 1 ? 'pt' : 'pts'})
                        </strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className={styles.reviewMuted}> — no tasks</span>
                )}
              </li>
            );
          })}
        </ol>

        <div className={styles.reviewSubsectionHeader}>TA Instructions</div>
        {draft.rubricGoal.taInstructions.trim() ? (
          <div className="rte-readonly" dangerouslySetInnerHTML={{ __html: draft.rubricGoal.taInstructions }} />
        ) : (
          <p className={styles.reviewMuted}>No instructions added</p>
        )}
      </section>
    </div>
  );
}
