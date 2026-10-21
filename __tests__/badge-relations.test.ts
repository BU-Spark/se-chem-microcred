import {
  formatBadgeNameList,
  isPrerequisiteLocked,
  resolveSatisfiedBadges,
  selectableRelationIds,
  validateRelationSet,
  wouldCreateCycle,
} from '../lib/badgeRelations';

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

describe('validateRelationSet', () => {
  it('accepts a diamond: D requires both B and C, which both require A', () => {
    const edges = [
      { fromBadgeId: 'A', toBadgeId: 'B' },
      { fromBadgeId: 'A', toBadgeId: 'C' },
    ];
    expect(validateRelationSet(edges, 'D', ['B', 'C'])).toEqual({ ok: true });
  });

  it('rejects the badge itself', () => {
    expect(validateRelationSet([], 'A', ['A'])).toEqual({ ok: false, reason: 'SELF', badgeId: 'A' });
  });

  it('rejects duplicates', () => {
    expect(validateRelationSet([], 'B', ['A', 'A'])).toEqual({ ok: false, reason: 'DUPLICATE', badgeId: 'A' });
  });

  it('names the prerequisite that closes the loop', () => {
    expect(validateRelationSet(chain, 'A', ['C'])).toEqual({ ok: false, reason: 'CYCLE', badgeId: 'C' });
  });

  it('replaces the existing set rather than adding to it', () => {
    // A requiring C loops while B requires A. Once B's prerequisite is swapped
    // from A to D, the same edit is fine.
    expect(validateRelationSet(chain, 'A', ['C']).ok).toBe(false);
    expect(validateRelationSet(chain, 'B', ['D'])).toEqual({ ok: true });
    const swapped = [
      { fromBadgeId: 'D', toBadgeId: 'B' },
      { fromBadgeId: 'B', toBadgeId: 'C' },
    ];
    expect(validateRelationSet(swapped, 'A', ['C'])).toEqual({ ok: true });
  });

  it('accepts clearing every prerequisite', () => {
    expect(validateRelationSet(chain, 'B', [])).toEqual({ ok: true });
  });
});

describe('selectableRelationIds', () => {
  it('drops the badge itself and anything downstream of it', () => {
    expect(selectableRelationIds(chain, 'A', ['A', 'B', 'C', 'D'])).toEqual(['D']);
  });

  it('offers everything for a badge that does not exist yet', () => {
    expect(selectableRelationIds(chain, null, ['A', 'B'])).toEqual(['A', 'B']);
  });

  it('ignores the badge’s own current prerequisites when filtering', () => {
    expect(selectableRelationIds(chain, 'B', ['A', 'C'])).toEqual(['A']);
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

describe('outgoing relation sets (SATISFIES: Run earns Walk)', () => {
  // Sprint -> Run -> Walk
  const earns = [
    { fromBadgeId: 'Sprint', toBadgeId: 'Run' },
    { fromBadgeId: 'Run', toBadgeId: 'Walk' },
  ];

  it('accepts extending the chain from its end', () => {
    expect(validateRelationSet(earns, 'Walk', ['Crawl'], 'outgoing')).toEqual({ ok: true });
  });

  it('rejects Walk earning Sprint, which loops back through Run', () => {
    expect(validateRelationSet(earns, 'Walk', ['Sprint'], 'outgoing')).toEqual({
      ok: false,
      reason: 'CYCLE',
      badgeId: 'Sprint',
    });
  });

  it('replaces the badge’s own outgoing set rather than adding to it', () => {
    // Run currently earns Walk; swapping that to Crawl lets Walk earn Run.
    expect(validateRelationSet(earns, 'Run', ['Crawl'], 'outgoing')).toEqual({ ok: true });
    expect(validateRelationSet([{ fromBadgeId: 'Sprint', toBadgeId: 'Run' }], 'Walk', ['Run'], 'outgoing')).toEqual({
      ok: true,
    });
  });

  it('hides badges that would loop back to the edited badge', () => {
    expect(selectableRelationIds(earns, 'Walk', ['Sprint', 'Run', 'Walk', 'Crawl'], 'outgoing')).toEqual(['Crawl']);
  });
});

describe('resolveSatisfiedBadges', () => {
  const earns = [
    { fromBadgeId: 'Sprint', toBadgeId: 'Run' },
    { fromBadgeId: 'Run', toBadgeId: 'Walk' },
  ];

  it('awards the direct target', () => {
    expect(resolveSatisfiedBadges(earns, ['Run'])).toEqual(new Map([['Walk', 'Run']]));
  });

  it('follows a chain', () => {
    expect(resolveSatisfiedBadges(earns, ['Sprint'])).toEqual(
      new Map([
        ['Run', 'Sprint'],
        ['Walk', 'Run'],
      ])
    );
  });

  it('never reports a badge the student earned on their own', () => {
    expect(resolveSatisfiedBadges(earns, ['Sprint', 'Run'])).toEqual(new Map([['Walk', 'Run']]));
  });

  it('keeps a target held by another source when one source drops out', () => {
    const twoSources = [
      { fromBadgeId: 'Run', toBadgeId: 'Walk' },
      { fromBadgeId: 'Hike', toBadgeId: 'Walk' },
    ];
    expect(resolveSatisfiedBadges(twoSources, ['Hike'])).toEqual(new Map([['Walk', 'Hike']]));
  });

  it('awards nothing when nothing was earned', () => {
    expect(resolveSatisfiedBadges(earns, [])).toEqual(new Map());
  });
});
