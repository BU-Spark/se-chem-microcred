'use client';

import { useEffect, useRef } from 'react';

export function useNavigationGuard(enabled: boolean, message: string) {
  // Held in a ref so that re-wording the prompt never re-runs the effect, which
  // would push a second sentinel onto the stack.
  const messageRef = useRef(message);

  useEffect(() => {
    messageRef.current = message;
  }, [message]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Still required by some browsers to actually trigger the prompt.
      event.returnValue = '';
    };

    const pushSentinel = () => {
      window.history.pushState({ navigationGuard: true }, '');
    };

    const handlePopState = () => {
      // The sentinel has just been popped, so the page is still on screen and
      // this navigation is ours to cancel.
      if (window.confirm(messageRef.current)) {
        // Stop guarding first, then pop the page's own entry so the back press
        // lands where the user expected it to.
        window.removeEventListener('popstate', handlePopState);
        window.removeEventListener('beforeunload', handleBeforeUnload);
        window.history.back();
        return;
      }
      pushSentinel();
    };

    pushSentinel();
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [enabled]);
}

export default useNavigationGuard;
