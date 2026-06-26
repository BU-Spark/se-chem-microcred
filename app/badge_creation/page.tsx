'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';
import { useStudentData } from '../hooks/useStudentData';
import styles from './page.module.css';
import { DEFAULT_DRAFT, DRAFT_STORAGE_KEY, STEP_DEFINITIONS } from './types';
import type { BadgeDraft, BadgesResponse, CheckpointDraft, RubricCriterion } from './types';
import {
  badgeToDraft,
  buildVideoThumbnail,
  extractYouTubeId,
  formatSecondsToTimecode,
  isValidVideoLength,
  isValidYouTubeUrl,
} from './lib/badge-helpers';
import ProgressStep from './components/ProgressStep';
import SuccessModal from './components/SuccessModal';
import BadgeInfoStep from './steps/BadgeInfoStep';
import LessonVideoStep from './steps/LessonVideoStep';
import CheckpointsStep from './steps/CheckpointsStep';
import RubricStep from './steps/RubricStep';
import ReviewStep from './steps/ReviewStep';

type StepKey = 'badgeInfo' | 'lessonVideo' | 'checkpoints' | 'configurations' | 'rubric' | 'review';

type StepDefinition = {
  key: StepKey;
  label: string;
};

type CheckpointDraft = {
  id: string;
  title: string;
  time: string;
  points: number;
  question: string;
  questionType: 'multipleChoice' | 'shortAnswer';
  options: string[];
  correctIndices: number[];
  numericAnswer: string;
  numericRangeMin: string;
  numericRangeMax: string;
  segmentLabel: string;
};

type RubricCriterion = {
  id: string;
  prompt: string;
  options: string[];
};

type RubricItem = {
  id: string;
  text: string;
};

type BadgeDraft = {
  badgeName: string;
  badgeDescription: string;
  category: BadgeCategory;
  availableOn: string;
  closesOn: string;
  neverCloses: boolean;
  youtubeUrl: string;
  videoTitle: string;
  videoLength: string;
  checkpoints: CheckpointDraft[];
  reassessmentLimit: number;
  cooldownDays: number;
  reassessmentRequired: boolean;
  reassessmentResources: string[];
  rubricOverview: string;
  rubricItems: RubricItem[];
  rubricCriteria: RubricCriterion[];
};

type BadgeCatalogItem = {
  id: string;
  name: string;
  description: string | null;
  category: BadgeCategory | null;
  requirements: Array<{
    displayText: string;
    rubricItems: Array<{ number: number; text: string }>;
    gradingCriteria: Array<{ number: number; criterion: string | null; options: string[] }>;
    checkpoints?: Array<Partial<CheckpointDraft> & { number?: number; correctIndex?: number | null }>;
    lesson: {
      title: string;
      description: string | null;
      dueDate: string | null;
      estimatedMinutes: number | null;
      segment: {
        title: string;
        duration: number | null;
        videoUrl: string | null;
      } | null;
    } | null;
  }>;
};

type BadgesResponse = {
  badges: BadgeCatalogItem[];
};

const DRAFT_STORAGE_KEY = 'badge_creation_draft_v1';
const DEFAULT_VIDEO_FALLBACK = 'Lesson video';

const STEP_DEFINITIONS: StepDefinition[] = [
  { key: 'badgeInfo', label: 'Badge Info' },
  { key: 'lessonVideo', label: 'Upload Lesson Video' },
  { key: 'checkpoints', label: 'Create Checkpoints' },
  { key: 'rubric', label: 'Create Rubric' },
  { key: 'review', label: 'Review' },
];

const DEFAULT_DRAFT: BadgeDraft = {
  badgeName: '',
  badgeDescription: '',
  category: 'OTHER',
  availableOn: '',
  closesOn: '',
  neverCloses: true,
  youtubeUrl: '',
  videoTitle: '',
  videoLength: '',
  checkpoints: [
    {
      id: 'checkpoint-1',
      title: 'Checkpoint 1',
      time: '00:00:00',
      points: 5,
      question: '',
      questionType: 'multipleChoice',
      options: ['', ''],
      correctIndices: [0],
      numericAnswer: '',
      numericRangeMin: '',
      numericRangeMax: '',
      segmentLabel: 'Segment 1 Starts 00:00:00',
    },
  ],
  reassessmentLimit: 0,
  cooldownDays: 0,
  reassessmentRequired: false,
  reassessmentResources: [],
  rubricOverview: '',
  rubricItems: [
    {
      id: 'rubric-item-1',
      text: '',
    },
  ],
  rubricCriteria: [
    {
      id: 'criterion-1',
      prompt: '',
      options: ['', '', ''],
    },
  ],
};

function extractYouTubeId(url?: string | null) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '') || null;
    }

    const queryId = parsed.searchParams.get('v');
    if (queryId) return queryId;

    const parts = parsed.pathname.split('/');
    const embedIndex = parts.indexOf('embed');
    if (embedIndex >= 0) {
      return parts[embedIndex + 1] ?? null;
    }
  } catch {
    return null;
  }

  return null;
}

function formatDisplayDate(dateValue: string, fallback = 'Not scheduled') {
  if (!dateValue) return fallback;

  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return fallback;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildVideoEmbedUrl(url: string) {
  const videoId = extractYouTubeId(url);
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}

function buildVideoThumbnail(url: string) {
  const videoId = extractYouTubeId(url);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}

const HMS_REGEX = /^\d{2}:\d{2}:\d{2}$/;
const YOUTUBE_WATCH_REGEX = /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]+/;
const MIN_CHOICES = 2;
const MAX_CHOICES = 4;

function isLongerThanTwo(value: string) {
  return value.trim().length > 2;
}

// Parses an HH:MM:SS string into total seconds, or null if the format is invalid.
function parseHmsToSeconds(value: string): number | null {
  const trimmed = value.trim();
  if (!HMS_REGEX.test(trimmed)) return null;
  const [hours, minutes, seconds] = trimmed.split(':').map(Number);
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function formatDateInput(value?: string | null) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toISOString().slice(0, 10);
}

function formatDurationInput(seconds?: number | null, fallbackMinutes?: number | null) {
  const totalSeconds = seconds ?? (fallbackMinutes ? fallbackMinutes * 60 : 0);
  if (!totalSeconds) return '';

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  return [hours, minutes, remainingSeconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function checkpointFromCatalog(
  checkpoint: (Partial<CheckpointDraft> & { number?: number; correctIndex?: number | null }) | undefined,
  index: number
): CheckpointDraft {
  const title = checkpoint?.title || `Checkpoint ${index + 1}`;
  const options = checkpoint?.options?.length ? checkpoint.options : ['', '', '', ''];
  const correctIndices =
    checkpoint?.correctIndices?.length &&
    checkpoint.correctIndices.every((optionIndex) => typeof optionIndex === 'number')
      ? checkpoint.correctIndices
      : typeof checkpoint?.correctIndex === 'number'
        ? [checkpoint.correctIndex]
        : [0];

  return {
    id: `checkpoint-${index + 1}`,
    title,
    time: checkpoint?.time || '00:00:00',
    points: Number(checkpoint?.points) || 5,
    question: checkpoint?.question || '',
    questionType: checkpoint?.questionType === 'shortAnswer' ? 'shortAnswer' : 'multipleChoice',
    options: [...options, '', ''].slice(0, Math.max(MIN_CHOICES, options.length)),
    correctIndices,
    numericAnswer: checkpoint?.numericAnswer ? String(checkpoint.numericAnswer) : '',
    numericRangeMin: checkpoint?.numericRangeMin ? String(checkpoint.numericRangeMin) : '',
    numericRangeMax: checkpoint?.numericRangeMax ? String(checkpoint.numericRangeMax) : '',
    segmentLabel: checkpoint?.segmentLabel || `Segment ${index + 1} Starts ${checkpoint?.time || '00:00:00'}`,
  };
}

function badgeToDraft(badge: BadgeCatalogItem): BadgeDraft {
  const requirement = badge.requirements[0];
  const lesson = requirement?.lesson ?? null;
  const segment = lesson?.segment ?? null;
  const rubricItems = requirement?.rubricItems?.length
    ? requirement.rubricItems.map((item) => ({
        id: `rubric-item-${item.number}`,
        text: item.text,
      }))
    : [{ id: 'rubric-item-1', text: requirement?.displayText ?? '' }];
  const rubricCriteria = requirement?.gradingCriteria?.length
    ? requirement.gradingCriteria.map((criterion) => ({
        id: `criterion-${criterion.number}`,
        prompt: criterion.criterion ?? '',
        options: criterion.options.length ? criterion.options : ['', '', ''],
      }))
    : DEFAULT_DRAFT.rubricCriteria;

  return {
    ...DEFAULT_DRAFT,
    badgeName: badge.name,
    badgeDescription: badge.description ?? '',
    category: badge.category ?? 'OTHER',
    closesOn: formatDateInput(lesson?.dueDate),
    neverCloses: !lesson?.dueDate,
    youtubeUrl: segment?.videoUrl ?? '',
    videoTitle: segment?.title ?? lesson?.title ?? '',
    videoLength: formatDurationInput(segment?.duration, lesson?.estimatedMinutes),
    checkpoints: requirement?.checkpoints?.length
      ? requirement.checkpoints.map((checkpoint, index) => checkpointFromCatalog(checkpoint, index))
      : DEFAULT_DRAFT.checkpoints,
    rubricItems,
    rubricCriteria,
  };
}

function ProgressStep({ index, activeIndex, label }: { index: number; activeIndex: number; label: string }) {
  const isComplete = index < activeIndex;
  const isActive = index === activeIndex;

  return (
    <div className={styles.progressStep}>
      <div
        className={styles.progressDot}
        data-active={isActive ? 'true' : 'false'}
        data-complete={isComplete ? 'true' : 'false'}
      >
        {(isActive || isComplete) && <span className={styles.progressDotFill} />}
      </div>
      <span className={styles.progressLabel}>{label}</span>
    </div>
  );
}


export default function BadgeCreationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoaded, isSignedIn } = useUser();
  const { signOut } = useAuth();
  const { data: studentData } = useStudentData(user?.primaryEmailAddress?.emailAddress);
  const courseId = searchParams.get('courseId');
  const editBadgeId = searchParams.get('badgeId');
  const isEditMode = Boolean(editBadgeId);

  const [currentStep, setCurrentStep] = useState(0);
  const [draft, setDraft] = useState<BadgeDraft>(DEFAULT_DRAFT);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [submissionState, setSubmissionState] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [stepError, setStepError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingEditBadge, setIsLoadingEditBadge] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (typeof window === 'undefined' || isEditMode) return;

    const storedDraft = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!storedDraft) return;

    try {
      const parsed = JSON.parse(storedDraft) as Partial<BadgeDraft>;
      setDraft((current) => ({
        ...current,
        ...parsed,
        checkpoints: parsed.checkpoints ?? current.checkpoints,
        reassessmentResources: parsed.reassessmentResources ?? current.reassessmentResources,
        rubricItems: parsed.rubricItems ?? current.rubricItems,
        rubricCriteria: parsed.rubricCriteria ?? current.rubricCriteria,
      }));
    } catch {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }, [isEditMode]);

  useEffect(() => {
    if (typeof window === 'undefined' || isEditMode) return;
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [draft, isEditMode]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !editBadgeId) return;

    let isActive = true;

    const loadBadgeForEditing = async () => {
      setIsLoadingEditBadge(true);
      setSubmitError('');

      try {
        const response = await fetch('/api/badges', {
          headers: { Accept: 'application/json' },
        });
        const payload = (await response.json().catch(() => ({
          error: `Request failed with status ${response.status}`,
        }))) as BadgesResponse & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load badge.');
        }

        const badge = payload.badges.find((entry) => entry.id === editBadgeId);
        if (!badge) {
          throw new Error('Badge not found.');
        }

        if (isActive) {
          setDraft(badgeToDraft(badge));
        }
      } catch (error) {
        if (isActive) {
          setSubmitError(error instanceof Error ? error.message : 'Failed to load badge.');
        }
      } finally {
        if (isActive) {
          setIsLoadingEditBadge(false);
        }
      }
    };

    void loadBadgeForEditing();

    return () => {
      isActive = false;
    };
  }, [editBadgeId, isLoaded, isSignedIn]);

  const displayName = studentData?.student?.name || user?.fullName || '';
  const activeStep = STEP_DEFINITIONS[currentStep];
  const videoId = extractYouTubeId(draft.youtubeUrl);
  const videoThumbnail = buildVideoThumbnail(draft.youtubeUrl);

  if (!isLoaded || !isSignedIn) return null;

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/sign-in');
    } catch (error) {
      console.error('Sign out failed', error);
      setIsSigningOut(false);
    }
  };

  const updateDraft = <K extends keyof BadgeDraft>(field: K, value: BadgeDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setSubmissionState(null);
    setSubmitError('');
    setStepError('');
  };

  // Apply a transform to the checkpoints list using the LATEST committed draft
  // (functional setState), not the render-time closure. Reading draft.checkpoints
  // directly would drop edits made in rapid succession / the same React batch.
  const mutateCheckpoints = (updater: (checkpoints: CheckpointDraft[]) => CheckpointDraft[]) => {
    setDraft((current) => ({ ...current, checkpoints: updater(current.checkpoints) }));
    setSubmissionState(null);
    setSubmitError('');
  };

  const updateCheckpoint = <K extends keyof CheckpointDraft>(
    checkpointId: string,
    field: K,
    value: CheckpointDraft[K]
  ) => {
    mutateCheckpoints((checkpoints) =>
      checkpoints.map((checkpoint) => (checkpoint.id === checkpointId ? { ...checkpoint, [field]: value } : checkpoint))
    );
  };

  const updateCheckpointOption = (checkpointId: string, optionIndex: number, value: string) => {
    mutateCheckpoints((checkpoints) =>
      checkpoints.map((checkpoint) => {
        if (checkpoint.id !== checkpointId) return checkpoint;
        const nextOptions = checkpoint.options.map((option, index) => (index === optionIndex ? value : option));
        return { ...checkpoint, options: nextOptions };
      })
    );
  };

  const toggleCheckpointCorrectOption = (checkpointId: string, optionIndex: number) => {
    mutateCheckpoints((checkpoints) =>
      checkpoints.map((checkpoint) => {
        if (checkpoint.id !== checkpointId) return checkpoint;

        const correctSet = new Set(checkpoint.correctIndices);
        if (correctSet.has(optionIndex)) {
          correctSet.delete(optionIndex);
        } else {
          correctSet.add(optionIndex);
        }

        return {
          ...checkpoint,
          correctIndices: Array.from(correctSet).sort((left, right) => left - right),
        };
      })
    );
  };

  // Returns the new checkpoint's id so the step can immediately open its editor
  // modal. `atSeconds` is the live playhead position from the video player.
  const addCheckpoint = (atSeconds?: number) => {
    const id = `checkpoint-${Date.now()}`;
    const time = formatSecondsToTimecode(atSeconds ?? 0);
    setDraft((current) => {
      const nextCount = current.checkpoints.length + 1;
      return {
        ...current,
        checkpoints: [
          ...current.checkpoints,
          {
            id,
            title: `Checkpoint ${nextCount}`,
            time,
            points: 5,
            question: '',
            questionType: 'multipleChoice',
            options: ['', '', '', ''],
            correctIndices: [0],
            numericAnswer: '',
            numericRangeMin: '',
            numericRangeMax: '',
            unit: '',
            incorrectFeedback: '',
            incorrectFeedbackEnabled: false,
            segmentLabel: `Segment ${nextCount} Starts ${time}`,
          },
        ],
      };
    });
    setSubmissionState(null);
    setSubmitError('');
    return id;
  };

  const removeCheckpoint = (checkpointId: string) => {
    mutateCheckpoints((checkpoints) => checkpoints.filter((checkpoint) => checkpoint.id !== checkpointId));
  };

  const updateRubricCriterion = <K extends keyof RubricCriterion>(
    criterionId: string,
    field: K,
    value: RubricCriterion[K]
  ) => {
    updateDraft(
      'rubricCriteria',
      draft.rubricCriteria.map((criterion) =>
        criterion.id === criterionId ? { ...criterion, [field]: value } : criterion
      )
    );
  };

  const updateRubricItem = (itemId: string, text: string) => {
    updateDraft(
      'rubricItems',
      draft.rubricItems.map((item) => (item.id === itemId ? { ...item, text } : item))
    );
  };

  const addRubricItem = () => {
    updateDraft('rubricItems', [
      ...draft.rubricItems,
      {
        id: `rubric-item-${Date.now()}`,
        text: '',
      },
    ]);
  };

  const removeRubricItem = (itemId: string) => {
    if (draft.rubricItems.length <= 1) return;

    updateDraft(
      'rubricItems',
      draft.rubricItems.filter((item) => item.id !== itemId)
    );
  };

  const addRubricCriterion = () => {
    updateDraft('rubricCriteria', [
      ...draft.rubricCriteria,
      {
        id: `criterion-${Date.now()}`,
        prompt: '',
        options: ['', '', ''],
        optionFeedback: ['', '', ''],
      },
    ]);
  };

  const removeRubricCriterion = (criterionId: string) => {
    if (draft.rubricCriteria.length <= 1) return;

    updateDraft(
      'rubricCriteria',
      draft.rubricCriteria.filter((criterion) => criterion.id !== criterionId)
    );
  };

  const updateRubricCriterionOption = (criterionId: string, optionIndex: number, value: string) => {
    updateDraft(
      'rubricCriteria',
      draft.rubricCriteria.map((criterion) => {
        if (criterion.id !== criterionId) return criterion;

        return {
          ...criterion,
          options: criterion.options.map((option, index) => (index === optionIndex ? value : option)),
        };
      })
    );
  };

  // Prewritten feedback is kept index-aligned with `options`.
  const updateRubricCriterionOptionFeedback = (criterionId: string, optionIndex: number, value: string) => {
    updateDraft(
      'rubricCriteria',
      draft.rubricCriteria.map((criterion) => {
        if (criterion.id !== criterionId) return criterion;

        const optionFeedback = [...criterion.optionFeedback];
        while (optionFeedback.length < criterion.options.length) optionFeedback.push('');
        optionFeedback[optionIndex] = value;

        return { ...criterion, optionFeedback };
      })
    );
  };

  const addRubricCriterionOption = (criterionId: string) => {
    updateDraft(
      'rubricCriteria',
      draft.rubricCriteria.map((criterion) =>
        criterion.id === criterionId
          ? { ...criterion, options: [...criterion.options, ''], optionFeedback: [...criterion.optionFeedback, ''] }
          : criterion
      )
    );
  };

  const removeRubricCriterionOption = (criterionId: string, optionIndex: number) => {
    updateDraft(
      'rubricCriteria',
      draft.rubricCriteria.map((criterion) => {
        if (criterion.id !== criterionId || criterion.options.length <= 1) return criterion;

        return {
          ...criterion,
          options: criterion.options.filter((_, index) => index !== optionIndex),
          optionFeedback: criterion.optionFeedback.filter((_, index) => index !== optionIndex),
        };
      })
    );
  };

  const goToStep = (stepIndex: number) => {
    setCurrentStep(stepIndex);
    setSubmissionState(null);
  };

  const saveBadge = async () => {
    const response = await fetch('/api/badges', {
      method: isEditMode ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: editBadgeId,
        courseId,
        ...draft,
      }),
    });

    const payload = await response.json().catch(() => ({
      error: `Request failed with status ${response.status}`,
    }));

    if (!response.ok) {
      throw new Error(payload.error ?? `Failed to ${isEditMode ? 'update' : 'create'} badge.`);
    }

    return payload;
  };

  const handleSuccessClose = () => {
    setIsSuccessModalOpen(false);
    // Always return to the badge list, no matter how the modal is dismissed.
    if (typeof window !== 'undefined') {
      // Hard navigation: router.push() no-ops from an async handler after setState in Next 15,
      // and a full load ensures /my_badges shows fresh data including the new badge.
      window.location.assign('/my_badges');
      return;
    }
    router.push('/my_badges');
  };

  // Validates a single step's fields, returning a user-facing message or null when valid.
  const validateStep = (stepKey: StepKey): string | null => {
    if (stepKey === 'badgeInfo') {
      if (draft.badgeName.trim().length === 0) return 'Badge name is required.';
      if (!isLongerThanTwo(draft.badgeDescription)) return 'Badge description must be longer than 2 characters.';
      return null;
    }

    if (stepKey === 'lessonVideo') {
      if (!YOUTUBE_WATCH_REGEX.test(draft.youtubeUrl.trim())) {
        return 'Enter a valid YouTube video link (e.g. https://www.youtube.com/watch?v=...).';
      }
      if (!isLongerThanTwo(draft.videoTitle)) return 'Video title must be longer than 2 characters.';
      if (parseHmsToSeconds(draft.videoLength) === null) {
        return 'Length must be in HH:MM:SS format (e.g. 00:20:00).';
      }
      return null;
    }

    if (stepKey === 'checkpoints') {
      const videoSeconds = parseHmsToSeconds(draft.videoLength);
      for (const [index, checkpoint] of draft.checkpoints.entries()) {
        const label = `Checkpoint ${index + 1}`;
        if (!isLongerThanTwo(checkpoint.segmentLabel))
          return `${label}: segment label must be longer than 2 characters.`;

        const timeSeconds = parseHmsToSeconds(checkpoint.time);
        if (timeSeconds === null) return `${label}: timestamp must be in HH:MM:SS format.`;
        if (videoSeconds !== null && timeSeconds > videoSeconds) {
          return `${label}: timestamp cannot be later than the video length (${draft.videoLength}).`;
        }

        if (!isLongerThanTwo(checkpoint.question)) return `${label}: question prompt must be longer than 2 characters.`;

        if (checkpoint.questionType === 'multipleChoice') {
          if (checkpoint.options.some((option) => option.trim().length === 0)) {
            return `${label}: every choice must have text.`;
          }
          if (checkpoint.correctIndices.length === 0) {
            return `${label}: mark at least one choice as correct.`;
          }
        } else {
          const answer = checkpoint.numericAnswer.trim();
          const min = checkpoint.numericRangeMin.trim();
          const max = checkpoint.numericRangeMax.trim();
          if (min !== '' && max !== '' && Number(min) > Number(max)) {
            return `${label}: accepted minimum cannot be greater than accepted maximum.`;
          }
          if (answer !== '' && min !== '' && Number(answer) < Number(min)) {
            return `${label}: accepted answer cannot be below the accepted minimum.`;
          }
          if (answer !== '' && max !== '' && Number(answer) > Number(max)) {
            return `${label}: accepted answer cannot be above the accepted maximum.`;
          }
        }
      }
      return null;
    }

    if (stepKey === 'rubric') {
      for (const [index, item] of draft.rubricItems.entries()) {
        if (!isLongerThanTwo(item.text)) return `Rubric item ${index + 1} must be longer than 2 characters.`;
      }
      return null;
    }

    return null;
  };

  const handleNext = async () => {
    // Block leaving the Upload Lesson Video step with an invalid link/length so
    // a value like "a" can't be saved.
    if (currentStep === 1) {
      const urlInvalid = Boolean(draft.youtubeUrl.trim()) && !isValidYouTubeUrl(draft.youtubeUrl);
      const lengthInvalid = Boolean(draft.videoLength.trim()) && !isValidVideoLength(draft.videoLength);
      if (urlInvalid || lengthInvalid) {
        setSubmitError('Fix the highlighted video fields before continuing.');
        return;
      }
    }

    if (currentStep < STEP_DEFINITIONS.length - 1) {
      setCurrentStep((step) => step + 1);
      return;
    }

    // Final submit: re-validate every step so edits made via "Edit" links can't bypass checks.
    for (const step of STEP_DEFINITIONS) {
      const error = validateStep(step.key);
      if (error) {
        setStepError(error);
        return;
      }
    }

    setSubmitError('');
    setIsSubmitting(true);

    try {
      await saveBadge();
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
      setSubmissionState(`Badge ${isEditMode ? 'updated' : 'created'} successfully.`);
      setIsSuccessModalOpen(true);
    } catch (error) {
      console.error(error);
      setSubmitError(error instanceof Error ? error.message : `Failed to ${isEditMode ? 'update' : 'create'} badge.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`page ${styles.page}`}>
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={`main ${styles.main}`}>
        <div className={styles.pageShell}>
          <header className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>{isEditMode ? 'Edit Badge' : 'Create a Badge'}</h1>
          </header>

          <section className={styles.progressTrack} aria-label="Badge creation steps">
            {STEP_DEFINITIONS.map((step, index) => (
              <ProgressStep key={step.key} index={index} activeIndex={currentStep} label={step.label} />
            ))}
          </section>

          <section className={styles.canvasCard}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.cardEyebrow}>{activeStep.label}</p>
                <h2 className={styles.cardTitle}>
                  {activeStep.key === 'checkpoints' ? 'Add Checkpoints for:' : draft.badgeName}
                </h2>
                {activeStep.key === 'checkpoints' && (
                  <p className={styles.cardSubtitle}>
                    Select where you want to add a checkpoint in the video timeline, and click the plus button to create
                    the checkpoint.
                  </p>
                )}
              </div>
            </div>

            {submissionState ? <div className={styles.noticeBanner}>{submissionState}</div> : null}
            {isLoadingEditBadge ? <div className={styles.noticeBanner}>Loading badge details...</div> : null}
            {submitError ? <p className={styles.errorText}>{submitError}</p> : null}
            {stepError ? <p className={styles.errorText}>{stepError}</p> : null}

            {currentStep === 0 && <BadgeInfoStep draft={draft} updateDraft={updateDraft} />}

            {currentStep === 1 && (
              <LessonVideoStep draft={draft} updateDraft={updateDraft} videoThumbnail={videoThumbnail} />
            )}

            {currentStep === 2 && (
              <CheckpointsStep
                draft={draft}
                videoId={videoId}
                videoThumbnail={videoThumbnail}
                addCheckpoint={addCheckpoint}
                removeCheckpoint={removeCheckpoint}
                updateCheckpoint={updateCheckpoint}
                updateCheckpointOption={updateCheckpointOption}
                toggleCheckpointCorrectOption={toggleCheckpointCorrectOption}
              />
            )}

            {currentStep === 3 && (
              <RubricStep
                draft={draft}
                updateRubricItem={updateRubricItem}
                addRubricItem={addRubricItem}
                removeRubricItem={removeRubricItem}
                updateRubricCriterion={updateRubricCriterion}
                addRubricCriterion={addRubricCriterion}
                removeRubricCriterion={removeRubricCriterion}
                updateRubricCriterionOption={updateRubricCriterionOption}
                updateRubricCriterionOptionFeedback={updateRubricCriterionOptionFeedback}
                addRubricCriterionOption={addRubricCriterionOption}
                removeRubricCriterionOption={removeRubricCriterionOption}
              />
            )}

            {currentStep === 4 && <ReviewStep draft={draft} goToStep={goToStep} />}

            <div className={styles.navigationRow}>
              <button
                type="button"
                className={styles.backButton}
                onClick={() => setCurrentStep((step) => Math.max(step - 1, 0))}
                disabled={currentStep === 0}
              >
                Back
              </button>
              <button
                type="button"
                className={styles.nextButton}
                onClick={handleNext}
                disabled={isSubmitting || isLoadingEditBadge}
              >
                {currentStep === STEP_DEFINITIONS.length - 1
                  ? isSubmitting
                    ? isEditMode
                      ? 'Saving...'
                      : 'Creating...'
                    : isEditMode
                      ? 'Save Badge'
                      : 'Create Badge'
                  : 'Next'}
              </button>
            </div>
          </section>
        </div>
      </main>

      {isSuccessModalOpen ? (
        <SuccessModal
          isEditMode={isEditMode}
          courseId={courseId}
          badgeName={draft.badgeName}
          onClose={() => setIsSuccessModalOpen(false)}
        />
      ) : null}
    </div>
  );
}
