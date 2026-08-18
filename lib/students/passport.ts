/**
 * Identity strip for the Badge Passport (/badges).
 *
 * The passport header shows a passport number and an issue date. Neither is a
 * stored column: the number is derived from the student's id and the date is
 * the student's `createdAt`. Deriving keeps the header honest (same student =>
 * same number, forever) without a schema migration. If a real passport number
 * is ever persisted, swap the call site and delete `derivePassportNumber`.
 */

const PASSPORT_PREFIX = 'CHKD';

/**
 * FNV-1a (32-bit). Chosen for being short, dependency-free and stable across
 * runtimes — the number must not change between server and client renders.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply, kept in range via Math.imul.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * A stable display code for a student, e.g. `CHKD-8842-0193`.
 *
 * Two hashes over different salts give the two groups, so neighbouring student
 * ids don't produce visually adjacent codes. This is a display label, not a
 * secret or a lookup key — never authenticate or query on it.
 */
export function derivePassportNumber(studentId?: string | null): string | null {
  if (!studentId) return null;

  const left = fnv1a(`checkd:passport:${studentId}`) % 10000;
  const right = fnv1a(`${studentId}:passport:checkd`) % 10000;

  return `${PASSPORT_PREFIX}-${String(left).padStart(4, '0')}-${String(right).padStart(4, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `2025-09-04T…` -> `04 Sep 2025`. Returns null for missing/unparseable input so
 * callers can drop the line rather than print a placeholder date.
 *
 * A bare `YYYY-MM-DD` is read as a local calendar day, not an instant. `new
 * Date('2026-01-15')` is UTC midnight, which prints as the 14th for any viewer
 * behind UTC — wrong for a date the user picked off a calendar. Timestamps that
 * carry a time are still instants and render in the viewer's timezone.
 */
export function formatPassportDate(value?: string | null): string | null {
  if (!value) return null;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
