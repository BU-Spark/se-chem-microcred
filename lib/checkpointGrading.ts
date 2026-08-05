import {
  isAnswerWithinAcceptedRange,
  isAnswerWithinTolerance,
  parseNumericAnswer,
  type NormalizedCheckpointQuestion,
} from './checkpointQuestions';

export type CheckpointAnswerInput = {
  questionId: string;
  selectedIndex?: number | null;
  selectedIndices?: number[] | null;
  numericAnswer?: number | string | null;
};

export type EvaluatedCheckpointQuestion = {
  questionId: string;
  prompt: string;
  options: NormalizedCheckpointQuestion['options'];
  type: NormalizedCheckpointQuestion['type'];
  selectedIndex: number | null;
  selectedIndices: number[];
  numericAnswer: number | null;
  correctIndex: number | null;
  correctIndices: number[];
  expectedAnswer: number | null;
  tolerancePercent: number;
  acceptedRange: { min: number; max: number } | null;
  isCorrect: boolean;
};

// Grades one checkpoint submission against its normalized questions. Shared by
// the attempt API route and the instructor badge-creation preview, so a preview
// run reports exactly what a real student attempt would.
export function evaluateCheckpointAttempt(
  answers: CheckpointAnswerInput[] | null | undefined,
  questions: NormalizedCheckpointQuestion[]
): EvaluatedCheckpointQuestion[] {
  return questions.map((question) => {
    const answer = answers?.find((item) => item.questionId === question.id);
    const selectedIndex = typeof answer?.selectedIndex === 'number' ? answer.selectedIndex : null;
    const selectedIndices = Array.isArray(answer?.selectedIndices)
      ? Array.from(
          new Set(
            answer.selectedIndices
              .map((index) => Number(index))
              .filter((index) => Number.isInteger(index) && index >= 0)
          )
        ).sort((left, right) => left - right)
      : selectedIndex !== null
        ? [selectedIndex]
        : [];
    const numericAnswer = parseNumericAnswer(answer?.numericAnswer);
    const isExactMultipleChoiceAnswer =
      selectedIndices.length === question.correctIndices.length &&
      question.correctIndices.every((correctIndex, index) => selectedIndices[index] === correctIndex);

    const isCorrect =
      question.type === 'shortAnswer'
        ? numericAnswer != null &&
          (isAnswerWithinAcceptedRange(question.acceptedRange, numericAnswer) ||
            (question.expectedAnswer != null &&
              isAnswerWithinTolerance(question.expectedAnswer, numericAnswer, question.tolerancePercent)))
        : isExactMultipleChoiceAnswer;
    return {
      questionId: question.id,
      prompt: question.prompt,
      options: question.options,
      type: question.type,
      selectedIndex: question.type === 'multipleChoice' ? (selectedIndices[0] ?? null) : null,
      selectedIndices: question.type === 'multipleChoice' ? selectedIndices : [],
      numericAnswer: question.type === 'shortAnswer' ? numericAnswer : null,
      correctIndex: question.correctIndex ?? null,
      correctIndices: question.correctIndices,
      expectedAnswer: question.expectedAnswer ?? null,
      tolerancePercent: question.tolerancePercent,
      acceptedRange: question.acceptedRange,
      isCorrect,
    };
  });
}
