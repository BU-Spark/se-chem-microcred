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
  incorrectFeedback?: string | null;
  incorrectFeedbackEnabled?: boolean | null;
};

export type CheckpointPayload = CheckpointQuestionPayload & {
  title?: string | null;
  time?: string | null;
  points?: number | string | null;
  segmentLabel?: string | null;
  questions?: CheckpointQuestionPayload[] | null;
};
