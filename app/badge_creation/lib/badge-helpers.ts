import { DEFAULT_DRAFT } from '../types';
import type { BadgeCatalogItem, BadgeDraft, CheckpointDraft } from '../types';

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

export function checkpointFromCatalog(
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
    options: [...options, '', '', '', ''].slice(0, Math.max(4, options.length)),
    correctIndices,
    numericAnswer: checkpoint?.numericAnswer ? String(checkpoint.numericAnswer) : '',
    numericRangeMin: checkpoint?.numericRangeMin ? String(checkpoint.numericRangeMin) : '',
    numericRangeMax: checkpoint?.numericRangeMax ? String(checkpoint.numericRangeMax) : '',
    unit: checkpoint?.unit ? String(checkpoint.unit) : '',
    incorrectFeedback: checkpoint?.incorrectFeedback ? String(checkpoint.incorrectFeedback) : '',
    incorrectFeedbackEnabled: Boolean(checkpoint?.incorrectFeedback) || Boolean(checkpoint?.incorrectFeedbackEnabled),
    segmentLabel: checkpoint?.segmentLabel || `Segment ${index + 1} Starts ${checkpoint?.time || '00:00:00'}`,
  };
}

export function badgeToDraft(badge: BadgeCatalogItem): BadgeDraft {
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
    ? requirement.gradingCriteria.map((criterion) => {
        const options = criterion.options.length ? criterion.options : ['', '', ''];
        const feedback = criterion.optionFeedback ?? [];
        return {
          id: `criterion-${criterion.number}`,
          prompt: criterion.criterion ?? '',
          options,
          optionFeedback: options.map((_, index) => feedback[index] ?? ''),
        };
      })
    : DEFAULT_DRAFT.rubricCriteria;

  // Availability prefers the new per-badge columns; fall back to lesson.dueDate
  // for legacy badges created before those columns existed.
  const closesOnSource = badge.closesOn ?? lesson?.dueDate ?? null;
  const neverCloses = badge.neverCloses ?? !lesson?.dueDate;

  return {
    ...DEFAULT_DRAFT,
    badgeName: badge.name,
    badgeDescription: badge.description ?? '',
    category: badge.category ?? 'OTHER',
    skills: requirement?.skills?.length ? requirement.skills : [],
    availableOn: formatDateInput(badge.availableOn),
    closesOn: neverCloses ? '' : formatDateInput(closesOnSource),
    neverCloses,
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
