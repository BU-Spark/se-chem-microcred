'use client';
/* eslint-disable @next/next/no-img-element */

import YoutubeThumbnail from '@/app/components/Video/Youtube/YoutubeThumbnail';
import type { YoutubeThumbnailQuality } from '@/lib/video';

export default function BadgeImage({
  imageUrl,
  imagePositionX = 50,
  imagePositionY = 50,
  imageScale = 115,
  videoUrl,
  fallbackThumbnailUrl,
  quality,
  alt,
  className,
}: {
  imageUrl?: string | null;
  imagePositionX?: number | null;
  imagePositionY?: number | null;
  imageScale?: number | null;
  videoUrl?: string | null;
  fallbackThumbnailUrl?: string | null;
  quality?: YoutubeThumbnailQuality;
  alt: string;
  className?: string;
}) {
  if (imageUrl) {
    const positionX = imagePositionX ?? 50;
    const positionY = imagePositionY ?? 50;
    // A cover-cropped image only overflows on one axis (or neither for square
    // artwork). The crop buffer guarantees usable overflow on both axes, while
    // the translation makes the same focal coordinates work for every aspect ratio.
    const translateX = Number(((50 - positionX) * 0.1).toFixed(2));
    const translateY = Number(((50 - positionY) * 0.1).toFixed(2));
    // Never below 100: under it the cover-cropped image would stop filling the
    // circle and leave a gap at the edge.
    const scale = Math.max(100, imageScale ?? 115) / 100;
    // Uploaded badge art is stored as a validated data URL, which next/image does
    // not optimize. Native img is the correct rendering path for this local data.
    return (
      <img
        src={imageUrl}
        alt={alt}
        className={className}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: `${positionX}% ${positionY}%`,
          transform: `scale(${scale}) translate(${translateX}%, ${translateY}%)`,
        }}
      />
    );
  }

  return (
    <YoutubeThumbnail
      videoUrl={videoUrl}
      fallbackThumbnailUrl={fallbackThumbnailUrl}
      quality={quality}
      alt={alt}
      className={className}
    />
  );
}
