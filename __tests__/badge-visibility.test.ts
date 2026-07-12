/** @jest-environment node */

import { isBadgeVisible } from '../lib/badgeVisibility';

const NOW = new Date('2026-07-12T12:00:00.000Z');
const PAST = new Date('2026-01-01T00:00:00.000Z');
const FUTURE = new Date('2026-12-31T00:00:00.000Z');

describe('isBadgeVisible', () => {
  it('is visible when no dates are set', () => {
    expect(isBadgeVisible({}, NOW)).toBe(true);
    expect(isBadgeVisible({ availableOn: null, closesOn: null, neverCloses: null }, NOW)).toBe(true);
  });

  it('hides a badge whose availableOn is in the future', () => {
    expect(isBadgeVisible({ availableOn: FUTURE }, NOW)).toBe(false);
  });

  it('shows a badge whose availableOn is in the past', () => {
    expect(isBadgeVisible({ availableOn: PAST }, NOW)).toBe(true);
  });

  it('hides a badge whose closesOn is in the past', () => {
    expect(isBadgeVisible({ availableOn: PAST, closesOn: PAST }, NOW)).toBe(false);
  });

  it('shows a badge whose closesOn is in the future', () => {
    expect(isBadgeVisible({ availableOn: PAST, closesOn: FUTURE }, NOW)).toBe(true);
  });

  it('ignores closesOn when neverCloses is true', () => {
    expect(isBadgeVisible({ availableOn: PAST, closesOn: PAST, neverCloses: true }, NOW)).toBe(true);
  });

  it('still respects availableOn even when neverCloses is true', () => {
    expect(isBadgeVisible({ availableOn: FUTURE, neverCloses: true }, NOW)).toBe(false);
  });

  it('treats the exact boundary as visible', () => {
    expect(isBadgeVisible({ availableOn: NOW, closesOn: NOW }, NOW)).toBe(true);
  });
});
