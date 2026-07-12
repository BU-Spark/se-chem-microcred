'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { sanitizeQuestionRichText } from '@/app/lib/question-rich-text';
import type { LessonRecord } from '../../hooks/useStudentData';
import styles from './video.module.css';
import veryUnhappyFace from '../../../public/assets/survey_faces/very_unhappy.svg';
import veryUnhappyFaceSelected from '../../../public/assets/survey_faces/very_unhappy_selected.svg';
import slightlyUnhappyFace from '../../../public/assets/survey_faces/slightly_unhappy.svg';
import slightlyUnhappyFaceSelected from '../../../public/assets/survey_faces/slightly_unhappy_selected.svg';
import neutralFace from '../../../public/assets/survey_faces/neutral.svg';
import neutralFaceSelected from '../../../public/assets/survey_faces/neutral_selected.svg';
import slightlyHappyFace from '../../../public/assets/survey_faces/slightly_happy.svg';
import slightlyHappyFaceSelected from '../../../public/assets/survey_faces/slightly_happy_selected.svg';
import veryHappyFace from '../../../public/assets/survey_faces/very_happy.svg';
import veryHappyFaceSelected from '../../../public/assets/survey_faces/very_happy_selected.svg';
import playIcon from '../../../public/assets/lesson/qev/Play.svg';
import pauseIcon from '../../../public/assets/lesson/qev/Pause.svg';

// Dev-only testing controls (skip checkpoint / unlock progress bar): shown only
// when the dev environment flag is set. Same flag the sidebar uses (CUR_ENV).
const ENABLE_QEV_SKIP = (process.env.NEXT_PUBLIC_CURRENT_ENVIRONMENT_DEV ?? '').toLowerCase() === 'true';

type ModalState = 'none' | 'question' | 'result' | 'success' | 'lessonSurvey' | 'lessonComplete' | 'lessonFailed';
type RangeStyleVars = CSSProperties & {
  '--progress': string;
  '--unlocked': string;
};
type QuestionType = 'multipleChoice' | 'shortAnswer';

type SelectedAnswerState =
  | { kind: 'multipleChoice'; selectedIndices: number[] }
  | { kind: 'shortAnswer'; raw: string; value: number | null; hasError: boolean };

type YouTubePlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  loadVideoById?(videoId: string): void;
  cueVideoById?(videoId: string): void;
  destroy(): void;
  mute?(): void;
  unMute?(): void;
  isMuted?(): boolean;
  setVolume?(v: number): void;
  getVolume?(): number;
  loadModule?(module: string): void;
  unloadModule?(module: string): void;
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

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface AttemptSummary {
  isPassing: boolean;
  questions: Array<{
    questionId: string;
    prompt: string;
    options: string[] | Record<string, unknown>;
    selectedIndex: number | null;
    selectedIndices?: number[];
    numericAnswer: number | null;
    correctIndex: number | null;
    correctIndices?: number[];
    expectedAnswer: number | null;
    tolerancePercent: number;
    acceptedRange: { min: number; max: number } | null;
    type: QuestionType;
    isCorrect: boolean;
  }>;
}

interface LessonAssessmentResult {
  passed: boolean;
  gradePercent: number;
  passingPercent: number;
  correctAnswers?: number;
  totalQuestions?: number;
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
  studentId: string;
  courseId?: string | null;
  lessonSurvey: LessonSurveyPrompt | null;
  resumeRequested: boolean;
  studentAvatarUrl?: string | null;
}

const CHECKPOINT_TRIGGER_THRESHOLD = 0.35;

const LESSON_SURVEY_FACES = [
  {
    value: 1,
    label: 'Very unhappy',
    icon: veryUnhappyFace,
    selectedIcon: veryUnhappyFaceSelected,
  },
  {
    value: 2,
    label: 'Slightly unhappy',
    icon: slightlyUnhappyFace,
    selectedIcon: slightlyUnhappyFaceSelected,
  },
  {
    value: 3,
    label: 'Neutral',
    icon: neutralFace,
    selectedIcon: neutralFaceSelected,
  },
  {
    value: 4,
    label: 'Slightly happy',
    icon: slightlyHappyFace,
    selectedIcon: slightlyHappyFaceSelected,
  },
  {
    value: 5,
    label: 'Very happy',
    icon: veryHappyFace,
    selectedIcon: veryHappyFaceSelected,
  },
] as const;

function extractYouTubeId(url?: string | null) {
  if (!url) {
    return null;
  }
  const match =
    url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/) ??
    url.match(/[?&]v=([\w-]{11})/);
  const candidate = match?.[1] ?? null;
  return candidate && candidate.length === 11 ? candidate : null;
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

let youtubeApiPromise: Promise<YouTubeApi | null> | null = null;
function loadYouTubeIframeApi() {
  if (typeof window === 'undefined') {
    return Promise.resolve<YouTubeApi | null>(null);
  }
  const existing = (window as { YT?: YouTubeApi }).YT;
  if (existing?.Player) {
    return Promise.resolve(existing);
  }
  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise<YouTubeApi | null>((resolve) => {
      const prior = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prior?.();
        resolve((window as { YT?: YouTubeApi }).YT ?? null);
      };

      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(script);
      }
    });
  }
  return youtubeApiPromise;
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
  studentEmail,
  studentId,
  courseId,
  lessonSurvey,
  resumeRequested,
}: LessonVideoPageProps) {
  // const resolvedStudentName = studentName && studentName.trim().length > 0 ? studentName : 'Student Demo';
  // const [firstName, lastName] = useMemo(() => {
  //   const parts = resolvedStudentName.split(/\s+/).filter(Boolean);
  //   const first = parts[0] ?? 'First';
  //   const last = parts.length > 1 ? parts[parts.length - 1] : 'Last';
  //   return [first, last];
  // }, [resolvedStudentName]);
  const router = useRouter();
  const effectiveLessonSurvey = useMemo<LessonSurveyPrompt | null>(
    () => lessonSurvey ?? { id: `auto-${lesson.slug}`, question: 'How was this lesson?', completed: false },
    [lesson.slug, lessonSurvey]
  );

  const playerRef = useRef<YouTubePlayer | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const playerElementId = useMemo(() => `youtube-player-${lesson.id}`, [lesson.id]);
  const playerStateRef = useRef<number | null>(null);
  const [playerStatus, setPlayerStatus] = useState<number | null>(null);

  const orderedCheckpoints = useMemo(
    () => [...lesson.checkpoints].sort((a, b) => a.timeOffsetSeconds - b.timeOffsetSeconds),
    [lesson.checkpoints]
  );
  // Checkpoints the student has already answered (whether they passed or not).
  // Answering — right or wrong — retires a checkpoint: it won't be asked again
  // and it counts toward reaching the end-of-lesson survey. Passing only affects
  // the grade, which is computed server-side from the recorded attempts.
  const initialAnsweredIds = useMemo(
    () => Array.from(new Set([...(lesson.completedCheckpointIds ?? []), ...(lesson.answeredCheckpointIds ?? [])])),
    [lesson.answeredCheckpointIds, lesson.completedCheckpointIds]
  );

  const resumeBaseTime = useMemo(() => {
    const recorded = Math.max(0, lesson.resumeTimeSeconds ?? 0);
    if (recorded > 0) return recorded;
    return resumeRequested ? recorded : 0;
  }, [lesson.resumeTimeSeconds, resumeRequested]);

  const [modalState, setModalState] = useState<ModalState>('none');
  const [activeCheckpointId, setActiveCheckpointId] = useState<string | null>(null);
  const [answeredCheckpointIds, setAnsweredCheckpointIds] = useState<string[]>(initialAnsweredIds);
  const [completedCheckpointIds, setCompletedCheckpointIds] = useState<string[]>(lesson.completedCheckpointIds ?? []);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, SelectedAnswerState>>({});
  const [attemptSummary, setAttemptSummary] = useState<AttemptSummary | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [lessonAssessment, setLessonAssessment] = useState<{
    passed: boolean;
    gradePercent: number;
    passingPercent: number;
  } | null>(null);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [assessingLesson, setAssessingLesson] = useState(false);
  const lastCheckpointResumeRef = useRef<number | null>(null);

  const [lessonSurveyRating, setLessonSurveyRating] = useState(3);
  const [lessonSurveySubmitting, setLessonSurveySubmitting] = useState(false);
  const [lessonSurveyError, setLessonSurveyError] = useState<string | null>(null);
  const [lessonSurveyCompleted, setLessonSurveyCompleted] = useState(effectiveLessonSurvey?.completed ?? false);
  const [showLessonQr, setShowLessonQr] = useState(false);
  const [assessmentCode, setAssessmentCode] = useState<string | null>(null);
  const [assessmentCodeError, setAssessmentCodeError] = useState<string | null>(null);

  const suppressCheckpointIdRef = useRef<string | null>(null);
  const suppressArmedRef = useRef(false);
  const scheduleCheckpointSuppression = useCallback((checkpointId: string) => {
    suppressCheckpointIdRef.current = checkpointId;
    suppressArmedRef.current = false;
  }, []);

  const lastSeekRef = useRef<number | null>(resumeBaseTime);
  const [furthestTime, setFurthestTime] = useState(resumeBaseTime);
  const furthestTimeRef = useRef(resumeBaseTime);
  const [currentTime, setCurrentTime] = useState(resumeBaseTime);
  const [duration, setDuration] = useState(0);
  const durationRef = useRef(0);
  const [videoEnded, setVideoEnded] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const modalStateRef = useRef<ModalState>('none');
  const visibilityTimerRef = useRef<number | null>(null);
  const lessonSurveyTriggeredRef = useRef<boolean>(effectiveLessonSurvey?.completed ?? false);
  const gradingTriggeredRef = useRef<boolean>(false);
  const lessonStartRecordedRef = useRef(false);

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
  // Hide the global header (from layout.tsx) on this page only
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const header = document.querySelector<HTMLElement>('.global-header');
    if (!header) return;

    const previousDisplay = header.style.display;
    header.style.display = 'none';

    // restore when leaving this page
    return () => {
      header.style.display = previousDisplay;
    };
  }, []);

  useEffect(() => {
    if (lessonStartRecordedRef.current || !studentEmail) return;

    lessonStartRecordedRef.current = true;
    void fetch(`/api/lessons/${lesson.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentEmail }),
    }).catch((error) => {
      console.error('Failed to record lesson start', error);
    });
  }, [lesson.id, studentEmail]);

  useEffect(() => {
    setAnsweredCheckpointIds(initialAnsweredIds);
    setCompletedCheckpointIds(lesson.completedCheckpointIds ?? []);
  }, [initialAnsweredIds, lesson.completedCheckpointIds]);

  useEffect(() => {
    setFurthestTime(resumeBaseTime);
    furthestTimeRef.current = resumeBaseTime;
    setCurrentTime(resumeBaseTime);
    lastSeekRef.current = resumeBaseTime;
    setVideoEnded(false);
  }, [resumeBaseTime]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    gradingTriggeredRef.current = false;
    setLessonAssessment(null);
    setAssessmentError(null);
    setShowLessonQr(false);
  }, [lesson.id]);

  const assessmentBadge = useMemo(() => lesson.badgeRequirements[0] ?? null, [lesson.badgeRequirements]);
  const lessonAssessmentQrUrl = useMemo(() => {
    if (typeof window === 'undefined' || !courseId || !studentId || !assessmentBadge?.badgeId) {
      return null;
    }

    const url = new URL('/qr/assessment', window.location.origin);
    url.searchParams.set('courseId', courseId);
    url.searchParams.set('studentId', studentId);
    url.searchParams.set('badgeId', assessmentBadge.badgeId);
    return url.toString();
  }, [assessmentBadge?.badgeId, courseId, studentId]);

  const lessonQrImageSrc = lessonAssessmentQrUrl
    ? `/api/qr?size=360&data=${encodeURIComponent(lessonAssessmentQrUrl)}`
    : null;

  useEffect(() => {
    if (!showLessonQr || !courseId || !assessmentBadge?.badgeId) {
      setAssessmentCode(null);
      setAssessmentCodeError(null);
      return;
    }

    let isCancelled = false;
    setAssessmentCode(null);
    setAssessmentCodeError(null);

    fetch('/api/assessment-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, badgeId: assessmentBadge.badgeId }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to create assessment code.');
        }
        if (!isCancelled) {
          setAssessmentCode(typeof payload.code === 'string' ? payload.code : null);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          setAssessmentCodeError(error instanceof Error ? error.message : 'Unable to create assessment code.');
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [assessmentBadge?.badgeId, courseId, showLessonQr]);

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
      if (modalStateRef.current === 'none') {
        setControlsVisible(false);
      }
    }, 1800) as unknown as number;
  }, [clearHideTimer]);

  const isPlaying = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    const api = (window as { YT?: YouTubeApi }).YT;
    const playerState = api?.PlayerState?.PLAYING;
    return typeof playerState === 'number' ? playerStatus === playerState : false;
  }, [playerStatus]);

  const firstIncompleteCheckpoint = useMemo(
    () => orderedCheckpoints.find((checkpoint) => !answeredCheckpointIds.includes(checkpoint.id)) ?? null,
    [orderedCheckpoints, answeredCheckpointIds]
  );

  const allCheckpointsAnswered = useMemo(
    () =>
      orderedCheckpoints.length > 0 &&
      orderedCheckpoints.every((checkpoint) => answeredCheckpointIds.includes(checkpoint.id)),
    [orderedCheckpoints, answeredCheckpointIds]
  );

  const lessonReadyForSurvey = useMemo(
    () => (orderedCheckpoints.length === 0 || allCheckpointsAnswered) && videoEnded,
    [allCheckpointsAnswered, orderedCheckpoints.length, videoEnded]
  );

  const currentCheckpoint = useMemo(() => {
    if (activeCheckpointId) {
      return orderedCheckpoints.find((checkpoint) => checkpoint.id === activeCheckpointId) ?? null;
    }
    return firstIncompleteCheckpoint;
  }, [orderedCheckpoints, activeCheckpointId, firstIncompleteCheckpoint]);

  // Which checkpoint index are we on? (-1 if none)
  const currentCheckpointIndex = useMemo(
    () => (currentCheckpoint ? orderedCheckpoints.findIndex((cp) => cp.id === currentCheckpoint.id) : -1),
    [currentCheckpoint, orderedCheckpoints]
  );

  // Which segment index are we currently playing?
  // Segment 1 = before first checkpoint,
  // Segment 2 = between checkpoint 1 and 2, etc.
  const currentSegmentIndex = useMemo(() => {
    if (orderedCheckpoints.length === 0) return 0;

    const t = currentTime;
    for (let i = 0; i < orderedCheckpoints.length; i += 1) {
      const cpTime = orderedCheckpoints[i].timeOffsetSeconds ?? 0;
      if (t < cpTime - CHECKPOINT_TRIGGER_THRESHOLD) {
        return i; // before checkpoint i -> Segment (i + 1)
      }
    }
    // after last checkpoint
    return orderedCheckpoints.length;
  }, [currentTime, orderedCheckpoints]);

  // Text shown in the top-right: Segment X or Checkpoint X
  const videoStageLabel = useMemo(() => {
    // When in a checkpoint flow, show "Checkpoint N"
    if ((modalState === 'question' || modalState === 'result') && currentCheckpointIndex >= 0) {
      const cpNumber = currentCheckpointIndex + 1;
      const cp = orderedCheckpoints[currentCheckpointIndex];
      // Prefer a custom checkpoint title if available, otherwise "Checkpoint N"
      return cp.title || `Checkpoint ${cpNumber}`;
    }

    // Otherwise we are just watching video -> show "Segment N"
    const segNumber = currentSegmentIndex + 1;
    return `Segment ${segNumber}`;
  }, [modalState, currentCheckpointIndex, orderedCheckpoints, currentSegmentIndex]);

  const primaryVideoSegment = useMemo(
    () => lesson.segments.find((segment) => !!segment.videoUrl) ?? null,
    [lesson.segments]
  );
  const youtubeId = useMemo(() => extractYouTubeId(primaryVideoSegment?.videoUrl), [primaryVideoSegment]);

  const timelineItems = useMemo(() => {
    return orderedCheckpoints.map((checkpoint, index) => {
      const isCompleted = completedCheckpointIds.includes(checkpoint.id);
      const isFailed = answeredCheckpointIds.includes(checkpoint.id) && !isCompleted;
      const isActive =
        checkpoint.id === activeCheckpointId || (!isCompleted && firstIncompleteCheckpoint?.id === checkpoint.id);
      return {
        id: checkpoint.id,
        title: checkpoint.title || `Checkpoint ${index + 1}`,
        status: isCompleted ? 'completed' : isFailed ? 'failed' : isActive ? 'current' : 'pending',
      } as const;
    });
  }, [
    orderedCheckpoints,
    answeredCheckpointIds,
    completedCheckpointIds,
    activeCheckpointId,
    firstIncompleteCheckpoint,
  ]);

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
    const durationVal = durationRef.current;
    if (durationVal > 0 && maxAllowed < Math.max(0, durationVal - 1)) {
      setVideoEnded(false);
    }
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

      console.log('[openCheckpointModal]', checkpointId);
      updateFurthestTime(checkpoint.timeOffsetSeconds, true);
      seekTo(checkpoint.timeOffsetSeconds, true, true);

      if (checkpoint.questions.length === 0) {
        setAnsweredCheckpointIds((prev) => (prev.includes(checkpoint.id) ? prev : [...prev, checkpoint.id]));
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
    let cancelled = false;

    if (!youtubeId) {
      playerRef.current?.destroy?.();
      playerRef.current = null;
      setPlayerReady(false);
      setPlayerStatus(null);
      return;
    }

    setPlayerReady(false);

    loadYouTubeIframeApi()
      .then((api) => {
        if (cancelled || !api?.Player) {
          return;
        }

        const mountElement = document.getElementById(playerElementId);
        if (!mountElement) {
          return;
        }

        if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
          playerRef.current.loadVideoById(youtubeId);
          setPlayerReady(true);
          return;
        }

        playerRef.current = new api.Player(mountElement, {
          videoId: youtubeId,
          playerVars: {
            controls: 0,
            cc_load_policy: 0,
            disablekb: 1,
            rel: 0,
            modestbranding: 1,
            origin: typeof window !== 'undefined' ? window.location.origin : undefined,
            playsinline: 1,
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
              readyPlayer?.unloadModule?.('captions');
              setCaptionsEnabled(false);

              if (typeof window !== 'undefined') {
                const apiRef = (window as { YT?: YouTubeApi }).YT;
                setPlayerStatus(apiRef?.PlayerState?.PAUSED ?? null);
              }

              setControlsVisible(true);
              scheduleHide();
            },

            onStateChange: (event) => {
              playerStateRef.current = event.data;
              const apiRef = (window as { YT?: YouTubeApi }).YT;
              console.log('[YT state]', event.data, 'modal=', modalStateRef.current);

              setIsMuted(playerRef.current?.isMuted?.() ?? false);
              setPlayerStatus(event.data);

              if (event.data === apiRef?.PlayerState?.ENDED) {
                setVideoEnded(true);
              } else if (event.data === apiRef?.PlayerState?.PLAYING) {
                setVideoEnded(false);
              }

              if (modalStateRef.current === 'none') {
                setControlsVisible(true);
                scheduleHide();
              }
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPlayerReady(false);
          setPlayerStatus(null);
        }
      });

    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [playerElementId, youtubeId, scheduleHide, seekTo]);

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

        if (firstIncompleteCheckpoint && playing && modalState === 'none') {
          const trigger = firstIncompleteCheckpoint.timeOffsetSeconds - CHECKPOINT_TRIGGER_THRESHOLD;
          if (suppressCheckpointIdRef.current === firstIncompleteCheckpoint.id) {
            // Suppression stays active until we observe playback actually land
            // before the trigger point (proof the seek completed). Only then do
            // we "arm" it so the next crossing re-opens the checkpoint. This is
            // position-based rather than time-based so a short segment between
            // the rewind point and the checkpoint can never be silently skipped.
            if (!suppressArmedRef.current) {
              if (time < trigger) {
                suppressArmedRef.current = true;
              }
              return;
            }
            if (time >= trigger) {
              suppressCheckpointIdRef.current = null;
              suppressArmedRef.current = false;
            } else {
              return;
            }
          }
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

  const handleChoiceSelect = useCallback(
    (question: LessonRecord['checkpoints'][number]['questions'][number], answerIndex: number) => {
      const supportsMultiple = (question.correctIndices ?? []).length > 1;
      setSelectedAnswers((prev) => {
        const current = prev[question.id];
        const currentIndices = current?.kind === 'multipleChoice' ? current.selectedIndices : [];
        const selectedIndices = supportsMultiple
          ? currentIndices.includes(answerIndex)
            ? currentIndices.filter((index) => index !== answerIndex)
            : [...currentIndices, answerIndex].sort((left, right) => left - right)
          : [answerIndex];

        return {
          ...prev,
          [question.id]: { kind: 'multipleChoice', selectedIndices },
        };
      });
    },
    []
  );

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

  const resetClientProgressAfterFailure = useCallback(
    (result?: LessonAssessmentResult) => {
      if (result) {
        setLessonAssessment(result);
      }
      gradingTriggeredRef.current = false;
      setAnsweredCheckpointIds([]);
      setSelectedAnswers({});
      setAttemptSummary(null);
      setActiveQuestionIndex(0);
      setActiveCheckpointId(null);
      setLessonSurveyCompleted(false);
      lessonSurveyTriggeredRef.current = false;
      setVideoEnded(false);
      setNetworkError(null);
      setFurthestTime(0);
      furthestTimeRef.current = 0;
      setCurrentTime(0);
      lastSeekRef.current = 0;
      updateFurthestTime(0, true);
      seekTo(0, true, true);
      setModalState('lessonFailed');
      lastCheckpointResumeRef.current = null;
    },
    [seekTo, updateFurthestTime]
  );

  const finalizeLessonAssessment = useCallback(async () => {
    setAssessingLesson(true);
    setAssessmentError(null);
    try {
      const response = await fetch(`/api/lessons/${lesson.id}/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: studentEmail }),
      });
      const body = (await response.json().catch(() => ({}))) as LessonAssessmentResult & { error?: string };
      if (!response.ok) {
        throw new Error(body.error || 'Unable to finalize lesson grade.');
      }
      setLessonAssessment(body);
      return body;
    } catch (error) {
      setAssessmentError(error instanceof Error ? error.message : 'Unable to finalize lesson.');
      return null;
    } finally {
      setAssessingLesson(false);
    }
  }, [lesson.id, studentEmail]);

  const handleLessonCompletion = useCallback(async () => {
    if (gradingTriggeredRef.current) {
      return;
    }
    gradingTriggeredRef.current = true;
    const result = await finalizeLessonAssessment();
    if (!result) {
      gradingTriggeredRef.current = false;
      return;
    }
    if (result.passed) {
      setModalState('lessonComplete');
      return;
    }
    resetClientProgressAfterFailure(result);
  }, [finalizeLessonAssessment, resetClientProgressAfterFailure]);

  const resetAfterCheckpoint = useCallback(
    (resumeBaseTime?: number, resumeOffset = 0.5) => {
      console.log('[resetAfterCheckpoint]');
      const baseTime = resumeBaseTime ?? currentCheckpoint?.timeOffsetSeconds ?? null;
      if (baseTime != null) {
        const targetTime = baseTime + resumeOffset;
        if (currentCheckpoint?.id) {
          scheduleCheckpointSuppression(currentCheckpoint.id);
        }
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
    [currentCheckpoint, scheduleCheckpointSuppression, seekTo, updateFurthestTime]
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
              selectedIndex: selected?.kind === 'multipleChoice' ? (selected.selectedIndices[0] ?? null) : null,
              selectedIndices: selected?.kind === 'multipleChoice' ? selected.selectedIndices : [],
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

      if (currentCheckpoint) {
        scheduleCheckpointSuppression(currentCheckpoint.id);
      }
      const baseTime = currentCheckpoint.timeOffsetSeconds;
      lastCheckpointResumeRef.current = baseTime;
      // Answering retires the checkpoint regardless of pass/fail — the student is
      // not asked it again. Whether they passed only affects the server-side grade.
      setAnsweredCheckpointIds((prev) =>
        prev.includes(currentCheckpoint.id) ? prev : [...prev, currentCheckpoint.id]
      );
      if (payload.isPassing) {
        setCompletedCheckpointIds((prev) =>
          prev.includes(currentCheckpoint.id) ? prev : [...prev, currentCheckpoint.id]
        );
      }
      setModalState('result');
      setActiveQuestionIndex(0);
    } catch (error) {
      setNetworkError(error instanceof Error ? error.message : 'Something went wrong while submitting answers.');
      setModalState('result');
    } finally {
      setIsSubmitting(false);
    }
  }, [currentCheckpoint, scheduleCheckpointSuppression, selectedAnswers, studentEmail]);

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

  const handleContinueAfterResult = useCallback(() => {
    const resumeBaseTime = lastCheckpointResumeRef.current ?? undefined;
    setAttemptSummary(null);
    setNetworkError(null);
    setSelectedAnswers({});
    setActiveQuestionIndex(0);
    lastCheckpointResumeRef.current = null;
    resetAfterCheckpoint(resumeBaseTime);
  }, [resetAfterCheckpoint]);

  const handleRewatch = useCallback(() => {
    console.log('[handleRewatch]');
    setModalState('none');
    setNetworkError(null);
    setSelectedAnswers({});
    setActiveQuestionIndex(0);

    if (currentCheckpoint && playerRef.current) {
      scheduleCheckpointSuppression(currentCheckpoint.id);
      const rewindTime = getCheckpointStartTime(orderedCheckpoints, currentCheckpoint.id);
      seekTo(Math.max(rewindTime, 0), true);
      requestAnimationFrame(() => {
        playerRef.current?.playVideo?.();
      });
    }
  }, [currentCheckpoint, orderedCheckpoints, scheduleCheckpointSuppression, seekTo]);

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

  const toggleCaptions = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    if (captionsEnabled) {
      player.unloadModule?.('captions');
    } else {
      player.loadModule?.('captions');
    }
    setCaptionsEnabled((enabled) => !enabled);
    setControlsVisible(true);
    scheduleHide();
  }, [captionsEnabled, scheduleHide]);

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
      await handleLessonCompletion();
    } catch (error) {
      setLessonSurveyError(
        error instanceof Error ? error.message : 'Something went wrong while submitting your survey.'
      );
    } finally {
      setLessonSurveySubmitting(false);
    }
  }, [effectiveLessonSurvey, handleLessonCompletion, lesson.id, lessonSurveyRating, studentEmail]);

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
      modalState === 'lessonComplete' ||
      modalState === 'lessonFailed'
    ) {
      ensurePlayerPaused();
    }
  }, [ensurePlayerPaused, modalState]);

  const currentCheckpointQuestions = currentCheckpoint?.questions ?? [];
  const totalCheckpointQuestions = currentCheckpointQuestions.length;
  const currentQuestion =
    totalCheckpointQuestions > 0 ? (currentCheckpointQuestions[activeQuestionIndex] ?? null) : null;
  const currentAnswer = currentQuestion ? (selectedAnswers[currentQuestion.id] ?? null) : null;
  const currentShortAnswerValue = currentAnswer?.kind === 'shortAnswer' ? currentAnswer.raw : '';
  const canAdvance = currentQuestion
    ? (() => {
        const selection = selectedAnswers[currentQuestion.id];
        if (!selection) {
          return false;
        }
        if (currentQuestion.type === 'shortAnswer') {
          return selection.kind === 'shortAnswer' && selection.value != null && !selection.hasError;
        }
        return selection.kind === 'multipleChoice' && selection.selectedIndices.length > 0;
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

    void handleLessonCompletion();
  }, [
    ensurePlayerPaused,
    firstIncompleteCheckpoint,
    effectiveLessonSurvey,
    lessonSurveyCompleted,
    openCheckpointModal,
    seekTo,
    updateFurthestTime,
    handleLessonCompletion,
  ]);

  const handleShowQrCode = useCallback(() => {
    setShowLessonQr(true);
  }, []);

  const handleRestartAfterFailure = useCallback(() => {
    setModalState('none');
    requestAnimationFrame(() => {
      playerRef.current?.playVideo?.();
    });
  }, []);

  const handleGoHome = useCallback(() => {
    router.push('/');
  }, [router]);

  const handleGoCourseDashboard = useCallback(() => {
    router.push(`/course_dashboard?courseId=${courseId}`);
  }, [router, courseId]);

  const handleBackToLessonDetail = useCallback(() => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push(`/lessons/${lesson.slug}`);
  }, [lesson.slug, router]);

  const handleUnlockProgressForTesting = useCallback(() => {
    if (duration <= 0) {
      return;
    }
    setFurthestTime(duration);
    furthestTimeRef.current = duration;
    setAnsweredCheckpointIds(orderedCheckpoints.map((cp) => cp.id));
    setActiveCheckpointId(null);
    setSelectedAnswers({});
    setAttemptSummary(null);
    setNetworkError(null);
    setModalState('none');
    setActiveQuestionIndex(0);
  }, [duration, orderedCheckpoints]);

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <button type="button" className={styles.backButton} onClick={handleBackToLessonDetail}>
          <svg className={styles.backIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M15 5l-7 7 7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Back</span>
        </button>

        <aside className={styles.timeline}>
          {timelineItems.map((item, index) => {
            const checkpointClass = [
              styles.timelineCheckpoint,
              item.status === 'completed' ? styles.timelineCheckpointCompleted : '',
              item.status === 'failed' ? styles.timelineCheckpointFailed : '',
              item.status === 'current' ? styles.timelineCheckpointActive : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div key={item.id} className={styles.timelineItem}>
                <div className={checkpointClass}>
                  {item.status === 'completed' ? '✓' : item.status === 'failed' ? '×' : index + 1}
                </div>
                <span className={styles.timelineLabel}>{item.title}</span>
              </div>
            );
          })}
        </aside>

        <div className={styles.mainColumn}>
          <div className={styles.videoHeader}>
            <div className={styles.videoHeadingLeft}>
              <h1 className={styles.videoTitle}>{lesson.title}</h1>
            </div>

            <div className={styles.videoSegment}>{videoStageLabel}</div>
          </div>

          <div
            className={styles.videoWrapper}
            onMouseMove={handleMouseMoveVideo}
            onMouseEnter={handleMouseMoveVideo}
            onMouseLeave={handleMouseLeaveVideo}
          >
            <div id={playerElementId} className={styles.youtubeFrame} />

            <div className={`${styles.qevBar} ${controlsVisible ? '' : styles.qevBarHidden}`}>
              {/* TOP ROW: progress bar + time */}
              <div className={styles.qevTopRow}>
                <div className={styles.qevRailWrap}>
                  {duration > 0 &&
                    orderedCheckpoints.map((cp) => {
                      const leftPct = Math.min(100, Math.max(0, (cp.timeOffsetSeconds / duration) * 100));
                      const done = answeredCheckpointIds.includes(cp.id);
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

                <span className={styles.qevTime}>
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {/* BOTTOM ROW: buttons */}
              <div className={styles.qevBottomRow}>
                {/* Play / Pause */}
                <button
                  type="button"
                  className={styles.qevBtn}
                  onClick={togglePlay}
                  disabled={modalState !== 'none'}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  <Image
                    src={isPlaying ? pauseIcon : playIcon}
                    alt={isPlaying ? 'Pause' : 'Play'}
                    className={styles.qevIcon}
                    width={30}
                    height={30}
                  />
                </button>

                {/* Volume */}
                <button
                  type="button"
                  className={styles.qevBtn}
                  onClick={toggleMute}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                >
                  <Image
                    src="/assets/lesson/qev/Volume.svg"
                    alt={isMuted ? 'Muted' : 'Volume'}
                    className={styles.qevIcon}
                    width={41}
                    height={41}
                  />
                </button>

                <button
                  type="button"
                  className={`${styles.qevBtn} ${styles.captionButton} ${captionsEnabled ? styles.captionButtonActive : ''}`}
                  onClick={toggleCaptions}
                  aria-label={captionsEnabled ? 'Turn captions off' : 'Turn captions on'}
                  aria-pressed={captionsEnabled}
                >
                  CC
                </button>

                {/* Rewind (e.g., back 10s) */}
                <button
                  type="button"
                  className={styles.qevBtn}
                  onClick={() => seekTo(Math.max(0, currentTime - 10))}
                  aria-label="Rewind 10 seconds"
                >
                  <Image
                    src="/assets/lesson/qev/Rewind.svg"
                    alt="Rewind"
                    className={styles.qevIcon}
                    width={34}
                    height={34}
                  />
                </button>
              </div>
            </div>

            {modalState !== 'none' && modalState !== 'lessonSurvey' ? (
              <div className={styles.overlay}>
                <div className={styles.modalCard}>
                  {modalState === 'question' && currentCheckpoint ? (
                    currentQuestion ? (
                      <>
                        <h2 className={styles.modalTitle}>{currentCheckpoint.title}</h2>
                        <p className={styles.modalDescription}>Answer each question to continue.</p>
                        <div className={styles.questionList}>
                          <div className={styles.questionHeading}>
                            <span>
                              Question {activeQuestionIndex + 1} of {totalCheckpointQuestions}
                            </span>
                          </div>
                          <div
                            className={`${styles.questionPrompt} ${styles.questionRichText}`}
                            dangerouslySetInnerHTML={{
                              __html: sanitizeQuestionRichText(currentQuestion.prompt ?? 'Choose the correct answer.'),
                            }}
                          />
                          <div className={styles.answerOptions}>
                            {currentQuestion.type === 'multipleChoice' ? (
                              (Array.isArray(currentQuestion.options) ? currentQuestion.options : []).map(
                                (option, optionIndex) => {
                                  const selection = selectedAnswers[currentQuestion.id];
                                  const isSelected =
                                    selection?.kind === 'multipleChoice' &&
                                    selection.selectedIndices.includes(optionIndex);
                                  const supportsMultiple = (currentQuestion.correctIndices ?? []).length > 1;
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
                                      onClick={() => handleChoiceSelect(currentQuestion, optionIndex)}
                                      aria-pressed={isSelected}
                                    >
                                      {supportsMultiple ? `${isSelected ? '✓ ' : ''}` : ''}
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
                                  value={currentShortAnswerValue}
                                  onChange={(event) => handleShortAnswerChange(currentQuestion.id, event.target.value)}
                                  placeholder="Enter a number"
                                />
                                <p className={styles.shortAnswerHelp}>Enter a numeric response</p>
                                {currentAnswer?.kind === 'shortAnswer' && currentAnswer.hasError ? (
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

                  {modalState === 'result' ? (
                    attemptSummary ? (
                      <>
                        <h2 className={styles.modalTitle}>Checkpoint summary</h2>
                        <p className={styles.modalDescription}>
                          {attemptSummary.isPassing
                            ? 'Nice work — you passed this checkpoint.'
                            : 'Not quite. You can rewatch this section to review, or continue on.'}
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
                        <div className={styles.controlRow}>
                          {!attemptSummary.isPassing ? (
                            <button
                              type="button"
                              className={`${styles.controlButton} ${styles.controlButtonSecondary}`}
                              onClick={handleRewatch}
                            >
                              Rewatch section
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={`${styles.controlButton} ${styles.controlButtonPrimary}`}
                            onClick={handleContinueAfterResult}
                          >
                            Continue
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <h2 className={styles.modalTitle}>We couldn’t save your answers</h2>
                        <p className={styles.modalDescription}>{networkError || 'Please try submitting again.'}</p>
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
                            onClick={submitAttempt}
                            disabled={isSubmitting}
                          >
                            {isSubmitting ? 'Submitting…' : 'Retry submission'}
                          </button>
                        </div>
                      </>
                    )
                  ) : null}

                  {modalState === 'success' ? (
                    <>
                      <h2 className={styles.modalTitle}>Checkpoint cleared!</h2>
                      <p className={styles.modalDescription}>Great work—keep going to finish the lesson.</p>
                    </>
                  ) : null}

                  {modalState === 'lessonFailed' ? (
                    <>
                      <h2 className={styles.modalTitle}>Lesson needs another try</h2>
                      <p className={styles.modalDescription}>
                        Your grade for this lesson is{' '}
                        <strong>{lessonAssessment ? `${lessonAssessment.gradePercent.toFixed(1)}%` : '—'}</strong>,
                        which is below the instructor threshold of{' '}
                        <strong>{lessonAssessment ? `${lessonAssessment.passingPercent}%` : '—'}</strong>. Please redo
                        the lesson.
                      </p>
                      {assessmentError ? <p className={styles.modalError}>{assessmentError}</p> : null}
                      <div className={styles.modalActions}>
                        <button type="button" className={styles.modalSecondary} onClick={handleRestartAfterFailure}>
                          Restart now
                        </button>
                        <button type="button" className={styles.modalSecondary} onClick={handleGoCourseDashboard}>
                          Go to course
                        </button>
                      </div>
                    </>
                  ) : null}

                  {modalState === 'lessonComplete' ? (
                    <>
                      <h2 className={styles.modalTitle}>Lesson Completed</h2>
                      <p className={styles.modalDescription}>
                        You’re all set! Show your assessor the QR code to finalize this lesson.
                      </p>
                      <div className={styles.modalStats}>
                        <div className={styles.modalStat}>
                          Grade
                          <span className={styles.modalStatValue}>
                            {lessonAssessment ? `${lessonAssessment.gradePercent.toFixed(1)}%` : '—'}
                          </span>
                        </div>
                        <div className={styles.modalStat}>
                          Required to pass
                          <span className={styles.modalStatValue}>
                            {lessonAssessment ? `${lessonAssessment.passingPercent}%` : '—'}
                          </span>
                        </div>
                      </div>
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
                const imgClassNames = [
                  styles.lessonSurveyFaceImage,
                  isSelected ? styles.lessonSurveyFaceImageSelected : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                const iconSrc = isSelected ? (face.selectedIcon ?? face.icon) : face.icon;
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
                    <Image src={iconSrc} alt={face.label} className={imgClassNames} />
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className={styles.lessonSurveySubmit}
              onClick={submitLessonSurvey}
              disabled={lessonSurveySubmitting || assessingLesson}
            >
              {lessonSurveySubmitting || assessingLesson ? 'Submitting…' : 'Submit feedback'}
            </button>
          </div>
        </div>
      )}
      {showLessonQr ? (
        <div className={styles.overlay}>
          <div className={styles.qrModal} role="dialog" aria-modal="true">
            <button type="button" className={styles.qrCloseButton} onClick={() => setShowLessonQr(false)}>
              &times;
            </button>
            <h2 className={styles.modalTitle}>{assessmentBadge?.badgeName ?? 'Badge'} Skill Check</h2>
            {lessonQrImageSrc ? (
              <div className={styles.qrCodeFrame}>
                <div className={styles.qrCodeCanvas}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={lessonQrImageSrc}
                    alt={`${assessmentBadge?.badgeName ?? 'Badge'} QR code`}
                    className={styles.qrCodeImage}
                    width={360}
                    height={360}
                  />
                  <div className={styles.qrCodeLogo}>
                    <Image
                      src="/assets/badge_wallet/QR/qr_logo.svg"
                      alt="Checkd logo"
                      width={74}
                      height={74}
                      className={styles.qrCodeLogoImage}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <p className={styles.modalError}>We could not build the assessment QR code for this lesson.</p>
            )}
            <div className={styles.assessmentCodeBox}>
              <span className={styles.assessmentCodeLabel}>Assessment code</span>
              <strong className={styles.assessmentCodeValue}>{assessmentCode ?? 'Generating...'}</strong>
              {assessmentCodeError ? <p className={styles.assessmentCodeError}>{assessmentCodeError}</p> : null}
            </div>
            <p className={styles.modalDescription}>
              Have your assessor scan this code to open the assessment for this student and badge.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
