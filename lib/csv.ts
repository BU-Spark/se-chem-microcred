// functions for CSV data
import { NewRosterMember } from '@/app/roster/page';

export function parseRosterCsv(csv: string): NewRosterMember[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) throw new Error('CSV must contain a header and at least one roster member.');

  const headers = lines[0].split(',').map((header) => header.trim().toLowerCase());

  const indexOf = (...names: string[]) => headers.findIndex((header) => names.includes(header));

  const indices = {
    lastName: indexOf('lastname'),
    firstName: indexOf('firstname'),
    buid: indexOf('buid'),
    email: indexOf('email'),
    sections: indexOf('sections', 'section'),
  };

  if (Object.values(indices).some((index) => index < 0)) {
    throw new Error('CSV must contain headers: lastName, firstName, buid, email, sections.');
  }
  return lines.slice(1).map((line) => {
    const columns = line.split(',').map((column) => column.trim());
    return {
      lastName: columns[indices.lastName] || '',
      firstName: columns[indices.firstName] || '',
      buid: columns[indices.buid] || '',
      email: columns[indices.email] || '',
      sections: columns[indices.sections] || '',
    };
  });
}
