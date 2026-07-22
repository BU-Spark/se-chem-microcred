import { parseRosterCsv } from './csv';

describe('parseRosterCsv', () => {
  it('parses a roster with an ID column', () => {
    const csv = ['lastName,firstName,BUID,email,sections', 'Doe,Jane,U1234,jane@bu.edu,A1'].join('\n');
    expect(parseRosterCsv(csv)).toEqual([
      { lastName: 'Doe', firstName: 'Jane', externalId: 'U1234', email: 'jane@bu.edu', sections: 'A1' },
    ]);
  });

  it('requires an ID column by default (student roster)', () => {
    const csv = ['lastName,firstName,email,sections', 'Doe,Jane,jane@bu.edu,A1'].join('\n');
    expect(() => parseRosterCsv(csv)).toThrow(
      'CSV must contain headers: lastName, firstName, an ID column (e.g. BUID or Student ID), email, sections'
    );
  });

  it('allows an assessor roster with no ID column when requireId is false', () => {
    const csv = ['lastName,firstName,email,sections', 'Ta,Sam,sam@bu.edu,A1'].join('\n');
    expect(parseRosterCsv(csv, { requireId: false })).toEqual([
      { lastName: 'Ta', firstName: 'Sam', externalId: '', email: 'sam@bu.edu', sections: 'A1' },
    ]);
  });

  it('still reads the ID column for assessors when one is present', () => {
    const csv = ['lastName,firstName,BUID,email,sections', 'Ta,Sam,U9999,sam@bu.edu,A1'].join('\n');
    expect(parseRosterCsv(csv, { requireId: false })[0].externalId).toBe('U9999');
  });

  it('still requires the other headers when requireId is false', () => {
    const csv = ['lastName,firstName,sections', 'Ta,Sam,A1'].join('\n');
    expect(() => parseRosterCsv(csv, { requireId: false })).toThrow(
      'CSV must contain headers: lastName, firstName, email, sections'
    );
  });
});
