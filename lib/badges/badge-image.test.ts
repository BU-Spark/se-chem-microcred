import {
  DEFAULT_BADGE_IMAGE_SCALE,
  MAX_BADGE_IMAGE_SCALE,
  MAX_BADGE_IMAGE_URL_LENGTH,
  MIN_BADGE_IMAGE_SCALE,
  normalizeBadgeImagePosition,
  normalizeBadgeImageScale,
  normalizeBadgeImageUrl,
} from './badge-image';

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

  // null/'' coerce to a finite 0, which used to clamp to the bottom of the range
  // and pin the artwork to the top-left instead of centering it.
  it('treats an absent value as missing rather than as zero', () => {
    expect(normalizeBadgeImagePosition(null)).toBe(50);
    expect(normalizeBadgeImagePosition('')).toBe(50);
  });
});

describe('normalizeBadgeImageScale (#247)', () => {
  it('defaults to the legacy fixed crop when the value is absent or unusable', () => {
    expect(normalizeBadgeImageScale(undefined)).toBe(DEFAULT_BADGE_IMAGE_SCALE);
    expect(normalizeBadgeImageScale(null)).toBe(DEFAULT_BADGE_IMAGE_SCALE);
    expect(normalizeBadgeImageScale('not a number')).toBe(DEFAULT_BADGE_IMAGE_SCALE);
    expect(normalizeBadgeImageScale(Number.NaN)).toBe(DEFAULT_BADGE_IMAGE_SCALE);
    expect(normalizeBadgeImageScale('')).toBe(DEFAULT_BADGE_IMAGE_SCALE);
  });

  it('clamps below 100, which would pull the image off the edge of the circle', () => {
    expect(normalizeBadgeImageScale(10)).toBe(MIN_BADGE_IMAGE_SCALE);
    expect(normalizeBadgeImageScale(-500)).toBe(MIN_BADGE_IMAGE_SCALE);
  });

  it('clamps above the usable maximum', () => {
    expect(normalizeBadgeImageScale(10_000)).toBe(MAX_BADGE_IMAGE_SCALE);
  });

  it('accepts a numeric string and rounds it', () => {
    expect(normalizeBadgeImageScale('142.6')).toBe(143);
  });
});
