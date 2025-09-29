import type { QevCue } from '../types/qev.types';

export function sortCuesByTime(cues: QevCue[]): QevCue[] {
  return [...cues].sort((a, b) => a.startTime - b.startTime);
}

export function findActiveCue(cues: QevCue[], currentTime: number): QevCue | undefined {
  return sortCuesByTime(cues).find((cue) => currentTime >= cue.startTime && currentTime < cue.endTime);
}
