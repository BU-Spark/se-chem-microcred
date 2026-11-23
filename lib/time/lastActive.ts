export const NEVER_ACTIVE_LABEL = 'Never active';

export function hasLastActive(row: { lastActiveAt?: string | null }) {
  return typeof row.lastActiveAt === 'string' && !Number.isNaN(Date.parse(row.lastActiveAt));
}

export function formatLastActive(value?: string | null) {
  if (!value) return NEVER_ACTIVE_LABEL;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return NEVER_ACTIVE_LABEL;
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
