'use client';

import { useEffect, useRef, useState } from 'react';

export const DEFAULT_IDLE_MS = 15 * 60_000;
// How often the idle check runs, and the minimum gap between handled interactions.
const IDLE_CHECK_MS = 60_000;
const INTERACTION_THROTTLE_MS = 30_000;
const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'scroll', 'mousemove'] as const;

function isVisible() {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

export function useUserActivity({ idleMs = DEFAULT_IDLE_MS }: { idleMs?: number } = {}) {
  const lastInteractionRef = useRef(Date.now());
  const lastHandledRef = useRef(0);
  const [active, setActive] = useState(isVisible);

  useEffect(() => {
    const onInteract = () => {
      const now = Date.now();
      // Always mark the interaction, but skip extra work on high-frequency events.
      lastInteractionRef.current = now;
      if (now - lastHandledRef.current < INTERACTION_THROTTLE_MS) return;
      lastHandledRef.current = now;
      if (isVisible()) setActive(true);
    };

    const onVisibilityChange = () => {
      if (!isVisible()) {
        setActive(false);
        return;
      }
      setActive(Date.now() - lastInteractionRef.current < idleMs);
    };

    const idleTimer = window.setInterval(() => {
      if (Date.now() - lastInteractionRef.current >= idleMs) setActive(false);
    }, IDLE_CHECK_MS);

    INTERACTION_EVENTS.forEach((event) => window.addEventListener(event, onInteract, { passive: true }));
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(idleTimer);
      INTERACTION_EVENTS.forEach((event) => window.removeEventListener(event, onInteract));
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [idleMs]);

  return active;
}
