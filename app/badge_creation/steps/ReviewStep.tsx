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

        <ol className={styles.reviewOrderedList}>
          {draft.rubricItems.map((item) => (
            <li key={item.id}>{item.text || <span className={styles.reviewMuted}>Empty rubric item</span>}</li>
          ))}
        </ol>

        {draft.rubricCriteria.some(
          (criterion) => criterion.prompt.trim() || criterion.options.some((o) => o.trim())
        ) && (
          <div className={styles.reviewGrading}>
            <h4 className={styles.reviewSubheading}>Instructor Grading</h4>
            {draft.rubricCriteria.map((criterion, criterionIndex) => (
              <div key={criterion.id} className={styles.reviewGradingCriterion}>
                <p className={styles.reviewGradingPrompt}>{criterion.prompt || `Criterion ${criterionIndex + 1}`}</p>
                <div className={styles.reviewGradingGrid}>
                  {criterion.options.map((option, optionIndex) => {
                    const feedback = criterion.optionFeedback[optionIndex]?.trim();
                    if (!option.trim() && !feedback) return null;
                    return (
                      <div key={`${criterion.id}-${optionIndex}`} className={styles.reviewGradingRow}>
                        <div className={styles.reviewGradingOption}>
                          <span className={styles.gradingCheckbox} aria-hidden="true" />
                          <span>{option || <span className={styles.reviewMuted}>—</span>}</span>
                        </div>
                        <div className={styles.reviewGradingOption}>
                          <span
                            className={`${styles.gradingCheckbox} ${feedback ? styles.gradingCheckboxFilled : ''}`}
                            aria-hidden="true"
                          />
                          <span className={styles.reviewFeedbackText}>
                            {feedback || <span className={styles.reviewMuted}>No prewritten feedback</span>}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
