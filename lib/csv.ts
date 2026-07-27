export type RosterCsvRow = {
  firstName: string;
  lastName: string;
  email: string;
  externalId: string;
  sections: string;
};

// Assessors (TFs) don't need a BUID, so their roster CSV may omit the ID column
// entirely — pass `{ requireId: false }` for that path. Students still require one.
export function parseRosterCsv(csv: string, { requireId = true }: { requireId?: boolean } = {}): RosterCsvRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) throw new Error('CSV must contain a header and at least one roster member.');

  const headers = lines[0].split(',').map((header) => header.trim().toLowerCase());

  const indexOf = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  // The ID column may be named anything containing "id" (BUID, Student ID, ID, …);
  // match on the normalized header so punctuation/spacing don't matter.
  const indexOfId = () => headers.findIndex((header) => header.replace(/[^a-z0-9]/g, '').includes('id'));

  const indices = {
    lastName: indexOf('lastname'),
    firstName: indexOf('firstname'),
    externalId: indexOfId(),
    email: indexOf('email'),
    sections: indexOf('sections', 'section'),
  };

  // A missing ID column leaves externalId at -1; the row mapper below turns that
  // into '' for every row, so we only need to gate the required-header check.
  const missingRequired = Object.entries(indices).some(
    ([key, index]) => index < 0 && (requireId || key !== 'externalId')
  );

  if (missingRequired) {
    throw new Error(
      requireId
        ? 'CSV must contain headers: lastName, firstName, an ID column (e.g. BUID or Student ID), email, sections'
        : 'CSV must contain headers: lastName, firstName, email, sections'
    );
  }
  return lines.slice(1).map((line) => {
    const columns = line.split(',').map((column) => column.trim());
    return {
      lastName: columns[indices.lastName] || '',
      firstName: columns[indices.firstName] || '',
      externalId: columns[indices.externalId] || '',
      email: columns[indices.email] || '',
      sections: columns[indices.sections] || '',
    };
  });
}
