import {
  formatAttemptCount,
  formatSnapshotGrade,
  SNAPSHOT_STATE_LABEL,
  SNAPSHOT_STATES,
  type SnapshotBadge,
  type SnapshotCell,
  type SnapshotState,
} from '@/lib/roster/badgeSnapshot';

import styles from '../page.module.css';

const STATE_CLASS: Record<SnapshotState, string> = {
  done: styles.snapshotDone,
  progress: styles.snapshotProgress,
  failed: styles.snapshotFailed,
  not_started: styles.snapshotNotStarted,
};

const NOT_STARTED: SnapshotCell = { state: 'not_started', attempts: 0, latest: null };

/** One compact chip per course badge: status square, name, latest grade, attempts. */
export default function BadgeSnapshotStrip({
  badges,
  cells,
}: {
  badges: readonly SnapshotBadge[];
  cells: readonly SnapshotCell[] | undefined;
}) {
  if (badges.length === 0) {
    return <span className={styles.snapshotEmpty}>This course has no badges yet.</span>;
  }

  return (
    <ul className={styles.snapshotList} aria-label="Badge progress">
      {badges.map((badge, index) => {
        const cell = cells?.[index] ?? NOT_STARTED;
        const grade = formatSnapshotGrade(cell);
        const attempts = formatAttemptCount(cell.attempts);
        const label = [
          `${badge.name}: ${SNAPSHOT_STATE_LABEL[cell.state]}`,
          cell.latest ? `latest ${grade}` : null,
          attempts,
        ]
          .filter(Boolean)
          .join(', ');
        return (
          <li
            key={badge.id}
            className={styles.snapshotChip}
            title={label}
            aria-label={label}
            data-state={cell.state}
            data-graded={cell.latest ? 'true' : 'false'}
          >
            <span className={`${styles.snapshotSquare} ${STATE_CLASS[cell.state]}`} aria-hidden="true" />
            <span className={styles.snapshotChipName} aria-hidden="true">
              {badge.name}
            </span>
            <span className={styles.snapshotChipGrade} aria-hidden="true">
              {grade}
            </span>
            {attempts ? (
              <span className={styles.snapshotChipMeta} aria-hidden="true">
                {attempts}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function BadgeSnapshotLegend() {
  return (
    <ul className={styles.snapshotLegend} aria-label="Badge progress legend">
      {SNAPSHOT_STATES.map((state) => (
        <li key={state}>
          <span className={`${styles.snapshotSquare} ${STATE_CLASS[state]}`} aria-hidden="true" />
          {SNAPSHOT_STATE_LABEL[state]}
        </li>
      ))}
    </ul>
  );
}
