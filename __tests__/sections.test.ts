import { sectionKey, uniqueSections, unifySectionSpellings } from '../lib/sections';

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
