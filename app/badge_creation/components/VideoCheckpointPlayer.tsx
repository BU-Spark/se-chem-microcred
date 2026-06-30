'use client';

import { useEffect, useRef, useState } from 'react';

import { formatSecondsToTimecode } from '../lib/badge-helpers';
import styles from './VideoCheckpointPlayer.module.css';

// Minimal typings for the YouTube IFrame Player API (loaded at runtime from a
// keyless public script — no API key, no quota, no Google Cloud project).
type YTPlayer = {
  destroy: () => void;
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
};

type YTNamespace = {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
};

// `window.YT` is already globally typed by app/components/VideoPlayer (a leaner
// shape); reach our richer namespace through a local cast instead of a second
// conflicting global augmentation.
function getYT(): YTNamespace | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { YT?: YTNamespace }).YT;
}

// Load the IFrame API exactly once per page; subsequent callers share the promise.
let apiPromise: Promise<void> | null = null;
function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('No DOM environment'));
  }
  if (getYT()?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<void>((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    // Only inject the script once — another component (e.g. the lesson
    // YoutubePlayer) may have already added it; a duplicate tag can make
    // onYouTubeIframeAPIReady fire unpredictably.
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  });
  return apiPromise;
}

export default function VideoCheckpointPlayer({
  videoId,
  title,
  checkpointTimes,
  onAddCheckpoint,
}: {
  videoId: string | null;
  title?: string;
  checkpointTimes: number[];
  onAddCheckpoint: (seconds: number) => void;
}) {
  // React only ever owns `wrapRef` (kept empty from its perspective). The YT
  // iframe is mounted into a detached child we manage imperatively, so React
  // never tries to reconcile a node YouTube has already swapped out.
  const wrapRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const intervalRef = useRef<number | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!videoId || !wrap) return;

    let cancelled = false;
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);

    const mount = document.createElement('div');
    mount.className = styles.mount;
    wrap.appendChild(mount);

    loadYouTubeIframeApi()
      .then(() => {
        const namespace = getYT();
        if (cancelled || !namespace?.Player) return;

        playerRef.current = new namespace.Player(mount, {
          videoId,
          playerVars: { controls: 0, modestbranding: 1, rel: 0, playsinline: 1, fs: 0 },
          events: {
            onReady: () => {
              if (cancelled) return;
              const player = playerRef.current;
              if (!player) return;
              setDuration(player.getDuration() ?? 0);
              setIsMuted(player.isMuted());
              intervalRef.current = window.setInterval(() => {
                const active = playerRef.current;
                if (!active) return;
                setCurrentTime(active.getCurrentTime() ?? 0);
                const live = active.getDuration() ?? 0;
                if (live) setDuration(live);
              }, 250);
            },
            onStateChange: (event: { data: number }) => {
              const namespace = getYT();
              if (!namespace) return;
              setIsPlaying(event.data === namespace.PlayerState.PLAYING);
            },
          },
        });
      })
      .catch(() => {
        // API failed to load (offline / blocked). The placeholder + manual
        // timestamp entry in the modal remain usable.
      });

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      try {
        playerRef.current?.destroy();
      } catch {
        // ignore teardown races
      }
      playerRef.current = null;
      // Safe DOM teardown (no innerHTML): remove whatever YouTube left behind.
      while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    };
  }, [videoId]);

  const fraction = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  const handleScrub = (event: React.MouseEvent<HTMLDivElement>) => {
    const player = playerRef.current;
    if (!player || duration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const target = ratio * duration;
    player.seekTo(target, true);
    setCurrentTime(target);
  };

  const togglePlay = () => {
    const player = playerRef.current;
    if (!player) return;
    if (isPlaying) player.pauseVideo();
    else player.playVideo();
  };

  const toggleMute = () => {
    const player = playerRef.current;
    if (!player) return;
    // Read authoritative state from the player rather than trusting React state,
    // which can drift if mute changes outside this component.
    const nowMuted = player.isMuted();
    if (nowMuted) player.unMute();
    else player.mute();
    setIsMuted(!nowMuted);
  };

  const seekBy = (deltaSeconds: number) => {
    const player = playerRef.current;
    if (!player || duration <= 0) return;
    const target = Math.min(duration, Math.max(0, currentTime + deltaSeconds));
    player.seekTo(target, true);
    setCurrentTime(target);
  };

  const handleScrubKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      seekBy(5);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      seekBy(-5);
    } else if (event.key === 'Home') {
      event.preventDefault();
      seekBy(-currentTime);
    } else if (event.key === 'End') {
      event.preventDefault();
      seekBy(duration - currentTime);
    }
  };

  const rewind = () => {
    const player = playerRef.current;
    if (!player) return;
    const target = Math.max(0, currentTime - 10);
    player.seekTo(target, true);
    setCurrentTime(target);
  };

  const handleAdd = () => {
    const player = playerRef.current;
    const seconds = player ? player.getCurrentTime() : currentTime;
    onAddCheckpoint(Math.max(0, Math.floor(seconds || 0)));
  };

  if (!videoId) {
    return (
      <div className={styles.player}>
        <div className={`${styles.stage} ${styles.placeholder}`}>
          Paste a valid YouTube link on the previous step to load the training video.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.player}>
      <div className={styles.stage}>
        <div ref={wrapRef} className={styles.frame} aria-label={title || 'Lesson video'} />
        <div className={styles.stageGradient} aria-hidden="true" />
        <button
          type="button"
          className={styles.addButton}
          onClick={handleAdd}
          aria-label="Add a checkpoint at the current time"
          title="Add a checkpoint at the current time"
        >
          +
        </button>

        <div className={styles.controls}>
          <div
            className={styles.scrubTrack}
            onClick={handleScrub}
            onKeyDown={handleScrubKey}
            role="slider"
            tabIndex={0}
            aria-label="Video scrubber"
            aria-valuemin={0}
            aria-valuemax={Math.floor(duration)}
            aria-valuenow={Math.floor(currentTime)}
            aria-valuetext={`${formatSecondsToTimecode(currentTime)} of ${formatSecondsToTimecode(duration)}`}
          >
            <div className={styles.scrubFill} style={{ width: `${fraction * 100}%` }} />
            {checkpointTimes.map((time, index) => (
              <span
                key={`marker-${index}`}
                className={styles.scrubMarker}
                style={{ left: `${duration > 0 ? Math.min(100, (time / duration) * 100) : 0}%` }}
              />
            ))}
            <span className={styles.scrubThumb} style={{ left: `${fraction * 100}%` }} />
          </div>

          <div className={styles.controlRow}>
            <button
              type="button"
              className={styles.controlButton}
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '❚❚' : '►'}
            </button>
            <button
              type="button"
              className={styles.controlButton}
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? '🔇' : '🔊'}
            </button>
            <button type="button" className={styles.controlButton} onClick={rewind} aria-label="Rewind 10 seconds">
              ⏪
            </button>
            <span className={styles.timecode}>
              {formatSecondsToTimecode(currentTime)} / {formatSecondsToTimecode(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
