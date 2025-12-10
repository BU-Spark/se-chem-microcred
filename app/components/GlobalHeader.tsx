'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import checkedLogo from '../../assets/checked_logo.png';

export function GlobalHeader() {
  const pathname = usePathname() || '';

  // Optional: one-time debug – open DevTools console and reload the video page
  if (typeof window !== 'undefined') {
    // Comment this out after you verify it once.
    console.log('[GlobalHeader] pathname =', pathname);
  }

  // Strip query + hash just in case
  const cleanPath = pathname.split(/[?#]/)[0];
  const segments = cleanPath.split('/').filter(Boolean);
  // segments example for /lesson/abc123/video -> ['lesson', 'abc123', 'video']

  const isLessonVideoPage = segments[0] === 'lesson' && segments.includes('video');

  // ❌ Do NOT render the global header on the lesson video page
  if (isLessonVideoPage) {
    return null;
  }

  // ✅ Everywhere else, render the original global header
  return (
    <header className="global-header">
      <Image src={checkedLogo} alt="checkd logo" className="global-logo" width={115} height={32} />
    </header>
  );
}
