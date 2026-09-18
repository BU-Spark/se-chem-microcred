import type { NormalizedCheckpointQuestion } from './checkpointQuestions';
import { sanitizeQuestionRichText, toPlainText } from './question-rich-text';

// A stored CheckpointResponse, narrowed to the columns that describe what the
// student picked. Shared by the instructor history table and the student's
// end-of-QEV review so the two can never drift apart.
export type StoredCheckpointResponse = {
  selectedIndex: number | null;
  selectedIndices: unknown;
  numericAnswer: number | null;
};

export const NO_ANSWER_RECORDED = 'No answer recorded';

// Which option indices a response points at. Older rows predate the
// selectedIndices column, so fall back to the single selectedIndex.
function selectedOptionIndices(response: StoredCheckpointResponse) {
  return Array.isArray(response.selectedIndices)
    ? response.selectedIndices.map((index) => Number(index)).filter((index) => Number.isInteger(index) && index >= 0)
    : response.selectedIndex != null
      ? [response.selectedIndex]
      : [];
}

function questionOptions(question: NormalizedCheckpointQuestion) {
  return Array.isArray(question.options) ? question.options : [];
}

// Options are authored as rich text (issue #248), so an option can be blank or
// point past the end of a since-edited question. Both fall back to its position.
function optionLabel(question: NormalizedCheckpointQuestion, index: number) {
  const options = questionOptions(question);
  return index < options.length ? String(options[index]) : '';
}

// Render a stored response as plain text, for surfaces that show text only
// (the instructor history table, CSV exports).
export function answerTextFromResponse(
  question: NormalizedCheckpointQuestion,
  response: StoredCheckpointResponse
): string {
  if (question.type === 'shortAnswer') {
    return response.numericAnswer != null ? String(response.numericAnswer) : NO_ANSWER_RECORDED;
  }

  const indices = selectedOptionIndices(response);
  if (indices.length === 0) {
    return NO_ANSWER_RECORDED;
  }

  return indices.map((index) => toPlainText(optionLabel(question, index)) || `Option ${index + 1}`).join(', ');
}

// Render a stored response as sanitized rich text, one entry per selected
// option, for surfaces that render HTML (the student's end-of-QEV review).
// An empty array means nothing was recorded — the caller decides how to say so.
export function answerHtmlFromResponse(
  question: NormalizedCheckpointQuestion,
  response: StoredCheckpointResponse
): string[] {
  if (question.type === 'shortAnswer') {
    return response.numericAnswer != null ? [sanitizeQuestionRichText(String(response.numericAnswer))] : [];
  }

  return selectedOptionIndices(response).map((index) => {
    const label = optionLabel(question, index);
    return hasText(label) ? sanitizeQuestionRichText(label) : sanitizeQuestionRichText(`Option ${index + 1}`);
  });
}

function hasText(value: string) {
  return toPlainText(value).length > 0;
}
