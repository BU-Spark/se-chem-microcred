'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { LessonRecord } from '../../hooks/useStudentData';
import styles from './video.module.css';

type ModalState = 'none' | 'question' | 'result' | 'success' | 'lessonComplete';
type RangeStyleVars = CSSProperties & {
  '--progress': string;
  '--unlocked': string;
};

type YouTubePlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
  mute?(): void;
  unMute?(): void;
  isMuted?(): boolean;
  setVolume?(v: number): void;
  getVolume?(): number;
};

type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, unknown>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
      };
    }
  ) => YouTubePlayer;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
};

interface AttemptSummary {
  isPassing: boolean;
  questions: Array<{
    questionId: string;
    prompt: string;
    options: unknown;
    selectedIndex: number | null;
    correctIndex: number | null;
    isCorrect: boolean;
  }>;
}

interface LessonVideoPageProps {
  lesson: LessonRecord;
  studentName?: string | null;
  studentEmail: string;
}

const CHECKPOINT_TRIGGER_THRESHOLD = 0.35;

function initialsFromName(name?: string | null) {
  if (!name) {
    return 'ST';
  }
  const tokens = name.trim().split(/\s+/);
  return tokens
    .slice(0, 2)
    .map((token) => token.charAt(0).toUpperCase())
    .join('');
}

function extractYouTubeId(url?: string | null) {
  if (!url) {
    return null;
  }
  const match =
    url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/) ?? url.match(/[?&]v=([\w-]{11})/);
  return match?.[1] ?? null;
}

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function formatTime(seconds: number | null | undefined) {
  if (!Number.isFinite(seconds ?? NaN)) {
    return '0:00';
  }
  const total = Math.max(0, Math.floor(seconds ?? 0));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

function getPrevCheckpointId(checkpoints: LessonRecord['checkpoints'], id: string | null) {
  if (!id) {
    return null;
  }
  const idx = checkpoints.findIndex((checkpoint) => checkpoint.id === id);
  if (idx <= 0) {
    return null;
  }
  return checkpoints[idx - 1]?.id ?? null;
}

function getCheckpointStartTime(checkpoints: LessonRecord['checkpoints'], id: string | null) {
  if (!id) {
    return 0;
  }
  const prevId = getPrevCheckpointId(checkpoints, id);
  if (!prevId) {
    return 0;
  }
  const prevCheckpoint = checkpoints.find((checkpoint) => checkpoint.id === prevId);
  return prevCheckpoint?.timeOffsetSeconds ?? 0;
}

export function LessonVideoPage({ lesson, studentName = 'Student Demo', studentEmail }: LessonVideoPageProps) {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const playerElementId = useMemo(() => `youtube-player-${lesson.id}`, [lesson.id]);

  const orderedCheckpoints = useMemo(
    () => [...lesson.checkpoints].sort((a, b) => a.timeOffsetSeconds - b.timeOffsetSeconds),
    [lesson.checkpoints]
  );

  const [modalState, setModalState] = useState<ModalState>('none');
  const [activeCheckpointId, setActiveCheckpointId] = useState<string | null>(null);
  const [completedCheckpointIds, setCompletedCheckpointIds] = useState<string[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [attemptSummary, setAttemptSummary] = useState<AttemptSummary | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const playerStateRef = useRef<number | null>(null);
  const lastSeekRef = useRef<number | null>(null);
  const [furthestTime, setFurthestTime] = useState(0);
  const furthestTimeRef = useRef(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [thumbnailCache, setThumbnailCache] = useState<Record<string, string>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [playerStatus, setPlayerStatus] = useState<number | null>(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const modalStateRef = useRef<ModalState>('none');
  const visibilityTimerRef = useRef<number | null>(null);
  const updateFurthestTime = useCallback((time: number, force = false) => {
    if (!Number.isFinite(time)) {
      return;
    }

    setFurthestTime((prev) => {
      if (!force && time <= prev + 0.1) {
        return prev;
      }
      furthestTimeRef.current = time;
      return time;
    });
  }, []);

  const resolveMaxSeekableTime = useCallback(() => {
    const limit = furthestTimeRef.current;
    if (!Number.isFinite(duration)) {
      return limit;
    }
    return Math.min(limit, duration);
  }, [duration]);

  const clearHideTimer = useCallback(() => {
    if (visibilityTimerRef.current != null && typeof window !== 'undefined') {
      window.clearTimeout(visibilityTimerRef.current);
      visibilityTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    clearHideTimer();
    visibilityTimerRef.current = window.setTimeout(() => {
      if (modalState === 'none') {
        setControlsVisible(false);
      }
    }, 1800) as unknown as number;
  }, [clearHideTimer, modalState]);

  const isPlaying = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    const api = (window as { YT?: YouTubeApi }).YT;
    const playerState = api?.PlayerState?.PLAYING;
    return typeof playerState === 'number' ? playerStatus === playerState : false;
  }, [playerStatus]);

  const firstIncompleteCheckpoint = useMemo(
    () => orderedCheckpoints.find((checkpoint) => !completedCheckpointIds.includes(checkpoint.id)) ?? null,
    [orderedCheckpoints, completedCheckpointIds]
  );

  const currentCheckpoint = useMemo(() => {
    if (activeCheckpointId) {
      return orderedCheckpoints.find((checkpoint) => checkpoint.id === activeCheckpointId) ?? null;
    }
    return firstIncompleteCheckpoint;
  }, [orderedCheckpoints, activeCheckpointId, firstIncompleteCheckpoint]);

  const youtubeId = useMemo(() => extractYouTubeId(lesson.segments[0]?.videoUrl), [lesson.segments]);
  const primaryVideoUrl = useMemo(() => lesson.segments[0]?.videoUrl ?? null, [lesson.segments]);

  const resolvedStudentName = studentName ?? 'Student Demo';
  const [firstName, lastName] = useMemo(() => {
    const parts = resolvedStudentName.split(/\s+/).filter(Boolean);
    return [parts[0] ?? 'Student', parts[parts.length - 1] ?? 'Demo'];
  }, [resolvedStudentName]);

  const timelineItems = useMemo(() => {
    return orderedCheckpoints.map((checkpoint, index) => {
      const isCompleted = completedCheckpointIds.includes(checkpoint.id);
      const isActive =
        checkpoint.id === activeCheckpointId || (!isCompleted && firstIncompleteCheckpoint?.id === checkpoint.id);
      return {
        id: checkpoint.id,
        title: checkpoint.title || `Checkpoint ${index + 1}`,
        snapshotUrl: thumbnailCache[checkpoint.id] ?? checkpoint.snapshotUrl ?? null,
        status: isCompleted ? 'completed' : isActive ? 'current' : 'pending',
      } as const;
    });
  }, [orderedCheckpoints, completedCheckpointIds, activeCheckpointId, firstIncompleteCheckpoint, thumbnailCache]);

  useEffect(() => {
    if (!primaryVideoUrl) {
      return;
    }
    let cancelled = false;

    const hydrateThumbnails = async () => {
      const missing = orderedCheckpoints.filter((cp) => !thumbnailCache[cp.id]);
      if (missing.length === 0) {
        return;
      }

      for (const cp of missing) {
        try {
          const params = new URLSearchParams({
            video: primaryVideoUrl,
            t: String(cp.timeOffsetSeconds),
          });
          const res = await fetch(`/api/checkpoint-snapshot?${params.toString()}`);
          if (!res.ok) {
            continue;
          }
          const { url } = (await res.json()) as { url?: string };
          if (!cancelled && url) {
            setThumbnailCache((prev) => ({ ...prev, [cp.id]: url }));
          }
        } catch {
          // silently skip on failure
        }
      }
    };

    void hydrateThumbnails();
    return () => {
      cancelled = true;
    };
  }, [orderedCheckpoints, primaryVideoUrl, thumbnailCache]);

  const ensurePlayerPaused = useCallback(() => {
    const player = playerRef.current;
    if (player && typeof player.pauseVideo === 'function') {
      player.pauseVideo();
    }
  }, []);

  const seekTo = useCallback((time: number, allowSeekAhead = true, force = false) => {
    if (!Number.isFinite(time)) {
      return;
    }
    const maxAllowed = force ? Math.max(0, time) : Math.max(0, Math.min(time, furthestTimeRef.current));
    lastSeekRef.current = maxAllowed;
    setCurrentTime(maxAllowed);
    const player = playerRef.current;
    if (!player || typeof player.seekTo !== 'function') {
      return;
    }
    player.seekTo(maxAllowed, allowSeekAhead);
  }, []);

  const openCheckpointModal = useCallback(
    (checkpointId: string) => {
      const checkpoint = orderedCheckpoints.find((item) => item.id === checkpointId) ?? null;
      if (!checkpoint) {
        return;
      }

      updateFurthestTime(checkpoint.timeOffsetSeconds, true);
      seekTo(checkpoint.timeOffsetSeconds, true, true);
      if (checkpoint.questions.length === 0) {
        setCompletedCheckpointIds((prev) => (prev.includes(checkpoint.id) ? prev : [...prev, checkpoint.id]));
        setActiveCheckpointId(null);
        setTimeout(() => {
          playerRef.current?.playVideo?.();
        }, 10);
        return;
      }

      setActiveCheckpointId(checkpointId);
      setSelectedAnswers({});
      setAttemptSummary(null);
      setNetworkError(null);
      setModalState('question');
      ensurePlayerPaused();
      setActiveQuestionIndex(0);
    },
    [ensurePlayerPaused, orderedCheckpoints, seekTo, updateFurthestTime]
  );

  useEffect(() => {
    if (!youtubeId) {
      return;
    }

    let cancelled = false;
    const mountPlayer = () => {
      const youtubeApi = (window as { YT?: YouTubeApi }).YT;
      if (!youtubeApi || cancelled) {
        return;
      }

      const mountElement = document.getElementById(playerElementId);
      if (!mountElement) {
        return;
      }

      if (playerRef.current) {
        return;
      }

      playerRef.current = new youtubeApi.Player(mountElement, {
        videoId: youtubeId,
        playerVars: {
          controls: 0,
          disablekb: 1,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: () => {
            if (cancelled) {
              return;
            }
            const readyPlayer = playerRef.current;
            if (readyPlayer && typeof readyPlayer.getDuration === 'function') {
              setDuration(readyPlayer.getDuration());
              const startTime = lastSeekRef.current ?? readyPlayer.getCurrentTime();
              seekTo(startTime, true);
            }
            setPlayerReady(true);
            setIsMuted(playerRef.current?.isMuted?.() ?? false);
            if (typeof window !== 'undefined') {
              const api = (window as { YT?: YouTubeApi }).YT;
              setPlayerStatus(api?.PlayerState?.PAUSED ?? null);
            }
            setControlsVisible(true);
            scheduleHide();
          },
          onStateChange: (event) => {
            playerStateRef.current = event.data;
            const api = (window as { YT?: YouTubeApi }).YT;
            if (event.data === api?.PlayerState?.PLAYING && modalStateRef.current !== 'none') {
              playerRef.current?.pauseVideo?.();
            }
            setIsMuted(playerRef.current?.isMuted?.() ?? false);
            setPlayerStatus(event.data);
            if (modalStateRef.current === 'none') {
              setControlsVisible(true);
              scheduleHide();
            }
          },
        },
      });
    };

    if ((window as { YT?: YouTubeApi }).YT?.Player) {
      mountPlayer();
    } else {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        mountPlayer();
      };

      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [playerElementId, scheduleHide, youtubeId, seekTo]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  useEffect(() => {
    furthestTimeRef.current = furthestTime;
  }, [furthestTime]);

  useEffect(() => {
    modalStateRef.current = modalState;
  }, [modalState]);

  useEffect(() => {
    if (!playerReady) {
      return;
    }

    const interval = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) {
        return;
      }

      if (typeof player.getCurrentTime !== 'function') {
        return;
      }

      const api = (window as { YT?: YouTubeApi }).YT;
      const playing = playerStateRef.current === api?.PlayerState?.PLAYING;

      if (modalState === 'none') {
        const time = player.getCurrentTime();

        if (playing) {
          setCurrentTime(time);
          updateFurthestTime(time);
          if (typeof player.getDuration === 'function') {
            setDuration(player.getDuration());
          }
        } else if (typeof player.getDuration === 'function') {
          setDuration(player.getDuration());
        }

        if (firstIncompleteCheckpoint && playing) {
          const trigger = firstIncompleteCheckpoint.timeOffsetSeconds - CHECKPOINT_TRIGGER_THRESHOLD;
          if (time >= trigger) {
            updateFurthestTime(firstIncompleteCheckpoint.timeOffsetSeconds, true);
            seekTo(firstIncompleteCheckpoint.timeOffsetSeconds, true, true);
            player.pauseVideo?.();
            openCheckpointModal(firstIncompleteCheckpoint.id);
            return;
          }
        }
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [firstIncompleteCheckpoint, modalState, openCheckpointModal, playerReady, seekTo, updateFurthestTime]);

  useEffect(() => {
    if (modalState === 'none') {
      setControlsVisible(true);
      scheduleHide();
    } else {
      clearHideTimer();
      setControlsVisible(true);
    }
  }, [clearHideTimer, modalState, scheduleHide]);

  const handleAnswerSelect = useCallback((questionId: string, answerIndex: number) => {
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: answerIndex }));
  }, []);

  const resetAfterCheckpoint = useCallback(
    (resumeBaseTime?: number, resumeOffset = 0.5) => {
      const baseTime = resumeBaseTime ?? currentCheckpoint?.timeOffsetSeconds ?? null;
      if (baseTime != null) {
        const targetTime = baseTime + resumeOffset;
        updateFurthestTime(targetTime, true);
        seekTo(targetTime, true, true);
      }
      setActiveCheckpointId(null);
      setModalState('none');
      setAttemptSummary(null);
      setSelectedAnswers({});
      setNetworkError(null);
      setActiveQuestionIndex(0);

      requestAnimationFrame(() => {
        playerRef.current?.playVideo?.();
      });
    },
    [currentCheckpoint, seekTo, updateFurthestTime]
  );

  const submitAttempt = useCallback(async () => {
    if (!currentCheckpoint) {
      return;
    }

    setIsSubmitting(true);
    setNetworkError(null);

    try {
      const response = await fetch(`/api/checkpoints/${currentCheckpoint.id}/attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: studentEmail,
          answers: currentCheckpoint.questions.map((question) => ({
            questionId: question.id,
            selectedIndex: selectedAnswers[question.id] ?? null,
          })),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Unable to record checkpoint attempt.');
      }

      const payload = (await response.json()) as AttemptSummary;
      setAttemptSummary(payload);

      if (payload.isPassing) {
        const baseTime = currentCheckpoint.timeOffsetSeconds;
        setCompletedCheckpointIds((prev) =>
          prev.includes(currentCheckpoint.id) ? prev : [...prev, currentCheckpoint.id]
        );
        setAttemptSummary(null);
        setActiveQuestionIndex(0);
        resetAfterCheckpoint(baseTime);
      } else {
        const sectionStartTime = getCheckpointStartTime(orderedCheckpoints, currentCheckpoint.id);
        seekTo(sectionStartTime, true);
        requestAnimationFrame(() => playerRef.current?.playVideo?.());
        setActiveQuestionIndex(0);
        setModalState('result');
      }
    } catch (error) {
      setNetworkError(error instanceof Error ? error.message : 'Something went wrong while submitting answers.');
      setModalState('result');
    } finally {
      setIsSubmitting(false);
    }
  }, [currentCheckpoint, orderedCheckpoints, resetAfterCheckpoint, seekTo, selectedAnswers, studentEmail]);

  const handleAdvance = useCallback(() => {
    if (!currentCheckpoint) {
      return;
    }
    const total = currentCheckpoint.questions.length;
    if (total === 0) {
      submitAttempt();
      return;
    }
    if (activeQuestionIndex < total - 1) {
      setActiveQuestionIndex((index) => index + 1);
      return;
    }
    submitAttempt();
  }, [activeQuestionIndex, currentCheckpoint, submitAttempt]);

  const handleTryAgain = useCallback(() => {
    setModalState('question');
    setAttemptSummary(null);
    setSelectedAnswers({});
    setActiveQuestionIndex(0);
  }, []);

  const handleRewatch = useCallback(() => {
    setModalState('none');
    setAttemptSummary(null);
    setNetworkError(null);
    setSelectedAnswers({});
    setActiveQuestionIndex(0);
    if (currentCheckpoint && playerRef.current) {
      const rewindTime = getCheckpointStartTime(orderedCheckpoints, currentCheckpoint.id);
      seekTo(Math.max(rewindTime, 0), true);
      requestAnimationFrame(() => {
        playerRef.current?.playVideo?.();
      });
    }
  }, [currentCheckpoint, orderedCheckpoints, seekTo]);

  const togglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) {
      return;
    }
    if (isPlaying) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
    if (modalState === 'none') {
      setControlsVisible(true);
      scheduleHide();
    }
  }, [isPlaying, modalState, scheduleHide]);

  const toggleMute = useCallback(() => {
    const player = playerRef.current;
    if (!player) {
      return;
    }
    const muted = player.isMuted?.() ?? isMuted;
    if (muted) {
      player.unMute?.();
    } else {
      player.mute?.();
    }
    setIsMuted(!muted);
    if (modalState === 'none') {
      setControlsVisible(true);
      scheduleHide();
    }
  }, [isMuted, modalState, scheduleHide]);

  const rangeStyle = useMemo(() => {
    const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / Math.max(duration, 1)) * 100)) : 0;
    const unlockedLimit = resolveMaxSeekableTime();
    const unlockedPct = duration > 0 ? Math.min(100, Math.max(0, (unlockedLimit / duration) * 100)) : 0;
    return {
      '--progress': `${progressPct}%`,
      '--unlocked': `${unlockedPct}%`,
    } satisfies RangeStyleVars;
  }, [currentTime, duration, resolveMaxSeekableTime]);

  const handleMouseMoveVideo = useCallback(() => {
    if (modalState !== 'none') {
      return;
    }
    setControlsVisible(true);
    scheduleHide();
  }, [modalState, scheduleHide]);

  const handleMouseLeaveVideo = useCallback(() => {
    if (modalState !== 'none') {
      return;
    }
    clearHideTimer();
    setControlsVisible(false);
  }, [clearHideTimer, modalState]);

  useEffect(() => {
    if (modalState === 'question' || modalState === 'result' || modalState === 'lessonComplete') {
      ensurePlayerPaused();
    }
  }, [ensurePlayerPaused, modalState]);

  const currentCheckpointQuestions = currentCheckpoint?.questions ?? [];
  const totalCheckpointQuestions = currentCheckpointQuestions.length;
  const currentQuestion =
    totalCheckpointQuestions > 0 ? (currentCheckpointQuestions[activeQuestionIndex] ?? null) : null;
  const canAdvance = currentQuestion ? selectedAnswers[currentQuestion.id] != null : false;
  const isFinalQuestion = currentQuestion ? activeQuestionIndex === totalCheckpointQuestions - 1 : false;

  return (
    <div className={styles.page}>
      <header className={styles.headerBar}>
        <div className={styles.logo}>
          checkd.<sup>®</sup>
        </div>
        <nav className={styles.headerNav}>
          <Link href="/analytics">My Analytics</Link>
          <Link href="/badges">Badge Wallet</Link>
          <Link href="/grades">Grades</Link>
          <Link href="/settings">Settings</Link>
        </nav>
        <div className={styles.userBadge}>
          <div className={styles.userAvatar}>{initialsFromName(resolvedStudentName)}</div>
          <div>
            <div style={{ fontWeight: 600 }}>{firstName}</div>
            <div style={{ fontSize: '0.8rem', color: '#4b5563' }}>{lastName}</div>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        <aside className={styles.timeline}>
          {timelineItems.map((item) => {
            const thumbnailClass = [
              styles.timelineThumbnail,
              item.status === 'completed' ? styles.timelineThumbnailCompleted : '',
              item.status === 'current' ? styles.timelineThumbnailActive : '',
            ]
              .filter(Boolean)
              .join(' ');

            const checkpointClass = [
              styles.timelineCheckpoint,
              item.status === 'completed' ? styles.timelineCheckpointCompleted : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div key={item.id} className={styles.timelineItem}>
                <div className={thumbnailClass}>
                  {item.snapshotUrl ? (
                    <Image src={item.snapshotUrl} alt={item.title} width={72} height={72} />
                  ) : (
                    <div className={styles.timelinePlaceholder}>Preview</div>
                  )}
                </div>
                <div className={checkpointClass}>{item.status === 'completed' ? '✓' : ''}</div>
              </div>
            );
          })}
        </aside>

        <div className={styles.mainColumn}>
          <div className={styles.videoHeader}>
            <div>
              <h1 className={styles.videoTitle}>{lesson.title}</h1>
              <div className={styles.videoSegment}>{currentCheckpoint?.title ?? 'Checkpoint'}</div>
            </div>
          </div>

          <div
            className={styles.videoWrapper}
            onMouseMove={handleMouseMoveVideo}
            onMouseEnter={handleMouseMoveVideo}
            onMouseLeave={handleMouseLeaveVideo}
          >
            <div id={playerElementId} className={styles.youtubeFrame} />

            <div className={`${styles.qevBar} ${controlsVisible ? '' : styles.qevBarHidden}`}>
              <button
                type="button"
                className={styles.qevBtn}
                onClick={togglePlay}
                disabled={modalState !== 'none'}
                id="qevPlayBtn"
                aria-label={isPlaying ? 'Pause' : 'Continue'}
                data-state={isPlaying ? 'pause' : 'continue'}
              >
                <span className={styles.iconPlayPause} />
                {!isPlaying && modalState === 'none' ? <span className={styles.btnLabel}>Continue</span> : null}
              </button>

              <button
                type="button"
                className={styles.qevBtn}
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                id="qevMuteBtn"
              >
                <span className={styles.iconVolume}>
                  <span className={styles.iconSpeaker} />
                  {isMuted ? <span className={styles.iconVolumeSlash} /> : <span className={styles.iconVolumeWaves} />}
                </span>
              </button>

              <span className={styles.qevTime}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              <div className={styles.qevRailWrap}>
                {duration > 0 &&
                  orderedCheckpoints.map((cp) => {
                    const leftPct = Math.min(100, Math.max(0, (cp.timeOffsetSeconds / duration) * 100));
                    const done = completedCheckpointIds.includes(cp.id);
                    const curr = currentCheckpoint?.id === cp.id;
                    const cls = [styles.qevBreak, done ? styles.qevBreakDone : '', curr ? styles.qevBreakCurrent : '']
                      .filter(Boolean)
                      .join(' ');
                    return <span key={cp.id} className={cls} style={{ left: `${leftPct}%` }} />;
                  })}

                <input
                  type="range"
                  className={styles.qevRange}
                  min={0}
                  max={Math.max(duration, 1)}
                  step={0.1}
                  value={Math.min(currentTime, Math.max(duration, 1), resolveMaxSeekableTime())}
                  style={rangeStyle}
                  onChange={(e) => {
                    const raw = Number(e.currentTarget.value);
                    const val = Math.max(0, Math.min(raw, resolveMaxSeekableTime()));

                    if (raw !== val) {
                      e.currentTarget.value = String(val);
                    }
                    seekTo(val, true);
                    if (modalState === 'none') {
                      setControlsVisible(true);
                      scheduleHide();
                    }

                    if (
                      modalState === 'none' &&
                      firstIncompleteCheckpoint &&
                      val >= firstIncompleteCheckpoint.timeOffsetSeconds - CHECKPOINT_TRIGGER_THRESHOLD
                    ) {
                      playerRef.current?.pauseVideo?.();
                      openCheckpointModal(firstIncompleteCheckpoint.id);
                    }
                  }}
                />
              </div>
            </div>

            {modalState !== 'none' ? (
              <div className={styles.overlay}>
                <div className={styles.modalCard}>
                  {modalState === 'question' && currentCheckpoint ? (
                    currentQuestion ? (
                      <>
                        <h2 className={styles.modalTitle}>{currentCheckpoint.title}</h2>
                        <p className={styles.modalDescription}>Answer each question to continue.</p>
                        <div className={styles.questionList}>
                          <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>
                            Question {activeQuestionIndex + 1} of {totalCheckpointQuestions}
                          </div>
                          <p style={{ marginBottom: '0.75rem', color: '#1f2937', fontWeight: 500 }}>
                            {currentQuestion.prompt ?? 'Choose the correct answer.'}
                          </p>
                          <div style={{ display: 'grid', gap: '0.5rem' }}>
                            {(Array.isArray(currentQuestion.options) ? (currentQuestion.options as string[]) : []).map(
                              (option, optionIndex) => {
                                const isSelected = selectedAnswers[currentQuestion.id] === optionIndex;
                                const className = [
                                  styles.controlButton,
                                  isSelected ? styles.controlButtonPrimary : styles.controlButtonSecondary,
                                ]
                                  .filter(Boolean)
                                  .join(' ');
                                return (
                                  <button
                                    key={`${currentQuestion.id}-${optionIndex}`}
                                    type="button"
                                    className={className}
                                    onClick={() => handleAnswerSelect(currentQuestion.id, optionIndex)}
                                  >
                                    {option}
                                  </button>
                                );
                              }
                            )}
                          </div>
                        </div>
                        <div className={styles.controlRow}>
                          <button
                            type="button"
                            className={`${styles.controlButton} ${styles.controlButtonSecondary}`}
                            onClick={handleRewatch}
                          >
                            Rewatch
                          </button>
                          <button
                            type="button"
                            className={`${styles.controlButton} ${styles.controlButtonPrimary}`}
                            onClick={handleAdvance}
                            disabled={!canAdvance || (isFinalQuestion && isSubmitting)}
                          >
                            {isFinalQuestion ? (isSubmitting ? 'Submitting…' : 'Submit') : 'Next'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className={styles.modalDescription}>No questions configured for this checkpoint.</p>
                    )
                  ) : null}

                  {modalState === 'result' && attemptSummary ? (
                    <>
                      <h2 className={styles.modalTitle}>That wasn’t quite right.</h2>
                      <p className={styles.modalDescription}>
                        You must answer all questions correctly to move on to the next segment.
                      </p>
                      <ul className={styles.questionList}>
                        {attemptSummary.questions.map((question, index) => (
                          <li key={question.questionId}>
                            <span>
                              {question.isCorrect ? '✓' : '✗'} Question {index + 1}
                            </span>
                            <span className={styles.statusIcon}>{question.isCorrect ? '✓' : '✗'}</span>
                          </li>
                        ))}
                      </ul>
                      {networkError ? (
                        <p style={{ color: '#dc2626', fontWeight: 600, marginTop: '0.75rem' }}>{networkError}</p>
                      ) : null}
                      <div className={styles.controlRow}>
                        <button
                          type="button"
                          className={`${styles.controlButton} ${styles.controlButtonSecondary}`}
                          onClick={handleRewatch}
                        >
                          Rewatch
                        </button>
                        <button
                          type="button"
                          className={`${styles.controlButton} ${styles.controlButtonPrimary}`}
                          onClick={handleTryAgain}
                        >
                          Try again
                        </button>
                      </div>
                    </>
                  ) : null}

                  {modalState === 'success' ? (
                    <>
                      <h2 className={styles.modalTitle}>Checkpoint cleared!</h2>
                      <p className={styles.modalDescription}>Great work—keep going to finish the lesson.</p>
                    </>
                  ) : null}

                  {modalState === 'lessonComplete' ? (
                    <>
                      <h2 className={styles.modalTitle}>Lesson Completed</h2>
                      <p className={styles.modalDescription}>
                        You’re all set! Show your assessor the QR code and complete the survey to get checkd.
                      </p>
                      <button type="button" className={styles.modalPrimary} onClick={() => resetAfterCheckpoint(0, 0)}>
                        Start Survey
                      </button>
                      <div className={styles.modalActions}>
                        <button
                          type="button"
                          className={styles.modalSecondary}
                          onClick={() => resetAfterCheckpoint(0, 0)}
                        >
                          Show QR code
                        </button>
                        <Link href="/" className={styles.modalSecondary}>
                          Home
                        </Link>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
