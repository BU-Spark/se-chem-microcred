import type { Prisma } from '@prisma/client';

export type QuestionType = 'multipleChoice' | 'shortAnswer';

type ShortAnswerOptions = {
  type?: string;
  expectedAnswer?: number;
  tolerancePercent?: number;
};

export type NormalizedCheckpointQuestion = {
  id: string;
  prompt: string;
  type: QuestionType;
  options: string[];
  correctIndex: number | null;
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
    const acceptedRange = computeAcceptedRange(expectedAnswer, tolerancePercentValue);

    return {
      id: question.id,
      prompt: question.prompt,
      type: 'shortAnswer',
      options: [],
      correctIndex: null,
      expectedAnswer,
      tolerancePercent: tolerancePercentValue,
      acceptedRange,
    };
  }

  const optionsArray = Array.isArray(question.options) ? question.options.map((option) => String(option)) : [];

  return {
    id: question.id,
    prompt: question.prompt,
    type: 'multipleChoice',
    options: optionsArray,
    correctIndex: question.correctIndex ?? null,
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
