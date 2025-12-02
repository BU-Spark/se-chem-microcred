'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { LessonRecord } from '../../hooks/useStudentData';
import styles from './video.module.css';
import veryUnhappyFace from '../../../assets/survey_faces/very_unhappy.png';
import slightlyUnhappyFace from '../../../assets/survey_faces/slightly_unhappy.png';
import neutralFace from '../../../assets/survey_faces/neutral.png';
import slightlyHappyFace from '../../../assets/survey_faces/slightly_happy.png';
import veryHappyFace from '../../../assets/survey_faces/very_happy.png';

const ENABLE_QEV_SKIP = (process.env.NEXT_PUBLIC_ENABLE_QEV_SKIP || 'true').toLowerCase() === 'true';

type ModalState = 'none' | 'question' | 'result' | 'success' | 'lessonSurvey' | 'lessonComplete';
type RangeStyleVars = CSSProperties & {
  '--progress': string;
  '--unlocked': string;
};
type QuestionType = 'multipleChoice' | 'shortAnswer';

type SelectedAnswerState =
  | { kind: 'multipleChoice'; selectedIndex: number }
  | { kind: 'shortAnswer'; raw: string; value: number | null; hasError: boolean };

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
    options: string[];
    selectedIndex: number | null;
    numericAnswer: number | null;
    correctIndex: number | null;
    expectedAnswer: number | null;
    tolerancePercent: number;
    type: QuestionType;
    isCorrect: boolean;
  }>;
}

interface LessonSurveyPrompt {
  id: string;
  question: string;
  completed: boolean;
}

interface LessonVideoPageProps {
  lesson: LessonRecord;
  studentName?: string | null;
  studentEmail: string;
  lessonSurvey: LessonSurveyPrompt | null;
  resumeRequested: boolean;
}

const CHECKPOINT_TRIGGER_THRESHOLD = 0.35;

const LESSON_SURVEY_FACES = [
  { value: 1, label: 'Very unhappy', icon: veryUnhappyFace },
  { value: 2, label: 'Slightly unhappy', icon: slightlyUnhappyFace },
  { value: 3, label: 'Neutral', icon: neutralFace },
  { value: 4, label: 'Slightly happy', icon: slightlyHappyFace },
  { value: 5, label: 'Very happy', icon: veryHappyFace },
] as const;

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

export function LessonVideoPage({
  lesson,
  studentName = 'Student Demo',
  studentEmail,
  lessonSurvey,
  resumeRequested,
}: LessonVideoPageProps) {
  const router = useRouter();
  const effectiveLessonSurvey = useMemo<LessonSurveyPrompt | null>(
    () => lessonSurvey ?? { id: `auto-${lesson.slug}`, question: 'How was this lesson?', completed: false },
    [lesson.slug, lessonSurvey]
  );
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const playerElementId = useMemo(() => `youtube-player-${lesson.id}`, [lesson.id]);

  const orderedCheckpoints = useMemo(
    () => [...lesson.checkpoints].sort((a, b) => a.timeOffsetSeconds - b.timeOffsetSeconds),
    [lesson.checkpoints]
  );

  const initialCompletedIds = useMemo(() => lesson.completedCheckpointIds ?? [], [lesson.completedCheckpointIds]);
  const resumeBaseTime = useMemo(
    () => (resumeRequested ? Math.max(0, lesson.resumeTimeSeconds ?? 0) : 0),
    [lesson.resumeTimeSeconds, resumeRequested]
  );

  const [modalState, setModalState] = useState<ModalState>('none');
  const [activeCheckpointId, setActiveCheckpointId] = useState<string | null>(null);
  const [completedCheckpointIds, setCompletedCheckpointIds] = useState<string[]>(initialCompletedIds);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, SelectedAnswerState>>({});
  const [attemptSummary, setAttemptSummary] = useState<AttemptSummary | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [lessonSurveyRating, setLessonSurveyRating] = useState(3);
  const [lessonSurveySubmitting, setLessonSurveySubmitting] = useState(false);
  const [lessonSurveyError, setLessonSurveyError] = useState<string | null>(null);
  const [lessonSurveyCompleted, setLessonSurveyCompleted] = useState(effectiveLessonSurvey?.completed ?? false);
  const playerStateRef = useRef<number | null>(null);
  const lastSeekRef = useRef<number | null>(resumeBaseTime);
  const [furthestTime, setFurthestTime] = useState(resumeBaseTime);
  const furthestTimeRef = useRef(resumeBaseTime);
  const [currentTime, setCurrentTime] = useState(resumeBaseTime);
  const [duration, setDuration] = useState(0);
  const [videoEnded, setVideoEnded] = useState(false);
  const [thumbnailCache, setThumbnailCache] = useState<Record<string, string>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [playerStatus, setPlayerStatus] = useState<number | null>(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const modalStateRef = useRef<ModalState>('none');
  const visibilityTimerRef = useRef<number | null>(null);
  const lessonSurveyTriggeredRef = useRef<boolean>(effectiveLessonSurvey?.completed ?? false);
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

  useEffect(() => {
    setCompletedCheckpointIds(initialCompletedIds);
  }, [initialCompletedIds]);

  useEffect(() => {
    setFurthestTime(resumeBaseTime);
    furthestTimeRef.current = resumeBaseTime;
    setCurrentTime(resumeBaseTime);
    lastSeekRef.current = resumeBaseTime;
    setVideoEnded(false);
  }, [resumeBaseTime]);

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
  const allCheckpointsCompleted = useMemo(
    () =>
      orderedCheckpoints.length > 0 &&
      orderedCheckpoints.every((checkpoint) => completedCheckpointIds.includes(checkpoint.id)),
    [orderedCheckpoints, completedCheckpointIds]
  );
  const lessonReadyForSurvey = useMemo(
    () => (orderedCheckpoints.length === 0 || allCheckpointsCompleted) && videoEnded,
    [allCheckpointsCompleted, orderedCheckpoints.length, videoEnded]
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

  const seekTo = useCallback(
    (time: number, allowSeekAhead = true, force = false) => {
      if (!Number.isFinite(time)) {
        return;
      }
      const maxAllowed = force ? Math.max(0, time) : Math.max(0, Math.min(time, furthestTimeRef.current));
      lastSeekRef.current = maxAllowed;
      setCurrentTime(maxAllowed);
      if (duration > 0 && maxAllowed < Math.max(0, duration - 1)) {
        setVideoEnded(false);
      }
      const player = playerRef.current;
      if (!player || typeof player.seekTo !== 'function') {
        return;
      }
      player.seekTo(maxAllowed, allowSeekAhead);
    },
    [duration]
  );

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
            if (event.data === api?.PlayerState?.ENDED) {
              setVideoEnded(true);
            } else if (event.data === api?.PlayerState?.PLAYING) {
              setVideoEnded(false);
            }
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
    setLessonSurveyCompleted(effectiveLessonSurvey?.completed ?? false);
    lessonSurveyTriggeredRef.current = effectiveLessonSurvey?.completed ?? false;
  }, [effectiveLessonSurvey]);

  useEffect(() => {
    if (lessonSurveyCompleted) {
      lessonSurveyTriggeredRef.current = true;
    }
  }, [lessonSurveyCompleted]);

  useEffect(() => {
    if (!effectiveLessonSurvey || lessonSurveyCompleted) {
      return;
    }
    if (lessonReadyForSurvey && !lessonSurveyTriggeredRef.current) {
      lessonSurveyTriggeredRef.current = true;
      ensurePlayerPaused();
      setModalState('lessonSurvey');
    }
  }, [ensurePlayerPaused, effectiveLessonSurvey, lessonReadyForSurvey, lessonSurveyCompleted]);

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

        if (Number.isFinite(time) && Number.isFinite(duration)) {
          const nearEnd = duration > 0 && time >= Math.max(0, duration - 0.25);
          if (nearEnd) {
            setVideoEnded(true);
          } else if (time < Math.max(0, duration - 1)) {
            setVideoEnded(false);
          }
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
  }, [duration, firstIncompleteCheckpoint, modalState, openCheckpointModal, playerReady, seekTo, updateFurthestTime]);

  useEffect(() => {
    if (modalState === 'none') {
      setControlsVisible(true);
      scheduleHide();
    } else {
      clearHideTimer();
      setControlsVisible(true);
    }
  }, [clearHideTimer, modalState, scheduleHide]);

  const handleChoiceSelect = useCallback((questionId: string, answerIndex: number) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: { kind: 'multipleChoice', selectedIndex: answerIndex },
    }));
  }, []);

  const handleShortAnswerChange = useCallback((questionId: string, rawValue: string) => {
    const trimmed = rawValue.trim();
    const numericValue = trimmed === '' ? null : Number(trimmed);
    const isValid = trimmed !== '' && Number.isFinite(numericValue);

    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: {
        kind: 'shortAnswer',
        raw: rawValue,
        value: isValid ? (numericValue as number) : null,
        hasError: trimmed !== '' && !isValid,
      },
    }));
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
          answers: currentCheckpoint.questions.map((question) => {
            const selected = selectedAnswers[question.id];
            return {
              questionId: question.id,
              selectedIndex: selected?.kind === 'multipleChoice' ? selected.selectedIndex : null,
              numericAnswer: selected?.kind === 'shortAnswer' ? selected.value : null,
            };
          }),
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
    const activeQuestion = currentCheckpoint.questions[activeQuestionIndex];
    if (activeQuestion?.type === 'shortAnswer') {
      const selection = selectedAnswers[activeQuestion.id];
      if (!selection || selection.kind !== 'shortAnswer' || selection.value == null || selection.hasError) {
        return;
      }
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
  }, [activeQuestionIndex, currentCheckpoint, selectedAnswers, submitAttempt]);

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

  const handleLessonSurveyFaceSelect = useCallback((value: number) => {
    setLessonSurveyRating(value);
  }, []);

  const submitLessonSurvey = useCallback(async () => {
    if (!effectiveLessonSurvey) {
      return;
    }
    setLessonSurveySubmitting(true);
    setLessonSurveyError(null);
    try {
      const response = await fetch(`/api/lessons/${lesson.id}/survey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: studentEmail,
          rating: lessonSurveyRating,
          videoCompleted: true,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Unable to submit survey.');
      }
      setLessonSurveyCompleted(true);
      setModalState('lessonComplete');
    } catch (error) {
      setLessonSurveyError(
        error instanceof Error ? error.message : 'Something went wrong while submitting your survey.'
      );
    } finally {
      setLessonSurveySubmitting(false);
    }
  }, [effectiveLessonSurvey, lesson.id, lessonSurveyRating, studentEmail]);

  const rangeStyle = useMemo<RangeStyleVars>(() => {
    const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / Math.max(duration, 1)) * 100)) : 0;
    const unlockedLimit = resolveMaxSeekableTime();
    const unlockedPct = duration > 0 ? Math.min(100, Math.max(0, (unlockedLimit / duration) * 100)) : 0;
    return {
      '--progress': `${progressPct}%`,
      '--unlocked': `${unlockedPct}%`,
    };
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
    if (
      modalState === 'question' ||
      modalState === 'result' ||
      modalState === 'lessonSurvey' ||
      modalState === 'lessonComplete'
    ) {
      ensurePlayerPaused();
    }
  }, [ensurePlayerPaused, modalState]);

  const currentCheckpointQuestions = currentCheckpoint?.questions ?? [];
  const totalCheckpointQuestions = currentCheckpointQuestions.length;
  const currentQuestion =
    totalCheckpointQuestions > 0 ? (currentCheckpointQuestions[activeQuestionIndex] ?? null) : null;
  const canAdvance = currentQuestion
    ? (() => {
        const selection = selectedAnswers[currentQuestion.id];
        if (!selection) {
          return false;
        }
        if (currentQuestion.type === 'shortAnswer') {
          return selection.kind === 'shortAnswer' && selection.value != null && !selection.hasError;
        }
        return selection.kind === 'multipleChoice';
      })()
    : false;
  const isFinalQuestion = currentQuestion ? activeQuestionIndex === totalCheckpointQuestions - 1 : false;
  const handleSkipToNextCheckpoint = useCallback(() => {
    if (firstIncompleteCheckpoint) {
      updateFurthestTime(firstIncompleteCheckpoint.timeOffsetSeconds, true);
      seekTo(firstIncompleteCheckpoint.timeOffsetSeconds, true, true);
      openCheckpointModal(firstIncompleteCheckpoint.id);
      return;
    }

    ensurePlayerPaused();

    if (effectiveLessonSurvey && !lessonSurveyCompleted) {
      lessonSurveyTriggeredRef.current = true;
      setVideoEnded(true);
      setModalState('lessonSurvey');
      return;
    }

    setModalState('lessonComplete');
  }, [
    ensurePlayerPaused,
    firstIncompleteCheckpoint,
    lessonSurvey,
    lessonSurveyCompleted,
    openCheckpointModal,
    seekTo,
    updateFurthestTime,
  ]);
  const handleShowQrCode = useCallback(() => {
    router.push('/badges');
  }, [router]);

  const handleGoHome = useCallback(() => {
    router.push('/');
  }, [router]);
  const handleUnlockProgressForTesting = useCallback(() => {
    if (duration <= 0) {
      return;
    }
    setFurthestTime(duration);
    furthestTimeRef.current = duration;
    setCompletedCheckpointIds(orderedCheckpoints.map((cp) => cp.id));
    setActiveCheckpointId(null);
    setSelectedAnswers({});
    setAttemptSummary(null);
    setNetworkError(null);
    setModalState('none');
    setActiveQuestionIndex(0);
  }, [duration, orderedCheckpoints]);

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
          {ENABLE_QEV_SKIP ? (
            <div className={styles.debugControls}>
              <button type="button" onClick={handleSkipToNextCheckpoint}>
                Skip to next checkpoint (demo)
              </button>
              <button type="button" onClick={handleUnlockProgressForTesting} disabled={duration <= 0}>
                Unlock progress bar (testing)
              </button>
            </div>
          ) : null}

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
            {ENABLE_QEV_SKIP && (firstIncompleteCheckpoint || !lessonSurveyCompleted) ? (
              <div className={styles.qevDemoSkip}>
                <button type="button" onClick={handleSkipToNextCheckpoint}>
                  Skip to next checkpoint (demo)
                </button>
                <button type="button" onClick={handleUnlockProgressForTesting} disabled={duration <= 0}>
                  Unlock progress bar (testing)
                </button>
              </div>
            ) : null}

            {modalState !== 'none' && modalState !== 'lessonSurvey' ? (
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
                            {currentQuestion.type === 'multipleChoice' ? (
                              (Array.isArray(currentQuestion.options) ? currentQuestion.options : []).map(
                                (option, optionIndex) => {
                                  const selection = selectedAnswers[currentQuestion.id];
                                  const isSelected =
                                    selection?.kind === 'multipleChoice' && selection.selectedIndex === optionIndex;
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
                                      onClick={() => handleChoiceSelect(currentQuestion.id, optionIndex)}
                                    >
                                      {option}
                                    </button>
                                  );
                                }
                              )
                            ) : (
                              <div className={styles.shortAnswerField}>
                                <label
                                  htmlFor={`${currentQuestion.id}-short-answer`}
                                  className={styles.shortAnswerLabel}
                                >
                                  Your answer
                                </label>
                                <input
                                  id={`${currentQuestion.id}-short-answer`}
                                  type="text"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  className={styles.shortAnswerInput}
                                  value={
                                    selectedAnswers[currentQuestion.id]?.kind === 'shortAnswer'
                                      ? selectedAnswers[currentQuestion.id].raw
                                      : ''
                                  }
                                  onChange={(event) => handleShortAnswerChange(currentQuestion.id, event.target.value)}
                                  placeholder="Enter a number"
                                />
                                <p className={styles.shortAnswerHelp}>
                                  Enter a numeric response
                                  {currentQuestion.tolerancePercent > 0
                                    ? ` (±${currentQuestion.tolerancePercent}% accepted).`
                                    : '.'}
                                </p>
                                {selectedAnswers[currentQuestion.id]?.kind === 'shortAnswer' &&
                                selectedAnswers[currentQuestion.id].hasError ? (
                                  <p className={styles.shortAnswerError}>Please enter a numeric answer.</p>
                                ) : null}
                              </div>
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
                        You’re all set! Show your assessor the QR code to finalize this lesson.
                      </p>
                      <div className={styles.modalActions}>
                        <button type="button" className={styles.modalSecondary} onClick={handleShowQrCode}>
                          Show QR code
                        </button>
                        <button type="button" className={styles.modalSecondary} onClick={handleGoHome}>
                          Home
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {effectiveLessonSurvey && modalState === 'lessonSurvey' && (
        <div className={styles.lessonSurveyOverlay}>
          <div className={styles.lessonSurveyModal}>
            <h2 className={styles.lessonSurveyTitle}>Tell us about this lesson</h2>
            <p className={styles.lessonSurveyQuestion}>{effectiveLessonSurvey.question}</p>
            {lessonSurveyError ? <p className={styles.lessonSurveyError}>{lessonSurveyError}</p> : null}
            <div className={styles.lessonSurveyFaces}>
              {LESSON_SURVEY_FACES.map((face) => {
                const isSelected = lessonSurveyRating === face.value;
                const faceClass = [styles.lessonSurveyFace, isSelected ? styles.lessonSurveyFaceSelected : '']
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    key={face.value}
                    type="button"
                    className={faceClass}
                    onClick={() => handleLessonSurveyFaceSelect(face.value)}
                    aria-pressed={isSelected}
                  >
                    <Image src={face.icon} alt={face.label} width={56} height={56} />
                    <span>{face.label}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className={styles.lessonSurveySubmit}
              onClick={submitLessonSurvey}
              disabled={lessonSurveySubmitting}
            >
              {lessonSurveySubmitting ? 'Submitting…' : 'Submit feedback'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
