import { formatFullName, generateInitials, getNameForProfile, resolveName, splitName } from './name';

describe('resolveName (#258)', () => {
  it('prefers the stored parts over guessing at the joined name', () => {
    expect(resolveName({ name: 'Kaylin Von Bergen', firstName: 'Kaylin', lastName: 'Von Bergen' })).toEqual({
      first: 'Kaylin',
      last: 'Von Bergen',
      isFallback: false,
    });
  });

  it('falls back to splitting the joined name when the columns are empty', () => {
    expect(resolveName({ name: 'Jane Doe' })).toEqual(splitName('Jane Doe'));
  });

  it('keeps a mononym rather than treating a missing surname as a gap', () => {
    expect(resolveName({ name: 'Prince', firstName: 'Prince', lastName: null })).toEqual({
      first: 'Prince',
      last: '',
      isFallback: false,
    });
  });

  it('reports a fallback for a person with no name at all', () => {
    expect(resolveName({}).isFallback).toBe(true);
    expect(resolveName(null).isFallback).toBe(true);
  });

  it('ignores whitespace-only column values', () => {
    expect(resolveName({ name: 'Jane Doe', firstName: '  ', lastName: '  ' })).toEqual(splitName('Jane Doe'));
  });
});

describe('formatFullName (#258)', () => {
  it('rebuilds the full name from the stored parts', () => {
    expect(formatFullName({ name: 'stale', firstName: 'Kaylin', lastName: 'Von Bergen' })).toBe('Kaylin Von Bergen');
  });

  it('omits the separator when there is no surname', () => {
    expect(formatFullName({ firstName: 'Prince' })).toBe('Prince');
  });
});

describe('display helpers accept a person or a bare name (#258)', () => {
  const person = { name: 'Kaylin Von Bergen', firstName: 'Kaylin', lastName: 'Von Bergen' };

  it('renders the profile headline from the stored surname', () => {
    expect(getNameForProfile(person)).toEqual({
      headlineTop: 'Von Bergen,',
      headlineBottom: 'Kaylin',
      initials: 'KV',
    });
  });

  it('still accepts the bare joined name it was originally called with', () => {
    expect(getNameForProfile('Jane Doe')).toEqual(getNameForProfile({ name: 'Jane Doe' }));
  });

  it('takes initials from the real surname, not the last word of the first name', () => {
    expect(generateInitials(person)).toBe('KV');
    // The legacy path can only guess, and guesses wrong -- which is the bug itself.
    expect(generateInitials('Kaylin Von Bergen')).toBe('KB');
  });
});
