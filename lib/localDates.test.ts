import { localDayEndIso, localDayStartIso, toLocalDateInput } from './localDates';

// Expectations are built with the local Date constructor so these pass in any TZ.
describe('localDates', () => {
  it('converts a picked day to the start of that local day', () => {
    expect(localDayStartIso('2026-10-10')).toBe(new Date(2026, 9, 10, 0, 0, 0, 0).toISOString());
  });

  it('converts a picked day to the last instant of that local day', () => {
    expect(localDayEndIso('2026-10-10')).toBe(new Date(2026, 9, 10, 23, 59, 59, 999).toISOString());
  });

  it('returns null for empty or malformed input', () => {
    expect(localDayStartIso('')).toBeNull();
    expect(localDayStartIso(null)).toBeNull();
    expect(localDayEndIso('10/10/2026')).toBeNull();
  });

  it('round-trips start and end instants back to the same local day', () => {
    expect(toLocalDateInput(localDayStartIso('2026-10-10'))).toBe('2026-10-10');
    expect(toLocalDateInput(localDayEndIso('2026-10-10'))).toBe('2026-10-10');
    // Across the November DST switch.
    expect(toLocalDateInput(localDayEndIso('2026-11-01'))).toBe('2026-11-01');
  });

  it('returns an empty string for missing or invalid instants', () => {
    expect(toLocalDateInput(null)).toBe('');
    expect(toLocalDateInput('not a date')).toBe('');
  });
});
