/** @jest-environment node */

import { evaluateCheckpointAttempt } from '../lib/checkpointGrading';
import type { NormalizedCheckpointQuestion } from '../lib/checkpointQuestions';

function multipleChoice(overrides: Partial<NormalizedCheckpointQuestion> = {}): NormalizedCheckpointQuestion {
  return {
    id: 'question-1',
    prompt: 'Pick one',
    type: 'multipleChoice',
    options: ['A', 'B', 'C'],
    correctIndex: 1,
    correctIndices: [1],
    expectedAnswer: null,
    tolerancePercent: 0,
    acceptedRange: null,
    ...overrides,
  };
}

function shortAnswer(overrides: Partial<NormalizedCheckpointQuestion> = {}): NormalizedCheckpointQuestion {
  return {
    id: 'question-1',
    prompt: 'How hot?',
    type: 'shortAnswer',
    options: [],
    correctIndex: null,
    correctIndices: [],
    expectedAnswer: 42,
    tolerancePercent: 0,
    acceptedRange: { min: 40, max: 45 },
    ...overrides,
  };
}

describe('evaluateCheckpointAttempt', () => {
  it('marks a matching single-choice selection correct', () => {
    const [result] = evaluateCheckpointAttempt([{ questionId: 'question-1', selectedIndex: 1 }], [multipleChoice()]);
    expect(result.isCorrect).toBe(true);
    expect(result.selectedIndices).toEqual([1]);
  });

  it('marks a wrong single-choice selection incorrect', () => {
    const [result] = evaluateCheckpointAttempt([{ questionId: 'question-1', selectedIndex: 0 }], [multipleChoice()]);
    expect(result.isCorrect).toBe(false);
  });

  it('requires an exact match on multi-select questions', () => {
    const question = multipleChoice({ correctIndices: [0, 2], correctIndex: 0 });

    const [partial] = evaluateCheckpointAttempt(
      [{ questionId: 'question-1', selectedIndices: [0] }],
      [{ ...question }]
    );
    expect(partial.isCorrect).toBe(false);

    const [exact] = evaluateCheckpointAttempt(
      // Out of order on purpose: selections are normalized before comparison.
      [{ questionId: 'question-1', selectedIndices: [2, 0] }],
      [{ ...question }]
    );
    expect(exact.isCorrect).toBe(true);

    const [superset] = evaluateCheckpointAttempt(
      [{ questionId: 'question-1', selectedIndices: [0, 1, 2] }],
      [{ ...question }]
    );
    expect(superset.isCorrect).toBe(false);
  });

  it('accepts a short answer inside the accepted range', () => {
    const [result] = evaluateCheckpointAttempt([{ questionId: 'question-1', numericAnswer: '44' }], [shortAnswer()]);
    expect(result.isCorrect).toBe(true);
    expect(result.numericAnswer).toBe(44);
  });

  it('rejects a short answer outside the accepted range', () => {
    const [result] = evaluateCheckpointAttempt([{ questionId: 'question-1', numericAnswer: 50 }], [shortAnswer()]);
    expect(result.isCorrect).toBe(false);
  });

  it('falls back to the tolerance percent when no range is configured', () => {
    const question = shortAnswer({ acceptedRange: null, tolerancePercent: 10 });
    const [inTolerance] = evaluateCheckpointAttempt(
      [{ questionId: 'question-1', numericAnswer: 45 }],
      [{ ...question }]
    );
    expect(inTolerance.isCorrect).toBe(true);

    const [outOfTolerance] = evaluateCheckpointAttempt(
      [{ questionId: 'question-1', numericAnswer: 60 }],
      [{ ...question }]
    );
    expect(outOfTolerance.isCorrect).toBe(false);
  });

  it('marks unanswered questions incorrect instead of throwing', () => {
    const [result] = evaluateCheckpointAttempt([], [multipleChoice()]);
    expect(result.isCorrect).toBe(false);
    expect(result.selectedIndices).toEqual([]);
  });
});
