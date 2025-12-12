'use client';

import { useEffect, useRef } from 'react';

type YoutubePlayerInstance = {
  destroy: () => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
};

type YoutubeReadyEvent = {
  target: YoutubePlayerInstance;
};

type YoutubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, unknown>;
      events?: {
        onReady?: (event: YoutubeReadyEvent) => void;
      };
    }
  ) => YoutubePlayerInstance;
};

declare global {
  interface Window {
    YT?: YoutubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface YoutubePlayerProps {
  videoId: string;
  startSeconds?: number;
  onReady?: (player: YoutubePlayerInstance) => void;
}

let youtubeIframeApiPromise: Promise<void> | null = null;

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeIframeApiPromise) return youtubeIframeApiPromise;

  youtubeIframeApiPromise = new Promise<void>((resolve) => {
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.body.appendChild(script);
    }

    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
  });

  return youtubeIframeApiPromise;
}

export function YoutubePlayer({ videoId, startSeconds, onReady }: YoutubePlayerProps) {
  const playerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YoutubePlayerInstance | null>(null);

  useEffect(() => {
    if (!playerRef.current) {
      return;
    }

    let isSubscribed = true;

    const createPlayer = () => {
      if (!playerRef.current) {
        return;
      }
      const PlayerCtor = window.YT?.Player;
      if (!PlayerCtor) {
        return;
      }
      ytPlayerRef.current = new PlayerCtor(playerRef.current, {
        videoId,
        playerVars: {
          modestbranding: 1,
          rel: 0,
          start: startSeconds ?? 0,
        },
        events: {
          onReady: (event) => {
            if (onReady) {
              onReady(event.target);
            }
          },
        },
      });
    };

    loadYouTubeIframeApi()
      .then(() => {
        if (isSubscribed) {
          createPlayer();
        }
      })
      .catch((err) => {
        console.error('Failed to load YouTube Iframe API', err);
      });

    return () => {
      isSubscribed = false;
      if (ytPlayerRef.current) {
        ytPlayerRef.current.destroy();
      }
    };
  }, [videoId, startSeconds, onReady]);

  return <div className="yt-embed" ref={playerRef} />;
}
