import { buildLessonOutline, deriveTotalSeconds, formatDuration } from '@/lib/lessonOutline';
import type { OutlineLessonInput } from '@/lib/lessonOutline';

function lesson(overrides: Partial<OutlineLessonInput> = {}): OutlineLessonInput {
  return {
    thumbnailUrl: null,
    estimatedMinutes: null,
    segments: [],
    checkpoints: [],
    ...overrides,
  };
}

function segment(overrides: Partial<OutlineLessonInput['segments'][number]> = {}) {
  return {
    id: 'seg-1',
    title: 'Segment',
    duration: 600,
    videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    thumbnailUrl: null,
    ...overrides,
  };
}

function checkpoint(overrides: Partial<OutlineLessonInput['checkpoints'][number]> = {}) {
  return {
    id: 'cp-1',
    segmentId: 'seg-1',
    timeOffsetSeconds: 120,
    snapshotUrl: null,
    questionCount: 2,
    ...overrides,
  };
}

describe('formatDuration', () => {
  it('formats sub-minute, minute and hour spans', () => {
    expect(formatDuration(45)).toBe('<1 min');
    expect(formatDuration(600)).toBe('10 min');
    expect(formatDuration(3900)).toBe('1 hr 5 min');
    expect(formatDuration(7200)).toBe('2 hr');
  });

  it('falls back to an em dash for missing or zero durations', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
  });
});

describe('deriveTotalSeconds', () => {
  it('prefers the summed segment lengths', () => {
    expect(deriveTotalSeconds(lesson({ segments: [segment(), segment({ id: 'seg-2', duration: 300 })] }))).toBe(900);
  });

  it('falls back to estimatedMinutes, then to the last checkpoint offset', () => {
    expect(deriveTotalSeconds(lesson({ estimatedMinutes: 8, segments: [segment({ duration: null })] }))).toBe(480);
    expect(deriveTotalSeconds(lesson({ segments: [segment({ duration: null })], checkpoints: [checkpoint()] }))).toBe(
      120
    );
  });

  it('returns null when the lesson carries no timing data at all', () => {
    expect(deriveTotalSeconds(lesson({ segments: [segment({ duration: 0 })] }))).toBeNull();
  });
});

describe('buildLessonOutline', () => {
  it('splits the video into the stretches between checkpoints plus a tail part', () => {
    const outline = buildLessonOutline(
      lesson({
        segments: [segment({ duration: 600 })],
        checkpoints: [checkpoint({ timeOffsetSeconds: 120 }), checkpoint({ id: 'cp-2', timeOffsetSeconds: 420 })],
      })
    );

    expect(outline.parts.map((part) => [part.title, part.durationLabel])).toEqual([
      ['Part 1', '2 min'],
      ['Part 2', '5 min'],
      ['Part 3', '3 min'],
    ]);
    expect(outline.checkpointCount).toBe(2);
    expect(outline.totalLabel).toBe('10 min');
    expect(outline.parts[0].checkpoint?.questionLabel).toBe('2 questions');
    // The tail part plays out after the last checkpoint, so nothing gates it.
    expect(outline.parts[2].checkpoint).toBeNull();
  });

  it('counts a checkpoint question list ahead of the stored questionCount', () => {
    const outline = buildLessonOutline(
      lesson({
        segments: [segment()],
        checkpoints: [checkpoint({ questionCount: 2, questions: [{}, {}, {}] })],
      })
    );

    expect(outline.parts[0].checkpoint?.questionLabel).toBe('3 questions');
  });

  it('orders parts by checkpoint time even when the rows arrive unsorted', () => {
    const outline = buildLessonOutline(
      lesson({
        segments: [segment({ duration: 600 })],
        checkpoints: [checkpoint({ id: 'cp-late', timeOffsetSeconds: 420 }), checkpoint({ timeOffsetSeconds: 120 })],
      })
    );

    expect(outline.parts.map((part) => part.durationLabel)).toEqual(['2 min', '5 min', '3 min']);
  });

  it('emits no tail part when the last checkpoint sits at the end of the video', () => {
    const outline = buildLessonOutline(
      lesson({ segments: [segment({ duration: 300 })], checkpoints: [checkpoint({ timeOffsetSeconds: 300 })] })
    );

    expect(outline.parts).toHaveLength(1);
  });

  it('falls back to the segment length when checkpoint offsets are missing', () => {
    const outline = buildLessonOutline(
      lesson({ segments: [segment({ duration: 180 })], checkpoints: [checkpoint({ timeOffsetSeconds: 0 })] })
    );

    expect(outline.parts[0].durationLabel).toBe('3 min');
  });

  it('reports an unknown duration instead of a zero for lessons with no video length', () => {
    const outline = buildLessonOutline(
      lesson({
        segments: [segment({ duration: null })],
        checkpoints: [checkpoint({ timeOffsetSeconds: 0 })],
      })
    );

    expect(outline.parts).toHaveLength(1);
    expect(outline.parts[0].durationSeconds).toBeNull();
    expect(outline.parts[0].durationLabel).toBe('—');
    expect(outline.totalSeconds).toBeNull();
  });

  it('makes one part per segment when the lesson has no checkpoints', () => {
    const outline = buildLessonOutline(
      lesson({ segments: [segment({ duration: 120 }), segment({ id: 'seg-2', duration: 240 })] })
    );

    expect(outline.parts.map((part) => [part.title, part.durationLabel])).toEqual([
      ['Part 1', '2 min'],
      ['Part 2', '4 min'],
    ]);
    expect(outline.checkpointCount).toBe(0);
  });

  it('resolves thumbnails from snapshot, segment art, then the video frame', () => {
    const outline = buildLessonOutline(
      lesson({
        segments: [segment({ thumbnailUrl: 'https://cdn.example.com/seg.jpg' })],
        checkpoints: [
          checkpoint({ snapshotUrl: 'https://cdn.example.com/snap.jpg' }),
          checkpoint({ id: 'cp-2', timeOffsetSeconds: 300 }),
        ],
      })
    );

    expect(outline.parts[0].thumbnailUrl).toBe('https://cdn.example.com/snap.jpg');
    expect(outline.parts[1].thumbnailUrl).toBe('https://cdn.example.com/seg.jpg');
  });

  it('falls back to the badge requirement video when no segment carries one', () => {
    const outline = buildLessonOutline(
      lesson({
        segments: [segment({ videoUrl: null, duration: 300 })],
        checkpoints: [checkpoint({ timeOffsetSeconds: 120 })],
        badgeRequirements: [{ youtubeUrl: 'https://youtu.be/abcdefghijk' }],
      })
    );

    expect(outline.parts[0].thumbnailUrl).toContain('abcdefghijk');
  });

  it('returns an empty outline for a missing lesson', () => {
    const outline = buildLessonOutline(null);

    expect(outline.parts).toEqual([]);
    expect(outline.totalLabel).toBe('—');
  });
});
