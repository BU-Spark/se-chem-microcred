'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import checkedLogo from '../../public/assets/checked_logo.png';

export function GlobalHeader() {
  const pathname = usePathname() || '';

  // Strip query + hash just in case
  const cleanPath = pathname.split(/[?#]/)[0];
  const segments = cleanPath.split('/').filter(Boolean);
  // segments example for /lessons/abc123/video -> ['lessons', 'abc123', 'video']

  const isLessonVideoPage = segments[0] === 'lessons' && segments.includes('video');

  // ❌ Do NOT render the global header on the lesson video page
  if (isLessonVideoPage) {
    return null;
  }

  // ❌ The splash page has its own header/logo, so skip the global one there
  if (segments[0] === 'splash') {
    return null;
  }

  // ✅ Everywhere else, render the original global header
  return (
    <header className="global-header">
      <Image src={checkedLogo} alt="checkd logo" className="global-logo" width={115} height={32} />
    </header>
  );
}
