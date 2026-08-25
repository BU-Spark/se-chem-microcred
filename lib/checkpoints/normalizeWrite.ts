import { CheckpointQuestionPayload } from '@/lib/checkpoints/types';
import { parseFiniteNumber } from '@/lib/utils';
import { hasVisibleQuestionText, sanitizeQuestionRichText } from '@/lib/question-rich-text';

// Multiple-choice options are authored in the same rich-text editor as the
// question prompt (issue #248), so they're sanitized the same way rather than
// treated as plain strings.
function normalizeRichTextOption(value?: string | null): string | null {
  return hasVisibleQuestionText(value) ? sanitizeQuestionRichText(value) : null;
}

//Capped at 8 options and Defaulted to being capped.
export function normalizeOptions(options?: string[] | null, CAPPED = true, MAX_OPTIONS = 8): string[] {
  const normalized = (options ?? [])
    .map((option) => normalizeRichTextOption(option))
    .filter((option): option is string => Boolean(option));

  if (!CAPPED) {
    return normalized.length > 0 ? normalized : ['Yes', 'No'];
  } else {
    const capped = normalized.slice(0, MAX_OPTIONS);
    while (capped.length < 2) {
      capped.push(capped.length === 0 ? 'Yes' : 'No');
    }
    return capped;
  }
}

export function normalizeCorrectIndices(question: CheckpointQuestionPayload, optionCount: number) {
  const rawIndices =
    Array.isArray(question.correctIndices) && question.correctIndices.length > 0
      ? question.correctIndices
      : question.correctIndex != null
        ? [question.correctIndex]
        : [];

  return Array.from(
    new Set(rawIndices.filter((index) => Number.isInteger(index) && index >= 0 && index < optionCount))
  ).sort((left, right) => left - right);
}

export function buildQuestionOptions(question: CheckpointQuestionPayload) {
  const questionType = question.questionType === 'shortAnswer' ? 'shortAnswer' : 'multipleChoice';

  const unit = normalizeString(question.unit);
  const incorrectFeedback = normalizeString(question.incorrectFeedback);
  const feedbackEntry = incorrectFeedback ? { incorrectFeedback } : {};

  if (questionType === 'shortAnswer') {
    const expectedAnswer = parseFiniteNumber(question.numericAnswer);
    const rawMin = parseFiniteNumber(question.numericRangeMin);
    const rawMax = parseFiniteNumber(question.numericRangeMax);
    const baseRange =
      rawMin != null && rawMax != null
        ? {
            min: Math.min(rawMin, rawMax),
            max: Math.max(rawMin, rawMax),
          }
        : null;
    const acceptedRange = baseRange ? (unit ? { ...baseRange, unit } : baseRange) : unit ? { unit } : null;

    return {
      options: {
        type: 'shortAnswer',
        expectedAnswer,
        acceptedRange,
        ...feedbackEntry,
      },
      correctIndex: null,
    };
  }

  const options = normalizeOptions(question.options);
  const correctIndices = normalizeCorrectIndices(question, options.length);

  return {
    options: {
      type: 'multipleChoice',
      options,
      correctIndices: correctIndices.length > 0 ? correctIndices : [0],
      ...feedbackEntry,
    },
    correctIndex: correctIndices[0] ?? 0,
  };
}

export function normalizeString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Point value for a checkpoint question or rubric task. Non-finite input falls
// back to `fallback`; negative values clamp to 0.
export function normalizePoints(value: number | string | null | undefined, fallback: number) {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

export function normalizeSkills(skills?: string[] | null) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of skills ?? []) {
    const value = normalizeString(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= 5) break;
  }
  return result;
}

export function normalizeRichText(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const textContent = trimmed
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  const hasEmbeddedContent = /<(img|iframe|video|audio|hr)\b/i.test(trimmed);
  return textContent || hasEmbeddedContent ? trimmed : null;
}
