import { PropsWithChildren } from 'react';

export interface VideoQEVPlayerProps extends PropsWithChildren {
  muxPlaybackId?: string;
}

export function VideoQEVPlayer({ muxPlaybackId, children }: VideoQEVPlayerProps) {
  return (
    <section>
      <h2>Video Player</h2>
      <p>Playback ID: {muxPlaybackId ?? 'not configured'}</p>
      {children}
    </section>
  );
}

export default VideoQEVPlayer;
