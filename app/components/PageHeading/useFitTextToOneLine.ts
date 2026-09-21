'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

export default function useFitTextToOneLine<T extends HTMLElement>(
  text: string,
  { maxPx, minPx }: { maxPx: number; minPx: number }
) {
  const ref = useRef<T | null>(null);

  const fit = useCallback(() => {
    const node = ref.current;
    if (!node) return;

    node.style.whiteSpace = 'nowrap';
    node.style.fontSize = `${maxPx}px`;

    const available = node.clientWidth;
    const needed = node.scrollWidth;
    // jsdom and pre-layout paints report 0 for both; nothing to measure yet.
    if (available <= 0 || needed <= available) return;

    let size = Math.max(minPx, Math.floor((maxPx * available) / needed));
    node.style.fontSize = `${size}px`;

    // Proportional scaling lands within a pixel or two; walk the rest off.
    let guard = 0;
    while (size > minPx && node.scrollWidth > node.clientWidth && guard < 12) {
      size -= 1;
      guard += 1;
      node.style.fontSize = `${size}px`;
    }

    if (node.scrollWidth > node.clientWidth) {
      node.style.whiteSpace = 'normal';
    }
  }, [maxPx, minPx]);

  // Layout effect so the sized heading is what the browser first paints.
  useLayoutEffect(() => {
    fit();
  }, [fit, text]);

  useEffect(() => {
    const node = ref.current;
    const parent = node?.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') return;

    // Observe the parent, never the heading itself: `fit` resizes the heading,
    // which would re-trigger an observer watching it.
    const observer = new ResizeObserver(() => fit());
    observer.observe(parent);

    // Webfonts are wider or narrower than the fallback, so re-measure once
    // Lato has actually loaded.
    void document.fonts?.ready?.then(fit).catch(() => {});

    return () => observer.disconnect();
  }, [fit]);

  return ref;
}
