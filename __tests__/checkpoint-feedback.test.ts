/** @jest-environment node */

import type { Prisma } from '@prisma/client';

import {
  PARTIAL_FEEDBACK_MESSAGE,
  readQuestionFeedbackSource,
  resolveQuestionFeedback,
  type QuestionFeedbackSource,
} from '../lib/checkpointFeedback';
import { evaluateCheckpointAttempt } from '../lib/checkpointGrading';
import { normalizeCheckpointQuestion } from '../lib/checkpointQuestions';
import { buildQuestionOptions } from '../lib/checkpoints/normalizeWrite';

// Issue #320: per-answer feedback on QEV checkpoint questions.

function source(overrides: Partial<QuestionFeedbackSource> = {}): QuestionFeedbackSource {
  return { optionFeedback: [], correctFeedback: null, incorrectFeedback: null, ...overrides };
}

function choice(selectedIndices: number[], correctIndices: number[]) {
  const isCorrect =
    selectedIndices.length === correctIndices.length &&
    correctIndices.every((index, i) => selectedIndices[i] === index);
  return { type: 'multipleChoice' as const, selectedIndices, numericAnswer: null, correctIndices, isCorrect };
}

const fourChoices = source({ optionFeedback: ['fb A', 'fb B', 'fb C', 'fb D'] });

describe('resolveQuestionFeedback', () => {
  describe('single-select', () => {
    it('shows the selected correct option feedback', () => {
      expect(resolveQuestionFeedback(choice([1], [1]), fourChoices)).toEqual({ kind: 'options', messages: ['fb B'] });
    });

    it('shows the selected distractor feedback', () => {
      expect(resolveQuestionFeedback(choice([2], [1]), fourChoices)).toEqual({ kind: 'options', messages: ['fb C'] });
    });

    it('returns null when the selected option has no feedback', () => {
      expect(resolveQuestionFeedback(choice([2], [1]), source({ optionFeedback: ['fb A', null, null] }))).toBeNull();
    });
  });

  describe('multi-select', () => {
    it('shows each correct option feedback on an exact answer', () => {
      expect(resolveQuestionFeedback(choice([0, 2], [0, 2]), fourChoices)).toEqual({
        kind: 'options',
        messages: ['fb A', 'fb C'],
      });
    });

    it('shows the partial message for a strict subset of the correct set', () => {
      expect(resolveQuestionFeedback(choice([0], [0, 2]), fourChoices)).toEqual({
        kind: 'partial',
        messages: [PARTIAL_FEEDBACK_MESSAGE],
      });
    });

    it('shows the partial message when correct picks are mixed with a distractor', () => {
      expect(resolveQuestionFeedback(choice([0, 1, 2], [0, 2]), fourChoices)?.kind).toBe('partial');
    });

    it('shows the partial message even when no option feedback is authored', () => {
      expect(resolveQuestionFeedback(choice([0], [0, 2]), source())?.kind).toBe('partial');
    });

    it('shows each picked distractor feedback when no correct option is picked', () => {
      expect(resolveQuestionFeedback(choice([1, 3], [0, 2]), fourChoices)).toEqual({
        kind: 'options',
        messages: ['fb B', 'fb D'],
      });
    });
  });

  it('returns null for an unanswered question', () => {
    expect(resolveQuestionFeedback(choice([], [1]), fourChoices)).toBeNull();
  });

  describe('short answer', () => {
    const shortAnswer = (isCorrect: boolean, numericAnswer: number | null = 5) => ({
      type: 'shortAnswer' as const,
      selectedIndices: [],
      numericAnswer,
      correctIndices: [],
      isCorrect,
    });
    const feedback = source({ correctFeedback: 'Nice.', incorrectFeedback: 'Check your units.' });

    it('shows correct feedback', () => {
      expect(resolveQuestionFeedback(shortAnswer(true), feedback)).toEqual({
        kind: 'shortAnswer',
        messages: ['Nice.'],
      });
    });

    it('shows incorrect feedback', () => {
      expect(resolveQuestionFeedback(shortAnswer(false), feedback)?.messages).toEqual(['Check your units.']);
    });

    it('returns null when unanswered', () => {
      expect(resolveQuestionFeedback(shortAnswer(false, null), feedback)).toBeNull();
    });
  });
});

describe('readQuestionFeedbackSource', () => {
  it('treats legacy bare-array options as having no feedback', () => {
    expect(readQuestionFeedbackSource(['A', 'B'])).toEqual(source());
  });

  it('reads stored option feedback, blanking empty entries', () => {
    expect(
      readQuestionFeedbackSource({ type: 'multipleChoice', options: ['A', 'B'], optionFeedback: ['fb A', '  '] })
        .optionFeedback
    ).toEqual(['fb A', null]);
  });
});

describe('buildQuestionOptions per-answer feedback', () => {
  it('keeps feedback aligned when a blank option is dropped', () => {
    const { options } = buildQuestionOptions({
      questionType: 'multipleChoice',
      options: ['A', '', 'C'],
      optionFeedback: ['fb A', 'fb blank', 'fb C'],
      correctIndices: [0],
    });

    expect(options).toEqual(
      expect.objectContaining({ options: ['<p>A</p>', '<p>C</p>'], optionFeedback: ['fb A', 'fb C'] })
    );
  });

  it('omits optionFeedback when every entry is empty', () => {
    const { options } = buildQuestionOptions({
      questionType: 'multipleChoice',
      options: ['A', 'B'],
      optionFeedback: ['', '  '],
      correctIndices: [0],
    });

    expect(options).not.toHaveProperty('optionFeedback');
  });

  it('stores short-answer correct and incorrect feedback', () => {
    const { options } = buildQuestionOptions({
      questionType: 'shortAnswer',
      numericAnswer: 42,
      correctFeedback: ' Nice. ',
      incorrectFeedback: 'Check units.',
    });

    expect(options).toEqual(expect.objectContaining({ correctFeedback: 'Nice.', incorrectFeedback: 'Check units.' }));
  });
});

describe('evaluateCheckpointAttempt with feedback', () => {
  const stored = buildQuestionOptions({
    questionType: 'multipleChoice',
    options: ['A', 'B'],
    optionFeedback: ['fb A', 'fb B'],
    correctIndices: [0],
  });
  const raw = { id: 'q1', prompt: 'Pick', options: stored.options as unknown as Prisma.JsonValue, correctIndex: 0 };

  it('keeps feedback out of the student-facing normalized question', () => {
    expect(normalizeCheckpointQuestion(raw)).not.toHaveProperty('feedbackSource');
  });

  it('attaches resolved feedback when a feedback source is supplied', () => {
    const question = { ...normalizeCheckpointQuestion(raw), feedbackSource: readQuestionFeedbackSource(raw.options) };
    const [result] = evaluateCheckpointAttempt([{ questionId: 'q1', selectedIndices: [1] }], [question]);

    expect(result.isCorrect).toBe(false);
    expect(result.feedback).toEqual({ kind: 'options', messages: ['fb B'] });
  });

  it('returns null feedback without a feedback source', () => {
    const [result] = evaluateCheckpointAttempt(
      [{ questionId: 'q1', selectedIndices: [1] }],
      [normalizeCheckpointQuestion(raw)]
    );

    expect(result.feedback).toBeNull();
  });
});
