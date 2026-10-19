import {
  formatBadgeNameList,
  isPrerequisiteLocked,
  selectablePrerequisiteIds,
  validatePrerequisiteSet,
  wouldCreateCycle,
} from '../lib/badgePrerequisites';

// A -> B -> C
const chain = [
  { fromBadgeId: 'A', toBadgeId: 'B' },
  { fromBadgeId: 'B', toBadgeId: 'C' },
];

describe('wouldCreateCycle', () => {
  it('rejects a self-loop', () => {
    expect(wouldCreateCycle([], 'A', 'A')).toBe(true);
  });

  it('rejects closing a two-node loop', () => {
    expect(wouldCreateCycle([{ fromBadgeId: 'A', toBadgeId: 'B' }], 'B', 'A')).toBe(true);
  });

  it('rejects A relying on C when C relies on B and B relies on A', () => {
    expect(wouldCreateCycle(chain, 'C', 'A')).toBe(true);
  });

  it('allows extending the chain', () => {
    expect(wouldCreateCycle(chain, 'C', 'D')).toBe(false);
    expect(wouldCreateCycle(chain, 'A', 'C')).toBe(false);
  });
});

describe('validatePrerequisiteSet', () => {
  it('accepts a diamond: D requires both B and C, which both require A', () => {
    const edges = [
      { fromBadgeId: 'A', toBadgeId: 'B' },
      { fromBadgeId: 'A', toBadgeId: 'C' },
    ];
    expect(validatePrerequisiteSet(edges, 'D', ['B', 'C'])).toEqual({ ok: true });
  });

  it('rejects the badge itself', () => {
    expect(validatePrerequisiteSet([], 'A', ['A'])).toEqual({ ok: false, reason: 'SELF', badgeId: 'A' });
  });

  it('rejects duplicates', () => {
    expect(validatePrerequisiteSet([], 'B', ['A', 'A'])).toEqual({ ok: false, reason: 'DUPLICATE', badgeId: 'A' });
  });

  it('names the prerequisite that closes the loop', () => {
    expect(validatePrerequisiteSet(chain, 'A', ['C'])).toEqual({ ok: false, reason: 'CYCLE', badgeId: 'C' });
  });

  it('replaces the existing set rather than adding to it', () => {
    // A requiring C loops while B requires A. Once B's prerequisite is swapped
    // from A to D, the same edit is fine.
    expect(validatePrerequisiteSet(chain, 'A', ['C']).ok).toBe(false);
    expect(validatePrerequisiteSet(chain, 'B', ['D'])).toEqual({ ok: true });
    const swapped = [
      { fromBadgeId: 'D', toBadgeId: 'B' },
      { fromBadgeId: 'B', toBadgeId: 'C' },
    ];
    expect(validatePrerequisiteSet(swapped, 'A', ['C'])).toEqual({ ok: true });
  });

  it('accepts clearing every prerequisite', () => {
    expect(validatePrerequisiteSet(chain, 'B', [])).toEqual({ ok: true });
  });
});

describe('selectablePrerequisiteIds', () => {
  it('drops the badge itself and anything downstream of it', () => {
    expect(selectablePrerequisiteIds(chain, 'A', ['A', 'B', 'C', 'D'])).toEqual(['D']);
  });

  it('offers everything for a badge that does not exist yet', () => {
    expect(selectablePrerequisiteIds(chain, null, ['A', 'B'])).toEqual(['A', 'B']);
  });

  it('ignores the badge’s own current prerequisites when filtering', () => {
    expect(selectablePrerequisiteIds(chain, 'B', ['A', 'C'])).toEqual(['A']);
  });
});

describe('isPrerequisiteLocked', () => {
  it('locks a student who has not started and has unmet prerequisites', () => {
    expect(isPrerequisiteLocked({ unmetCount: 1, started: false })).toBe(true);
  });

  it('grandfathers a student who already started', () => {
    expect(isPrerequisiteLocked({ unmetCount: 2, started: true })).toBe(false);
  });

  it('unlocks once every prerequisite is met', () => {
    expect(isPrerequisiteLocked({ unmetCount: 0, started: false })).toBe(false);
  });
});

describe('formatBadgeNameList', () => {
  it('joins names readably', () => {
    expect(formatBadgeNameList(['A'])).toBe('A');
    expect(formatBadgeNameList(['A', 'B'])).toBe('A and B');
    expect(formatBadgeNameList(['A', 'B', 'C'])).toBe('A, B, and C');
  });
});
