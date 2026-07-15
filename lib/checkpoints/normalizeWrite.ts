import { CheckpointQuestionPayload } from '@/lib/checkpoints/types';
import { parseFiniteNumber } from '@/lib/utils';

//Capped at 8 options and Defaulted to being capped.
export function normalizeOptions(options?: string[] | null, CAPPED = true, MAX_OPTIONS = 8): string[] {
  const normalized = (options ?? [])
    .map((option) => normalizeString(option))
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
