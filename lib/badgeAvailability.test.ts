import { isBadgeClosed, isLessonClosed, lessonDeadline } from './badgeAvailability';

const now = new Date('2026-08-14T12:00:00.000Z');

describe('badge availability', () => {
  it('uses Badge.closesOn as the canonical lesson deadline', () => {
    const legacy = new Date('2026-08-30T00:00:00.000Z');
    const closesOn = new Date('2026-08-20T00:00:00.000Z');
    expect(lessonDeadline(legacy, [{ closesOn, neverCloses: false }])).toEqual(closesOn);
  });

  it('honors neverCloses and legacy lesson due dates', () => {
    expect(isBadgeClosed({ closesOn: new Date('2026-08-01T00:00:00.000Z'), neverCloses: true }, now)).toBe(false);
    expect(isLessonClosed(new Date('2026-08-01T00:00:00.000Z'), [], now)).toBe(true);
  });

  it('keeps a shared lesson open while any associated badge remains open', () => {
    expect(
      isLessonClosed(
        null,
        [
          { closesOn: new Date('2026-08-01T00:00:00.000Z'), neverCloses: false },
          { closesOn: new Date('2026-08-20T00:00:00.000Z'), neverCloses: false },
        ],
        now
      )
    ).toBe(false);
  });
});
