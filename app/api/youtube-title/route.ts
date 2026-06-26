import { NextRequest, NextResponse } from 'next/server';

// Server-side proxy for YouTube's oEmbed endpoint. The browser can't call it
// directly (no CORS headers), so the Upload Lesson Video step hits this route
// to auto-fill the video title. The fetched title remains user-editable.
function isYouTubeHost(host: string) {
  const normalized = host.toLowerCase().replace(/^www\./, '');
  return normalized === 'youtube.com' || normalized === 'm.youtube.com' || normalized === 'youtu.be';
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get('url')?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url parameter.' }, { status: 400 });
  }

  const candidate = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return NextResponse.json({ error: 'Invalid URL.' }, { status: 400 });
  }

  // SSRF guard: only fetch oEmbed for genuine YouTube hosts.
  if (!isYouTubeHost(parsed.hostname)) {
    return NextResponse.json({ error: 'Only YouTube links are supported.' }, { status: 400 });
  }

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(candidate)}&format=json`;
    const response = await fetch(oembedUrl, { headers: { Accept: 'application/json' } });

    if (!response.ok) {
      return NextResponse.json({ error: 'Unable to load video details.' }, { status: 502 });
    }

    const data = (await response.json()) as { title?: string };
    return NextResponse.json({ title: data.title ?? null }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Unable to load video details.' }, { status: 502 });
  }
}
