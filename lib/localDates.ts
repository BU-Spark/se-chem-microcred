// Badge availability is picked as a calendar day (YYYY-MM-DD) in the browser but
// stored as an instant. These helpers convert between the two in the viewer's
// LOCAL timezone, so "Closes Oct 10" means through 11:59 PM Oct 10 where the
// instructor is, rather than UTC midnight (8 PM the day before on the East Coast).
// Browser-only in practice: the server has no idea what the user's timezone is.

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDay(value: string) {
  const match = DATE_ONLY.exec(value.trim());
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

// First instant of the local day — used for "available on".
export function localDayStartIso(value?: string | null) {
  const parts = value ? parseDay(value) : null;
  if (!parts) return null;
  return new Date(parts.year, parts.month, parts.day, 0, 0, 0, 0).toISOString();
}

// Last instant of the local day (23:59:59.999) — used for "closes on", which is
// inclusive of the chosen date.
export function localDayEndIso(value?: string | null) {
  const parts = value ? parseDay(value) : null;
  if (!parts) return null;
  return new Date(parts.year, parts.month, parts.day, 23, 59, 59, 999).toISOString();
}

// Stored instant -> local YYYY-MM-DD for the date picker.
export function toLocalDateInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
