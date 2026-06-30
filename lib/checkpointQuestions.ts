import type { Prisma } from '@prisma/client';

export type QuestionType = 'multipleChoice' | 'shortAnswer';

type ShortAnswerOptions = {
  type?: string;
  expectedAnswer?: number;
  tolerancePercent?: number;
  acceptedRange?: {
    min?: number;
    max?: number;
  };
};

type MultipleChoiceOptions = {
  type?: string;
  options?: unknown[];
  correctIndices?: unknown[];
};

export type NormalizedCheckpointQuestion = {
  id: string;
  prompt: string;
  type: QuestionType;
  options: string[] | Record<string, unknown>;
  correctIndex: number | null;
  correctIndices: number[];
  expectedAnswer: number | null;
  tolerancePercent: number;
  acceptedRange: { min: number; max: number } | null;
};

export type RawCheckpointQuestion = {
  id: string;
  prompt: string;
  options: Prisma.JsonValue;
  correctIndex: number | null;
};

function coerceShortAnswerOptions(value: Prisma.JsonValue): ShortAnswerOptions | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return null;
  }
  const maybeOptions = value as Record<string, unknown>;
  const type = String(maybeOptions.type ?? maybeOptions.questionType ?? '').toLowerCase();
  if (type !== 'shortanswer' && type !== 'short_answer' && type !== 'short-answer') {
    return null;
  }
  return {
    type: 'shortAnswer',
    expectedAnswer:
      typeof maybeOptions.expectedAnswer === 'number'
        ? maybeOptions.expectedAnswer
        : Number(maybeOptions.expectedAnswer),
    tolerancePercent:
      typeof maybeOptions.tolerancePercent === 'number'
        ? maybeOptions.tolerancePercent
        : Number(maybeOptions.tolerancePercent),
    acceptedRange:
      maybeOptions.acceptedRange && typeof maybeOptions.acceptedRange === 'object'
        ? (maybeOptions.acceptedRange as ShortAnswerOptions['acceptedRange'])
        : undefined,
  };
}

function coerceMultipleChoiceOptions(value: Prisma.JsonValue): MultipleChoiceOptions | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return null;
  }

  const maybeOptions = value as Record<string, unknown>;
  const type = String(maybeOptions.type ?? maybeOptions.questionType ?? '').toLowerCase();
  if (type !== 'multiplechoice' && type !== 'multiple_choice' && type !== 'multiple-choice') {
    return null;
  }

  return {
    type: 'multipleChoice',
    options: Array.isArray(maybeOptions.options) ? maybeOptions.options : [],
    correctIndices: Array.isArray(maybeOptions.correctIndices) ? maybeOptions.correctIndices : [],
  };
}

export function computeAcceptedRange(expected: number | null, tolerancePercent: number) {
  if (expected == null || !Number.isFinite(expected)) {
    return null;
  }
  const tolerance = Math.max(0, tolerancePercent);
  const lowerBound = expected * (1 - tolerance / 100);
  const upperBound = expected * (1 + tolerance / 100);
  const min = Math.min(lowerBound, upperBound);
  const max = Math.max(lowerBound, upperBound);
  return { min, max };
}

export function normalizeCheckpointQuestion(question: RawCheckpointQuestion): NormalizedCheckpointQuestion {
  const shortAnswer = coerceShortAnswerOptions(question.options);

  if (shortAnswer) {
    const expectedAnswer = Number.isFinite(shortAnswer.expectedAnswer ?? NaN)
      ? Number(shortAnswer.expectedAnswer)
      : null;
    const tolerancePercentValue = Number.isFinite(shortAnswer.tolerancePercent ?? NaN)
      ? Math.max(0, Number(shortAnswer.tolerancePercent))
      : 0;
    const rangeMin = Number(shortAnswer.acceptedRange?.min);
    const rangeMax = Number(shortAnswer.acceptedRange?.max);
    const explicitRange =
      Number.isFinite(rangeMin) && Number.isFinite(rangeMax)
        ? { min: Math.min(rangeMin, rangeMax), max: Math.max(rangeMin, rangeMax) }
        : null;
    const acceptedRange = explicitRange ?? computeAcceptedRange(expectedAnswer, tolerancePercentValue);

    return {
      id: question.id,
      prompt: question.prompt,
      type: 'shortAnswer',
      options: [],
      correctIndex: null,
      correctIndices: [],
      expectedAnswer,
      tolerancePercent: tolerancePercentValue,
      acceptedRange,
    };
  }

  const multipleChoice = coerceMultipleChoiceOptions(question.options);
  const optionsArray = multipleChoice
    ? (multipleChoice.options ?? []).map((option) => String(option))
    : Array.isArray(question.options)
      ? question.options.map((option) => String(option))
      : [];
  const ci = question.correctIndex ?? null;
  const normalizedCorrectIndices = multipleChoice
    ? Array.from(
        new Set(
          (multipleChoice.correctIndices ?? [])
            .map((index) => Number(index))
            .filter((index) => Number.isInteger(index) && index >= 0 && index < optionsArray.length)
        )
      ).sort((left, right) => left - right)
    : [];
  const fallbackCorrectIndex = ci != null && Number.isInteger(ci) && ci >= 0 && ci < optionsArray.length ? ci : null;
  const correctIndices =
    normalizedCorrectIndices.length > 0
      ? normalizedCorrectIndices
      : fallbackCorrectIndex != null
        ? [fallbackCorrectIndex]
        : [];
  const correctIndex = correctIndices[0] ?? null;

  return {
    id: question.id,
    prompt: question.prompt,
    type: 'multipleChoice',
    options: optionsArray,
    correctIndex,
    correctIndices,
    expectedAnswer: null,
    tolerancePercent: 0,
    acceptedRange: null,
  };
}

export function parseNumericAnswer(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function isAnswerWithinTolerance(expected: number, received: number, tolerancePercent: number) {
  const range = computeAcceptedRange(expected, tolerancePercent);
  if (!range) {
    return false;
  }
  return received >= range.min && received <= range.max;
}

export function isAnswerWithinAcceptedRange(range: { min: number; max: number } | null, received: number) {
  if (!range) {
    return false;
  }

  return received >= range.min && received <= range.max;
}
