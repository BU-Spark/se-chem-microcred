// Types for checkpoints

export type CheckpointQuestionPayload = {
  id?: string | null;
  prompt?: string | null;
  question?: string | null;
  questionType?: 'multipleChoice' | 'shortAnswer' | string | null;
  options?: string[] | null;
  correctIndex?: number | null;
  correctIndices?: number[] | null;
  numericAnswer?: string | number | null;
  numericRangeMin?: string | number | null;
  numericRangeMax?: string | number | null;
  unit?: string | null;
  // Per-answer feedback (issue #320). optionFeedback is index-aligned with
  // options (multiple choice); correct/incorrectFeedback are for short answer.
  optionFeedback?: Array<string | null> | null;
  correctFeedback?: string | null;
  incorrectFeedback?: string | null;
  incorrectFeedbackEnabled?: boolean | null;
  // Point value for this question; weights lesson (QEV) grading (issue #248).
  points?: number | string | null;
};

export type CheckpointPayload = CheckpointQuestionPayload & {
  title?: string | null;
  time?: string | null;
  points?: number | string | null;
  segmentLabel?: string | null;
  questions?: CheckpointQuestionPayload[] | null;
};
