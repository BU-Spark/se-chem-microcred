import { DEFAULT_DRAFT } from '../types';
import type { BadgeCatalogItem, BadgeDraft, CheckpointDraft, CheckpointQuestionDraft } from '../types';

export function extractYouTubeId(url?: string | null) {
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

    const shortsIndex = parts.indexOf('shorts');
    if (shortsIndex >= 0) {
      return parts[shortsIndex + 1] ?? null;
    }
  } catch {
    return null;
  }

  return null;
}

// Accepts youtube.com/youtu.be links (with or without scheme/www), rejecting
// arbitrary strings like "a". A missing scheme is normalized before parsing,
// and the host must be a YouTube host that yields a non-empty video id.
export function isValidYouTubeUrl(url?: string | null) {
  if (!url || !url.trim()) return false;

  const candidate = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;

  let host: string;
  try {
    host = new URL(candidate).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return false;
  }

  const isYouTubeHost = host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be';
  if (!isYouTubeHost) return false;

  return Boolean(extractYouTubeId(candidate));
}

// Accepts HH:MM:SS or MM:SS with each segment numeric; rejects "a"/empty.
export function isValidVideoLength(value?: string | null) {
  if (!value || !value.trim()) return false;
  return /^(\d{1,2}:)?\d{1,2}:\d{2}$/.test(value.trim());
}

// Parse "HH:MM:SS" / "MM:SS" / "SS" into whole seconds. Invalid input => 0.
export function parseTimecodeToSeconds(value?: string | null) {
  if (!value || !value.trim()) return 0;

  const parts = value
    .trim()
    .split(':')
    .map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part) || part < 0)) return 0;

  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

// Format whole seconds into a zero-padded "HH:MM:SS" timecode.
export function formatSecondsToTimecode(totalSeconds?: number | null) {
  const safe = Math.max(0, Math.floor(totalSeconds ?? 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

export function formatDisplayDate(dateValue: string, fallback = 'Not scheduled') {
  if (!dateValue) return fallback;

  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return fallback;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function buildVideoEmbedUrl(url: string) {
  const videoId = extractYouTubeId(url);
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}

export function buildVideoThumbnail(url: string) {
  const videoId = extractYouTubeId(url);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}

export function formatDateInput(value?: string | null) {
  if (!value) return '';

  // Prefer the leading YYYY-MM-DD verbatim so a stored UTC-midnight ISO string
  // round-trips without any timezone shift; fall back to a UTC slice otherwise.
  const isoDateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (isoDateMatch) return isoDateMatch[1];

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toISOString().slice(0, 10);
}

export function formatDurationInput(seconds?: number | null, fallbackMinutes?: number | null) {
  const totalSeconds = seconds ?? (fallbackMinutes ? fallbackMinutes * 60 : 0);
  if (!totalSeconds) return '';

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  return [hours, minutes, remainingSeconds].map((part) => String(part).padStart(2, '0')).join(':');
}

type CatalogCheckpoint = Partial<CheckpointDraft> & {
  number?: number;
  correctIndex?: number | null;
  questions?: Array<Partial<CheckpointQuestionDraft> & { prompt?: string | null; correctIndex?: number | null }>;
};

function normalizeChoicePlaceholders(options?: string[] | null) {
  const base = options?.length ? options.slice(0, 4) : ['', ''];
  while (base.length < 2) base.push('');
  return base;
}

function questionFromCatalog(
  question: (Partial<CheckpointQuestionDraft> & { prompt?: string | null; correctIndex?: number | null }) | undefined,
  index: number
): CheckpointQuestionDraft {
  const options = normalizeChoicePlaceholders(question?.options);
  const correctIndices =
    question?.correctIndices?.length && question.correctIndices.every((optionIndex) => typeof optionIndex === 'number')
      ? question.correctIndices.filter((optionIndex) => optionIndex >= 0 && optionIndex < options.length)
      : typeof question?.correctIndex === 'number' &&
          question.correctIndex >= 0 &&
          question.correctIndex < options.length
        ? [question.correctIndex]
        : [0];

  return {
    id: question?.id || `question-${index + 1}`,
    question: question?.question || question?.prompt || '',
    questionType: question?.questionType === 'shortAnswer' ? 'shortAnswer' : 'multipleChoice',
    options,
    correctIndices: correctIndices.length ? correctIndices : [0],
    numericAnswer: question?.numericAnswer ? String(question.numericAnswer) : '',
    numericRangeMin: question?.numericRangeMin ? String(question.numericRangeMin) : '',
    numericRangeMax: question?.numericRangeMax ? String(question.numericRangeMax) : '',
    unit: question?.unit ? String(question.unit) : '',
    incorrectFeedback: question?.incorrectFeedback ? String(question.incorrectFeedback) : '',
    incorrectFeedbackEnabled: Boolean(question?.incorrectFeedback) || Boolean(question?.incorrectFeedbackEnabled),
  };
}

export function checkpointFromCatalog(checkpoint: CatalogCheckpoint | undefined, index: number): CheckpointDraft {
  const title = checkpoint?.title || `Checkpoint ${index + 1}`;
  const questions = checkpoint?.questions?.length
    ? checkpoint.questions.map((question, questionIndex) => questionFromCatalog(question, questionIndex))
    : [questionFromCatalog(checkpoint, 0)];
  const firstQuestion = questions[0];

  return {
    ...firstQuestion,
    id: `checkpoint-${index + 1}`,
    title,
    time: checkpoint?.time || '00:00:00',
    points: Number(checkpoint?.points) || 5,
    questions,
    segmentLabel: checkpoint?.segmentLabel || `Segment ${index + 1} Starts ${checkpoint?.time || '00:00:00'}`,
  };
}

export function badgeToDraft(badge: BadgeCatalogItem): BadgeDraft {
  const requirement = badge.requirements[0];
  const lesson = requirement?.lesson ?? null;
  const segment = lesson?.segment ?? null;
  const rubricGoal = badge.rubricGoal
    ? {
        name: badge.rubricGoal.name,
        passThreshold: badge.rubricGoal.passThreshold,
        subgoals: badge.rubricGoal.subgoals.length
          ? badge.rubricGoal.subgoals.map((subgoal) => ({
              id: subgoal.id,
              text: subgoal.text,
              points: subgoal.points,
            }))
          : DEFAULT_DRAFT.rubricGoal.subgoals,
      }
    : DEFAULT_DRAFT.rubricGoal;

  // Availability prefers the new per-badge columns; fall back to lesson.dueDate
  // for legacy badges created before those columns existed.
  const closesOnSource = badge.closesOn ?? lesson?.dueDate ?? null;
  const neverCloses = badge.neverCloses ?? !lesson?.dueDate;

  return {
    ...DEFAULT_DRAFT,
    badgeName: badge.name,
    badgeDescription: badge.description ?? '',
    skills: requirement?.skills?.length ? requirement.skills : [],
    availableOn: formatDateInput(badge.availableOn),
    closesOn: neverCloses ? '' : formatDateInput(closesOnSource),
    neverCloses,
    // Prefer the summary-stored video (the only copy the editor can see, since it
    // loads the source badge which has no lesson row); fall back to the lesson
    // segment for legacy badges created before video was stored in the summary.
    youtubeUrl: requirement?.youtubeUrl ?? segment?.videoUrl ?? '',
    videoTitle: requirement?.videoTitle ?? segment?.title ?? lesson?.title ?? '',
    videoLength: requirement?.videoLength ?? formatDurationInput(segment?.duration, lesson?.estimatedMinutes),
    // Source badges have no lesson row, so the threshold lives in the requirement
    // summary JSON; fall back to the lesson (course copies), then the default.
    passingPercent: requirement?.passingPercent ?? lesson?.passingPercent ?? DEFAULT_DRAFT.passingPercent,
    checkpoints: requirement?.checkpoints?.length
      ? requirement.checkpoints.map((checkpoint, index) => checkpointFromCatalog(checkpoint, index))
      : DEFAULT_DRAFT.checkpoints,
    rubricGoal,
  };
}
