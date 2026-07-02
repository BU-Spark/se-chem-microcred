/** @jest-environment node */

import { extractYouTubeId, buildYoutubeThumbnail, youtubeUrlFromSummary } from '../lib/video';

describe('extractYouTubeId', () => {
  it('parses watch?v= URLs', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('parses watch URLs with extra query params', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=abc')).toBe('dQw4w9WgXcQ');
  });

  it('parses youtu.be short links', () => {
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('parses embed URLs', () => {
    expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('parses Shorts URLs', () => {
    expect(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('parses Shorts URLs with a trailing query string', () => {
    expect(extractYouTubeId('https://youtube.com/shorts/dQw4w9WgXcQ?feature=share')).toBe('dQw4w9WgXcQ');
  });

  it('returns null for non-YouTube or empty input', () => {
    expect(extractYouTubeId('https://example.com/video')).toBeNull();
    expect(extractYouTubeId('not a url')).toBeNull();
    expect(extractYouTubeId('')).toBeNull();
    expect(extractYouTubeId(null)).toBeNull();
  });
});

describe('buildYoutubeThumbnail', () => {
  it('builds an hqdefault thumbnail by default', () => {
    expect(buildYoutubeThumbnail('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
    );
  });

  it('honors the requested quality', () => {
    expect(buildYoutubeThumbnail('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'mqdefault')).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg'
    );
  });

  it('builds a thumbnail from a Shorts URL', () => {
    expect(buildYoutubeThumbnail('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
    );
  });

  it('returns null when there is no id', () => {
    expect(buildYoutubeThumbnail('https://example.com')).toBeNull();
    expect(buildYoutubeThumbnail(null)).toBeNull();
  });
});

describe('youtubeUrlFromSummary', () => {
  it('extracts a trimmed youtubeUrl from valid summary JSON', () => {
    const summary = JSON.stringify({ version: 3, youtubeUrl: '  https://youtu.be/dQw4w9WgXcQ  ', skills: [] });
    expect(youtubeUrlFromSummary(summary)).toBe('https://youtu.be/dQw4w9WgXcQ');
  });

  it('returns null when youtubeUrl is missing, blank, or non-string', () => {
    expect(youtubeUrlFromSummary(JSON.stringify({ version: 3 }))).toBeNull();
    expect(youtubeUrlFromSummary(JSON.stringify({ youtubeUrl: '   ' }))).toBeNull();
    expect(youtubeUrlFromSummary(JSON.stringify({ youtubeUrl: 42 }))).toBeNull();
  });

  it('returns null for invalid JSON or empty input', () => {
    expect(youtubeUrlFromSummary('{ not json')).toBeNull();
    expect(youtubeUrlFromSummary('')).toBeNull();
    expect(youtubeUrlFromSummary(null)).toBeNull();
  });
});
