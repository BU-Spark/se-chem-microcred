import {
  sectionKey,
  sharesSectionWith,
  uniqueSections,
  unifySectionSpellings,
  visibleEnrollmentsFor,
} from '../lib/sections';

describe('section name helpers', () => {
  it('compares names trimmed and case-insensitively', () => {
    expect(sectionKey('  Lab A1 ')).toBe('lab a1');
  });

  it('dedupes by key, keeping the first trimmed spelling and dropping blanks', () => {
    expect(uniqueSections(['A1 ', 'a1', '  ', 'B2', 'b2'])).toEqual(['A1', 'B2']);
  });

  it('gives every list the first spelling seen across all of them', () => {
    expect(unifySectionSpellings([['A1'], ['a1 ', 'b2'], ['B2', 'A1']])).toEqual([['A1'], ['A1', 'b2'], ['b2', 'A1']]);
  });

  it('collapses one list that repeats a name in different cases', () => {
    expect(unifySectionSpellings([['A1', 'a1']])).toEqual([['A1']]);
  });
});

describe('roster visibility', () => {
  const enrollment = (
    studentId: string,
    role: 'STUDENT' | 'INSTRUCTOR' | 'CHECKER',
    sections: string[],
    status: 'ACTIVE' | 'PENDING' = 'ACTIVE'
  ) => ({ studentId, role, status, sections });

  const ENROLLMENTS = [
    enrollment('checker-a', 'CHECKER', ['A1']),
    enrollment('checker-b', 'CHECKER', ['B1']),
    enrollment('pending', 'CHECKER', [], 'PENDING'),
    enrollment('ada', 'STUDENT', ['A1']),
    enrollment('grace', 'STUDENT', ['B1']),
    enrollment('alan', 'STUDENT', []),
  ];
  const ids = (rows: Array<{ studentId: string }>) => rows.map((row) => row.studentId);

  it('treats unsectioned members as visible to everyone', () => {
    expect(sharesSectionWith(['A1'], [])).toBe(true);
    expect(sharesSectionWith(['A1'], ['B1', 'A1'])).toBe(true);
    expect(sharesSectionWith(['A1'], ['B1'])).toBe(false);
    expect(sharesSectionWith([], ['B1'])).toBe(false);
  });

  it('shows instructors every enrollment, pending requests included', () => {
    const rows = visibleEnrollmentsFor(ENROLLMENTS, {
      userId: 'prof',
      role: 'INSTRUCTOR',
      allowCrossSectionView: false,
    });
    expect(ids(rows)).toEqual(ids(ENROLLMENTS));
  });

  it('limits a section-scoped checker to their own students and hides pending requests', () => {
    const rows = visibleEnrollmentsFor(ENROLLMENTS, {
      userId: 'checker-a',
      role: 'CHECKER',
      allowCrossSectionView: false,
    });
    expect(ids(rows)).toEqual(['checker-a', 'checker-b', 'ada', 'alan']);
  });

  it('shows every active student to a checker when cross-section view is allowed', () => {
    const rows = visibleEnrollmentsFor(ENROLLMENTS, {
      userId: 'checker-a',
      role: 'CHECKER',
      allowCrossSectionView: true,
    });
    expect(ids(rows)).toEqual(['checker-a', 'checker-b', 'ada', 'grace', 'alan']);
  });

  it('shows a checker with no sections only unsectioned students', () => {
    const rows = visibleEnrollmentsFor([enrollment('checker-x', 'CHECKER', []), ...ENROLLMENTS.slice(3)], {
      userId: 'checker-x',
      role: 'CHECKER',
      allowCrossSectionView: false,
    });
    expect(ids(rows)).toEqual(['checker-x', 'alan']);
  });
});
