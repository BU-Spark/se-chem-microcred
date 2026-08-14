import { badgeImageOutputDimensions } from './badge-image';

describe('badgeImageOutputDimensions', () => {
  it('preserves a landscape image aspect ratio while resizing', () => {
    expect(badgeImageOutputDimensions(1600, 900)).toEqual({ width: 512, height: 288 });
  });

  it('preserves a portrait image aspect ratio while resizing', () => {
    expect(badgeImageOutputDimensions(900, 1600)).toEqual({ width: 288, height: 512 });
  });

  it('does not enlarge a smaller source image', () => {
    expect(badgeImageOutputDimensions(320, 180)).toEqual({ width: 320, height: 180 });
  });
});
