import Image from 'next/image';

import { buildYoutubeThumbnail, type YoutubeThumbnailQuality } from '@/lib/video';

interface YoutubeThumbnailProps {
  videoUrl?: string | null;
  // Shown when videoUrl yields no thumbnail (e.g. a badge with no video).
  fallbackThumbnailUrl?: string | null;
  alt: string;
  className?: string;
  quality?: YoutubeThumbnailQuality;
  sizes?: string;
}

// Renders a badge/lesson thumbnail derived from a YouTube video URL. Fills its
// (positioned) parent via next/image; renders nothing when there's no usable
// image so the caller's own decorative token shows through.
export default function YoutubeThumbnail({
  videoUrl,
  fallbackThumbnailUrl,
  alt,
  className,
  quality = 'hqdefault',
  sizes = '(max-width: 768px) 40vw, 200px',
}: YoutubeThumbnailProps) {
  const src = buildYoutubeThumbnail(videoUrl, quality) ?? (fallbackThumbnailUrl?.trim() || null);

  if (!src) {
    return null;
  }

  return <Image src={src} alt={alt} fill sizes={sizes} className={className} />;
}
