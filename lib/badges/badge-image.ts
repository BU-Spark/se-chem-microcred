const BADGE_IMAGE_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export const MAX_BADGE_IMAGE_URL_LENGTH = 1_500_000;
export class BadgeImageValidationError extends Error {}

export function normalizeBadgeImagePosition(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 50;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

export function normalizeBadgeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const imageUrl = value.trim();
  if (imageUrl.length > MAX_BADGE_IMAGE_URL_LENGTH || !BADGE_IMAGE_PATTERN.test(imageUrl)) {
    throw new BadgeImageValidationError('Badge image must be a PNG, JPEG, or WebP image no larger than 1 MB.');
  }
  return imageUrl;
}
