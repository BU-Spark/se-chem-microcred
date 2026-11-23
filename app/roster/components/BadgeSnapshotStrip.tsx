import {
  SNAPSHOT_STATE_LABEL,
  SNAPSHOT_STATES,
  type SnapshotBadge,
  type SnapshotState,
} from '@/lib/roster/badgeSnapshot';

import styles from '../page.module.css';

const STATE_CLASS: Record<SnapshotState, string> = {
  done: styles.snapshotDone,
  progress: styles.snapshotProgress,
  failed: styles.snapshotFailed,
  not_started: styles.snapshotNotStarted,
};

export default function BadgeSnapshotStrip({
  badges,
  states,
}: {
  badges: readonly SnapshotBadge[];
  states: readonly SnapshotState[] | undefined;
}) {
  if (badges.length === 0) {
    return <span className={styles.snapshotEmpty}>This course has no badges yet.</span>;
  }

  return (
    <ul className={styles.snapshotStrip} aria-label="Badge progress">
      {badges.map((badge, index) => {
        const state = states?.[index] ?? 'not_started';
        const label = `${badge.name}: ${SNAPSHOT_STATE_LABEL[state]}`;
        return (
          <li
            key={badge.id}
            className={`${styles.snapshotSquare} ${STATE_CLASS[state]}`}
            title={label}
            aria-label={label}
            data-state={state}
          />
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
