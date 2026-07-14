// File for frequently used functions

export function toTitleCase(text: string): string {
  return text
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function normalizeString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeSkills(skills?: string[] | null) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of skills ?? []) {
    const value = normalizeString(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= 5) break;
  }
  return result;
}

export function normalizeRichText(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const textContent = trimmed
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  const hasEmbeddedContent = /<(img|iframe|video|audio|hr)\b/i.test(trimmed);
  return textContent || hasEmbeddedContent ? trimmed : null;
}

export function parseTimeToSeconds(value?: string | null) {
  const trimmed = normalizeString(value);
  if (!trimmed) return 0;

  const parts = trimmed.split(':').map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part) || part < 0)) return 0;

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }

  if (parts.length === 1) {
    return parts[0];
  }

  return 0;
}

export function parseDate(value?: string | null) {
  const trimmed = normalizeString(value);
  if (!trimmed) return null;

  const date = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseFiniteNumber(value?: string | number | null) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const trimmed = normalizeString(value);
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}
