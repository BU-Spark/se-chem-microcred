import {
  DEFAULT_ROSTER_SORT,
  nextSort,
  sortRosterRows,
  type RosterSortKey,
  type SortableRosterRow,
} from './sortRoster';

function row(memberId: string, overrides: Partial<SortableRosterRow> = {}): SortableRosterRow {
  return {
    memberId,
    firstName: '',
    lastName: '',
    email: '',
    externalId: '',
    sectionLabel: '',
    lastActiveAt: null,
    ...overrides,
  };
}

const ids = (rows: SortableRosterRow[]) => rows.map((r) => r.memberId);

describe('sortRosterRows', () => {
  it.each<[RosterSortKey, keyof SortableRosterRow]>([
    ['lastName', 'lastName'],
    ['firstName', 'firstName'],
    ['email', 'email'],
    ['externalId', 'externalId'],
    ['section', 'sectionLabel'],
  ])('sorts %s A–Z and Z–A', (key, field) => {
    const rows = [row('b', { [field]: 'Bravo' }), row('c', { [field]: 'Charlie' }), row('a', { [field]: 'alpha' })];

    expect(ids(sortRosterRows(rows, { key, direction: 'asc' }))).toEqual(['a', 'b', 'c']);
    expect(ids(sortRosterRows(rows, { key, direction: 'desc' }))).toEqual(['c', 'b', 'a']);
  });

  it('ignores case and accents', () => {
    const rows = [row('z', { lastName: 'Zeta' }), row('e', { lastName: 'Émile' }), row('d', { lastName: 'delta' })];

    expect(ids(sortRosterRows(rows, DEFAULT_ROSTER_SORT))).toEqual(['d', 'e', 'z']);
  });

  it('orders IDs and sections numerically', () => {
    const rows = [
      row('a10', { sectionLabel: 'A10', externalId: 'U10' }),
      row('a2', { sectionLabel: 'A2', externalId: 'U9' }),
    ];

    expect(ids(sortRosterRows(rows, { key: 'section', direction: 'asc' }))).toEqual(['a2', 'a10']);
    expect(ids(sortRosterRows(rows, { key: 'externalId', direction: 'asc' }))).toEqual(['a2', 'a10']);
  });

  it('sorts last active by time, most recent first when descending', () => {
    const rows = [
      row('old', { lastActiveAt: '2026-01-01T00:00:00.000Z' }),
      row('new', { lastActiveAt: '2026-11-19T00:00:00.000Z' }),
      row('mid', { lastActiveAt: '2026-06-01T00:00:00.000Z' }),
    ];

    expect(ids(sortRosterRows(rows, { key: 'lastActive', direction: 'desc' }))).toEqual(['new', 'mid', 'old']);
    expect(ids(sortRosterRows(rows, { key: 'lastActive', direction: 'asc' }))).toEqual(['old', 'mid', 'new']);
  });

  it('sorts progress by badges done, fewer failures first among ties, unloaded rows last', () => {
    const rows = [
      row('low', { progressDone: 1, progressFailed: 0 }),
      row('unknown', { progressDone: null }),
      row('high-failed', { progressDone: 3, progressFailed: 2 }),
      row('high-clean', { progressDone: 3, progressFailed: 0 }),
    ];

    expect(ids(sortRosterRows(rows, { key: 'progress', direction: 'desc' }))).toEqual([
      'high-clean',
      'high-failed',
      'low',
      'unknown',
    ]);
    expect(ids(sortRosterRows(rows, { key: 'progress', direction: 'asc' }))).toEqual([
      'low',
      'high-failed',
      'high-clean',
      'unknown',
    ]);
    expect(nextSort(DEFAULT_ROSTER_SORT, 'progress')).toEqual({ key: 'progress', direction: 'desc' });
  });

  it('puts missing values last in both directions without throwing', () => {
    const rows = [
      row('never', { lastName: 'A', lastActiveAt: null }),
      row('bad', { lastName: 'B', lastActiveAt: 'not-a-date' }),
      row('seen', { lastName: 'C', lastActiveAt: '2026-11-19T00:00:00.000Z' }),
      row('blank', { lastName: '  ', lastActiveAt: undefined }),
    ];

    for (const direction of ['asc', 'desc'] as const) {
      expect(sortRosterRows(rows, { key: 'lastActive', direction })[0].memberId).toBe('seen');
      expect(sortRosterRows(rows, { key: 'lastName', direction }).at(-1)?.memberId).toBe('blank');
    }
  });

  it('breaks ties by last name, then first name, then email', () => {
    const rows = [
      row('3', { sectionLabel: 'A1', lastName: 'Lee', firstName: 'Sam', email: 'z@bu.edu' }),
      row('2', { sectionLabel: 'A1', lastName: 'Lee', firstName: 'Sam', email: 'a@bu.edu' }),
      row('1', { sectionLabel: 'A1', lastName: 'Lee', firstName: 'Ann' }),
      row('0', { sectionLabel: 'A1', lastName: 'Kim' }),
    ];

    expect(ids(sortRosterRows(rows, { key: 'section', direction: 'asc' }))).toEqual(['0', '1', '2', '3']);
    // Ties stay A–Z even when the primary column is descending.
    expect(ids(sortRosterRows(rows, { key: 'section', direction: 'desc' }))).toEqual(['0', '1', '2', '3']);
  });

  it('returns a sorted copy of a large roster without mutating the input', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => row(`m${i}`, { lastName: `Student ${(i * 7919) % 1000}` }));
    const before = ids(rows);

    const sorted = sortRosterRows(rows, DEFAULT_ROSTER_SORT);

    expect(ids(rows)).toEqual(before);
    expect(sorted).not.toBe(rows);
    expect(sorted.map((r) => r.lastName)).toEqual(Array.from({ length: 1000 }, (_, i) => `Student ${i}`));
  });
});

describe('nextSort', () => {
  it('flips direction when the same column is clicked again', () => {
    expect(nextSort(DEFAULT_ROSTER_SORT, 'lastName')).toEqual({ key: 'lastName', direction: 'desc' });
    expect(nextSort({ key: 'lastName', direction: 'desc' }, 'lastName')).toEqual({ key: 'lastName', direction: 'asc' });
  });

  it('starts text columns A–Z and Last Logon at most recent', () => {
    expect(nextSort(DEFAULT_ROSTER_SORT, 'email')).toEqual({ key: 'email', direction: 'asc' });
    expect(nextSort({ key: 'email', direction: 'desc' }, 'firstName')).toEqual({ key: 'firstName', direction: 'asc' });
    expect(nextSort(DEFAULT_ROSTER_SORT, 'lastActive')).toEqual({ key: 'lastActive', direction: 'desc' });
  });
});
