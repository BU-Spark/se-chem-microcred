import styles from '../page.module.css';
import { formatDisplayDate } from '../lib/badge-helpers';
import type { BadgeDraft } from '../types';

export default function ReviewStep({ draft, goToStep }: { draft: BadgeDraft; goToStep: (stepIndex: number) => void }) {
  return (
    <div className={styles.reviewStack}>
      <article className={styles.reviewCard}>
        <div className={styles.reviewCardHeader}>
          <h3>Badge Info</h3>
          <button type="button" onClick={() => goToStep(0)}>
            Edit
          </button>
        </div>
        <h4>{draft.badgeName}</h4>
        <p>{draft.badgeDescription}</p>
        <p>
          <strong>Content Available:</strong> {formatDisplayDate(draft.availableOn)} to{' '}
          {draft.neverCloses ? 'Never closes' : formatDisplayDate(draft.closesOn)}
        </p>
      </article>

      <article className={styles.reviewCard}>
        <div className={styles.reviewCardHeader}>
          <h3>Lesson Video</h3>
          <button type="button" onClick={() => goToStep(1)}>
            Edit
          </button>
        </div>
        <p>{draft.youtubeUrl}</p>
        <div className={styles.videoInfoBlock}>
          <h4>{draft.videoTitle}</h4>
          <p>Length: {draft.videoLength}</p>
        </div>
      </article>

      <article className={styles.reviewCard}>
        <div className={styles.reviewCardHeader}>
          <h3>Checkpoints</h3>
          <button type="button" onClick={() => goToStep(2)}>
            Edit
          </button>
        </div>
        <p># of Checkpoints: {draft.checkpoints.length}</p>
        <div className={styles.reviewList}>
          {draft.checkpoints.map((checkpoint) => (
            <div key={checkpoint.id} className={styles.reviewListItem}>
              <strong>{checkpoint.title}</strong>
              <span>{checkpoint.segmentLabel}</span>
              <span>{checkpoint.question}</span>
            </div>
          ))}
        </div>
      </article>

      <article className={styles.reviewCard}>
        <div className={styles.reviewCardHeader}>
          <h3>Rubric</h3>
          <button type="button" onClick={() => goToStep(3)}>
            Edit
          </button>
        </div>
        <p>{draft.rubricOverview}</p>
        <div className={styles.reviewList}>
          {draft.rubricItems.map((item, index) => (
            <div key={item.id} className={styles.reviewListItem}>
              <strong>
                {index + 1}. {item.text || 'Empty rubric item'}
              </strong>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
