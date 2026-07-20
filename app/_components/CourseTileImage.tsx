'use client';

import { Icon } from '@iconify/react';
import { hasCourseImage, type CourseImageFields } from '@/lib/courseImage';

type CourseTileImageProps = CourseImageFields & {
  title?: string;
  // Rendered when the course has no custom icon/color (e.g. the existing
  // lesson-thumbnail or placeholder node).
  fallback?: React.ReactNode;
  // Icon size as a share of the square tile (0–1). Defaults to 55%.
  iconScale?: number;
};

// Renders a course's "image": the chosen icon centered over its background
// color, filling the square media tile. Falls back to `fallback` when the
// course has no custom image so pre-existing courses render as before.
export default function CourseTileImage({
  iconName,
  iconBgColor,
  iconFgColor,
  title,
  fallback = null,
  iconScale = 0.55,
}: CourseTileImageProps) {
  if (!hasCourseImage({ iconName, iconBgColor })) {
    return <>{fallback}</>;
  }

  return (
    <div
      role="img"
      aria-label={title ? `${title} icon` : 'Course icon'}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: iconBgColor as string,
      }}
    >
      <Icon
        icon={iconName as string}
        color={iconFgColor ?? '#FFFFFF'}
        style={{ width: `${iconScale * 100}%`, height: `${iconScale * 100}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
