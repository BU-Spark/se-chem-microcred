import { NextResponse } from 'next/server';

const PLACEHOLDER_IMAGE = 'https://dummyimage.com/640x360/1f5fab/ffffff.png&text=ChemSkills+Checkpoint';

function extractYouTubeId(input: string) {
  const match =
    input.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/) ?? input.match(/[?&]v=([\w-]{11})/);
  return match?.[1] ?? null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const video = url.searchParams.get('video');
  const time = url.searchParams.get('t');

  if (!video) {
    return NextResponse.json({ error: 'Missing required video parameter.' }, { status: 400 });
  }

  const videoId = extractYouTubeId(video);

  if (!videoId) {
    return NextResponse.json({ url: PLACEHOLDER_IMAGE, source: 'placeholder', time }, { status: 200 });
  }

  // Leverage YouTube generated thumbnails; mqdefault gives a 320x180 image.
  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  let resolvedUrl = thumbnailUrl;

  try {
    const response = await fetch(thumbnailUrl, { method: 'HEAD', cache: 'no-store' });
    if (!response.ok) {
      resolvedUrl = PLACEHOLDER_IMAGE;
    }
  } catch {
    resolvedUrl = PLACEHOLDER_IMAGE;
  }

  return NextResponse.json(
    { url: resolvedUrl, source: resolvedUrl === thumbnailUrl ? 'youtube' : 'placeholder', time },
    { status: 200 }
  );
}
