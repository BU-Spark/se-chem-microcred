// Shared YouTube helpers: id extraction, thumbnail-URL building, and pulling a
// video URL out of a BadgeRequirement summary. Kept dependency-free so both
// client components and server routes can import it.

export type YoutubeThumbnailQuality = 'maxresdefault' | 'sddefault' | 'hqdefault' | 'mqdefault' | 'default';

// Extract a YouTube video id from a watch/youtu.be/embed/shorts URL. Uses the
// URL parser (robust to query params and `www`); returns null for anything that
// isn't a recognizable YouTube link.
export function extractYouTubeId(url?: string | null): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '') || null;
    }

    const queryId = parsed.searchParams.get('v');
    if (queryId) return queryId;

    const parts = parsed.pathname.split('/');

    const embedIndex = parts.indexOf('embed');
    if (embedIndex >= 0) {
      return parts[embedIndex + 1] ?? null;
    }

    const shortsIndex = parts.indexOf('shorts');
    if (shortsIndex >= 0) {
      return parts[shortsIndex + 1] ?? null;
    }
  } catch {
    return null;
  }

  return null;
}

// Build a YouTube thumbnail image URL from a video URL, or null when the URL
// has no extractable id.
export function buildYoutubeThumbnail(
  url?: string | null,
  quality: YoutubeThumbnailQuality = 'hqdefault'
): string | null {
  const videoId = extractYouTubeId(url);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/${quality}.jpg` : null;
}

// Pull the stored `youtubeUrl` out of a BadgeRequirement summary JSON string.
// Returns null on missing/invalid JSON or a missing/non-string field.
export function youtubeUrlFromSummary(summary?: string | null): string | null {
  if (!summary) return null;

  try {
    const parsed = JSON.parse(summary) as { youtubeUrl?: unknown };
    const url = typeof parsed.youtubeUrl === 'string' ? parsed.youtubeUrl.trim() : '';
    return url || null;
  } catch {
    return null;
  }
}
