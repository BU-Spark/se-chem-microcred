// Issue #329: a column header that sorts its table. Shared by the course roster
// and the badge roster so both sort the same way.
import type { RosterSort, RosterSortKey } from '@/lib/roster/sortRoster';

import styles from './SortableHeader.module.css';

// Small stacked arrows; the current direction's arrow is highlighted.
function SortArrows({ direction }: { direction: 'asc' | 'desc' | null }) {
  return (
    <svg className={styles.sortArrows} viewBox="0 0 8 12" width="8" height="12" aria-hidden="true">
      <path d="M4 0 8 5H0z" data-active={direction === 'asc' || undefined} />
      <path d="M4 12 0 7h8z" data-active={direction === 'desc' || undefined} />
    </svg>
  );
}

export default function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: RosterSortKey;
  sort: RosterSort;
  onSort: (key: RosterSortKey) => void;
}) {
  const direction = sort.key === sortKey ? sort.direction : null;
  const ariaSort = direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none';

  return (
    <th scope="col" aria-sort={ariaSort}>
      <button type="button" className={styles.sortButton} onClick={() => onSort(sortKey)}>
        {label}
        <SortArrows direction={direction} />
      </button>
    </th>
  );
}
