import { useEffect, useState } from 'react';
import type { QevCue } from '../types/qev.types';

export interface QevState {
  activeCue?: QevCue;
  nextCue?: QevCue;
}

export function useQEV(cues: QevCue[] = []): QevState {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [cues]);

  const activeCue = cues[activeIndex];
  const nextCue = cues[activeIndex + 1];

  return { activeCue, nextCue };
}
