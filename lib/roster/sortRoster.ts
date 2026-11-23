export type RosterSortKey = 'lastName' | 'firstName' | 'externalId' | 'email' | 'lastActive' | 'section' | 'progress';
export type RosterSortDirection = 'asc' | 'desc';
export type RosterSort = { key: RosterSortKey; direction: RosterSortDirection };

export type SortableRosterRow = {
  memberId: string;
  firstName: string;
  lastName: string;
  email: string;
  externalId: string;
  sectionLabel: string;
  lastActiveAt?: string | null;
  progressDone?: number | null;
  progressFailed?: number | null;
};

export const DEFAULT_ROSTER_SORT: RosterSort = { key: 'lastName', direction: 'asc' };

// Text columns start A–Z; Last Logon starts with the most recent.
export const FIRST_CLICK_DIRECTION: Record<RosterSortKey, RosterSortDirection> = {
  lastName: 'asc',
  firstName: 'asc',
  externalId: 'asc',
  email: 'asc',
  section: 'asc',
  lastActive: 'desc',
  progress: 'desc',
};

// Case- and accent-insensitive, and numeric-aware so "A2" < "A10" and "U9" < "U10".
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

type SortValue = string | number | null;

function keyFor(row: SortableRosterRow, key: RosterSortKey): SortValue {
  if (key === 'progress') {
    if (row.progressDone == null) return null;
    // Most badges done first; among equals, fewer failures rank higher.
    return row.progressDone * 10_000 - (row.progressFailed ?? 0);
  }
  if (key === 'lastActive') {
    const time = row.lastActiveAt ? Date.parse(row.lastActiveAt) : NaN;
    return Number.isNaN(time) ? null : time;
  }
  const value = (key === 'section' ? row.sectionLabel : row[key])?.trim();
  return value ? value : null;
}

function compareValues(a: string | number, b: string | number) {
  return typeof a === 'number' && typeof b === 'number' ? a - b : collator.compare(String(a), String(b));
}

/** Returns a sorted copy. Missing values always sort last, whichever the direction. */
export function sortRosterRows<T extends SortableRosterRow>(rows: readonly T[], sort: RosterSort): T[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  const decorated = rows.map((row) => ({
    row,
    key: keyFor(row, sort.key),
    // Tie-breakers stay A–Z so ties read naturally in either direction.
    ties: [row.lastName, row.firstName, row.email, row.memberId],
  }));

  decorated.sort((a, b) => {
    if (a.key === null || b.key === null) {
      if (a.key !== b.key) return a.key === null ? 1 : -1;
    } else {
      const primary = compareValues(a.key, b.key) * sign;
      if (primary !== 0) return primary;
    }
    for (let i = 0; i < a.ties.length; i += 1) {
      const tie = collator.compare(a.ties[i], b.ties[i]);
      if (tie !== 0) return tie;
    }
    return 0;
  });

  return decorated.map((entry) => entry.row);
}

/** Same column flips direction; a new column starts at its first-click direction. */
export function nextSort(current: RosterSort, key: RosterSortKey): RosterSort {
  if (current.key === key) return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  return { key, direction: FIRST_CLICK_DIRECTION[key] };
}
