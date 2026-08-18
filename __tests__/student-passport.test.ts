import { derivePassportNumber, formatPassportDate } from '@/lib/students/passport';

describe('derivePassportNumber', () => {
  it('is stable for the same student id', () => {
    expect(derivePassportNumber('student-1')).toBe(derivePassportNumber('student-1'));
  });

  it('formats as CHKD-####-#### with zero padding', () => {
    expect(derivePassportNumber('student-1')).toMatch(/^CHKD-\d{4}-\d{4}$/);
  });

  it('separates neighbouring ids', () => {
    expect(derivePassportNumber('student-1')).not.toBe(derivePassportNumber('student-2'));
  });

  it('returns null without a student id', () => {
    expect(derivePassportNumber(null)).toBeNull();
    expect(derivePassportNumber('')).toBeNull();
  });
});

describe('formatPassportDate', () => {
  it('renders day, short month and year', () => {
    // Built at local noon so the assertion holds in any TZ — the formatter reads
    // the instant in the viewer's own timezone, like the rest of the app.
    const localNoon = new Date(2025, 8, 4, 12).toISOString();
    expect(formatPassportDate(localNoon)).toBe('04 Sep 2025');
  });

  it('reads a bare YYYY-MM-DD as a local calendar day', () => {
    // As an instant this is UTC midnight, which prints as the 14th anywhere
    // behind UTC. A date picked off a calendar must not drift.
    expect(formatPassportDate('2026-01-15')).toBe('15 Jan 2026');
  });

  it('returns null for missing or unparseable values', () => {
    expect(formatPassportDate(null)).toBeNull();
    expect(formatPassportDate('not-a-date')).toBeNull();
  });
});
