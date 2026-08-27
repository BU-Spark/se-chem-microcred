export type RosterCsvRow = {
  firstName: string;
  lastName: string;
  email: string;
  externalId: string;
  sections: string;
};

// Checkers (TFs) don't need a BUID, so their roster CSV may omit the ID column
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

// ---------------------------------------------------------------------------
// Writing CSVs. Shared by the course-wide export button
// (app/components/Export/ExportToCsv.tsx) and the per-badge roster export on the
// badge detail page.
// ---------------------------------------------------------------------------

/** Wrap a value in quotes and escape embedded quotes per RFC 4180. */
export function toCsvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Rows must share a key set; the first row's keys become the header. */
export function buildCsv(rows: Record<string, string>[]) {
  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]);
  const headerLine = headers.map(toCsvCell).join(',');
  const dataLines = rows.map((row) => headers.map((header) => toCsvCell(row[header] ?? '')).join(','));

  return [headerLine, ...dataLines].join('\n');
}

export function downloadCsv(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * `<name>_YYYY-MM-DD_HH-MM-SS.csv`, matching the course export. Local time, and
 * colons are illegal in filenames so the clock uses dashes.
 */
export function csvFilename(name: string, now = new Date()) {
  const safeName = name.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'export';
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

  return `${safeName}_${date}_${time}.csv`;
}
