const BADGE_IMAGE_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export const MAX_BADGE_IMAGE_URL_LENGTH = 1_500_000;
export class BadgeImageValidationError extends Error {}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeBadgeImagePosition(value: unknown): number {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return 50;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

// Defaults for badge images
export const MIN_BADGE_IMAGE_SCALE = 100;
export const MAX_BADGE_IMAGE_SCALE = 300;
export const DEFAULT_BADGE_IMAGE_SCALE = 115;

export function normalizeBadgeImageScale(value: unknown): number {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return DEFAULT_BADGE_IMAGE_SCALE;
  return Math.min(MAX_BADGE_IMAGE_SCALE, Math.max(MIN_BADGE_IMAGE_SCALE, Math.round(numeric)));
}

export function normalizeBadgeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const imageUrl = value.trim();
  if (imageUrl.length > MAX_BADGE_IMAGE_URL_LENGTH || !BADGE_IMAGE_PATTERN.test(imageUrl)) {
    throw new BadgeImageValidationError('Badge image must be a PNG, JPEG, or WebP image no larger than 1 MB.');
  }
  return imageUrl;
}
