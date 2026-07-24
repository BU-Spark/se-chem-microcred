'use client';

import { useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent, TextareaHTMLAttributes } from 'react';

// A textarea that starts one line tall and grows with its content. Used for
// single-value fields (answer choices) where the text must wrap into view
// rather than scroll out of a fixed-width input. Enter is suppressed so these
// stay logically single-value even though they render as multi-line.
export default function AutoGrowTextarea({
  value,
  onKeyDown,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    // jsdom reports 0 here; leave the natural height alone in that case.
    if (el.scrollHeight > 0) {
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [value]);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      value={value}
      onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter') {
          event.preventDefault();
        }
        onKeyDown?.(event);
      }}
    />
  );
}
