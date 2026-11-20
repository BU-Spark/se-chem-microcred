import { formatLastActive, hasLastActive, NEVER_ACTIVE_LABEL } from './lastActive';

describe('hasLastActive', () => {
  it('is true when the user row carries a timestamp', () => {
    expect(hasLastActive({ lastActiveAt: '2026-11-19T15:30:00.000Z' })).toBe(true);
  });

  it('is false when the timestamp is missing, null or unparseable', () => {
    expect(hasLastActive({})).toBe(false);
    expect(hasLastActive({ lastActiveAt: null })).toBe(false);
    expect(hasLastActive({ lastActiveAt: '' })).toBe(false);
    expect(hasLastActive({ lastActiveAt: 'not-a-date' })).toBe(false);
  });
});

describe('formatLastActive', () => {
  it('falls back to "Never active" without a usable timestamp', () => {
    expect(formatLastActive(null)).toBe(NEVER_ACTIVE_LABEL);
    expect(formatLastActive(undefined)).toBe(NEVER_ACTIVE_LABEL);
    expect(formatLastActive('not-a-date')).toBe(NEVER_ACTIVE_LABEL);
  });

  it('renders a readable local date and time', () => {
    const iso = '2026-11-19T15:30:00.000Z';
    expect(formatLastActive(iso)).toBe(
      new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    );
    expect(formatLastActive(iso)).toMatch(/2026/);
  });
});
