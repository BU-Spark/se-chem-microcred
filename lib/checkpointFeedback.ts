import type { Prisma } from '@prisma/client';

// Per-answer feedback for QEV checkpoint questions (issue #320).
//
// Feedback lives in the CheckpointQuestion.options JSON but is deliberately NOT
// part of normalizeCheckpointQuestion: that shape is sent to students before
// they answer, and feedback text can give the answer away. It's read separately
// here and only resolved after a graded submission.

export const PARTIAL_FEEDBACK_MESSAGE =
  'You picked some of the correct answers, but not all of them. Rewatch this section of the QEV and review the content before your next attempt.';

export type QuestionFeedbackSource = {
  // Index-aligned with the question's options (multiple choice).
  optionFeedback: Array<string | null>;
  // Short answer only.
  correctFeedback: string | null;
  incorrectFeedback: string | null;
};

export type QuestionFeedback = {
  kind: 'options' | 'partial' | 'shortAnswer';
  messages: string[];
};

type EvaluatedForFeedback = {
  type: 'multipleChoice' | 'shortAnswer';
  selectedIndices: number[];
  numericAnswer: number | null;
  correctIndices: number[];
  isCorrect: boolean;
};

function feedbackString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function readQuestionFeedbackSource(options: Prisma.JsonValue): QuestionFeedbackSource {
  // Legacy rows store a bare array of option strings with no feedback.
  if (!options || Array.isArray(options) || typeof options !== 'object') {
    return { optionFeedback: [], correctFeedback: null, incorrectFeedback: null };
  }
  const record = options as Record<string, unknown>;
  return {
    optionFeedback: Array.isArray(record.optionFeedback) ? record.optionFeedback.map(feedbackString) : [],
    correctFeedback: feedbackString(record.correctFeedback),
    incorrectFeedback: feedbackString(record.incorrectFeedback),
  };
}

function withMessages(kind: QuestionFeedback['kind'], messages: Array<string | null | undefined>) {
  const present = messages.filter((message): message is string => Boolean(message));
  return present.length > 0 ? { kind, messages: present } : null;
}

// Picks the feedback a student sees for one graded question:
// - short answer: correct/incorrect feedback
// - single-select: the selected option's feedback
// - multi-select: exact → each correct option's feedback; any correct option
//   picked but not exact → the generic partial message; no correct option
//   picked → each picked distractor's feedback
export function resolveQuestionFeedback(
  question: EvaluatedForFeedback,
  source: QuestionFeedbackSource
): QuestionFeedback | null {
  if (question.type === 'shortAnswer') {
    if (question.numericAnswer == null) return null;
    return withMessages('shortAnswer', [question.isCorrect ? source.correctFeedback : source.incorrectFeedback]);
  }

  const selected = question.selectedIndices;
  if (selected.length === 0) return null;
  const optionFeedback = (index: number) => source.optionFeedback[index] ?? null;

  if (question.correctIndices.length <= 1) {
    return withMessages('options', selected.map(optionFeedback));
  }

  if (question.isCorrect) {
    return withMessages('options', question.correctIndices.map(optionFeedback));
  }
  if (selected.some((index) => question.correctIndices.includes(index))) {
    return { kind: 'partial', messages: [PARTIAL_FEEDBACK_MESSAGE] };
  }
  return withMessages('options', selected.map(optionFeedback));
}
