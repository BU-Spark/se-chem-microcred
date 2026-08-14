import { MAX_BADGE_IMAGE_URL_LENGTH, normalizeBadgeImagePosition, normalizeBadgeImageUrl } from './badge-image';

describe('normalizeBadgeImageUrl', () => {
  it('accepts supported image data URLs and normalizes empty input', () => {
    expect(normalizeBadgeImageUrl('data:image/webp;base64,YWJj')).toBe('data:image/webp;base64,YWJj');
    expect(normalizeBadgeImageUrl('')).toBeNull();
  });

  it('rejects unsafe, unsupported, and oversized values', () => {
    expect(() => normalizeBadgeImageUrl('https://example.com/badge.png')).toThrow('Badge image must');
    expect(() => normalizeBadgeImageUrl('data:image/svg+xml;base64,YWJj')).toThrow('Badge image must');
    expect(() => normalizeBadgeImageUrl(`data:image/png;base64,${'A'.repeat(MAX_BADGE_IMAGE_URL_LENGTH)}`)).toThrow(
      'Badge image must'
    );
  });
});

describe('normalizeBadgeImagePosition', () => {
  it('rounds and clamps focal coordinates', () => {
    expect(normalizeBadgeImagePosition(24.6)).toBe(25);
    expect(normalizeBadgeImagePosition(-12)).toBe(0);
    expect(normalizeBadgeImagePosition(140)).toBe(100);
  });

  it('defaults missing or invalid coordinates to center', () => {
    expect(normalizeBadgeImagePosition(undefined)).toBe(50);
    expect(normalizeBadgeImagePosition('not-a-number')).toBe(50);
  });
});
