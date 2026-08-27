/** @jest-environment node */

import { buildPreviewLesson, PREVIEW_SEGMENT_ID } from '../app/badge_creation/lib/preview-lesson';
import {
  DEFAULT_DRAFT,
  type BadgeDraft,
  type CheckpointDraft,
  type CheckpointQuestionDraft,
} from '../app/badge_creation/types';

function question(overrides: Partial<CheckpointQuestionDraft> = {}): CheckpointQuestionDraft {
  return {
    id: 'question-1',
    question: 'Which flame is hottest?',
    questionType: 'multipleChoice',
    options: ['Blue', 'Yellow'],
    correctIndices: [0],
    numericAnswer: '',
    numericRangeMin: '',
    numericRangeMax: '',
    unit: '',
    incorrectFeedback: '',
    incorrectFeedbackEnabled: false,
    points: 1,
    ...overrides,
  };
}

function checkpoint(overrides: Partial<CheckpointDraft> = {}): CheckpointDraft {
  const base = question();
  return {
    ...base,
    title: 'Checkpoint 1',
    time: '00:00:30',
    segmentLabel: 'Segment 1 Starts 00:00:30',
    questions: [base],
    ...overrides,
  };
}

function draft(overrides: Partial<BadgeDraft> = {}): BadgeDraft {
  return {
    ...DEFAULT_DRAFT,
    badgeName: 'Bunsen Burner',
    videoTitle: 'Bunsen Burner Safety',
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    passingPercent: 80,
    checkpoints: [checkpoint()],
    ...overrides,
  };
}

describe('buildPreviewLesson', () => {
  it('carries the draft video, title and passing threshold onto the preview lesson', () => {
    const lesson = buildPreviewLesson(draft());

    expect(lesson.title).toBe('Bunsen Burner Safety');
    expect(lesson.passingPercent).toBe(80);
    expect(lesson.segments[0].videoUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(lesson.segments[0].id).toBe(PREVIEW_SEGMENT_ID);
  });

  it('starts every preview as a fresh first-time run', () => {
    const lesson = buildPreviewLesson(draft());

    expect(lesson.completedCheckpointIds).toEqual([]);
    expect(lesson.answeredCheckpointIds).toEqual([]);
    expect(lesson.resumeTimeSeconds).toBe(0);
    expect(lesson.status).toBe('NOT_STARTED');
  });

  it('never exposes a badge requirement, so the preview cannot surface an assessment QR', () => {
    expect(buildPreviewLesson(draft()).badgeRequirements).toEqual([]);
  });

  it('orders checkpoints by timestamp regardless of authoring order', () => {
    const lesson = buildPreviewLesson(
      draft({
        checkpoints: [
          checkpoint({ id: 'checkpoint-late', time: '00:02:00' }),
          checkpoint({ id: 'checkpoint-early', time: '00:00:15' }),
        ],
      })
    );

    expect(lesson.checkpoints.map((entry) => entry.id)).toEqual(['checkpoint-early', 'checkpoint-late']);
    expect(lesson.checkpoints.map((entry) => entry.timeOffsetSeconds)).toEqual([15, 120]);
  });

  it('namespaces question ids so repeated draft ids cannot collide across checkpoints', () => {
    const lesson = buildPreviewLesson(
      draft({
        checkpoints: [
          checkpoint({ id: 'checkpoint-a', time: '00:00:10' }),
          checkpoint({ id: 'checkpoint-b', time: '00:00:20' }),
        ],
      })
    );

    const ids = lesson.checkpoints.flatMap((entry) => entry.questions.map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['checkpoint-a::question-1', 'checkpoint-b::question-1']);
  });

  it('normalizes multiple-choice answer keys the way a saved badge would', () => {
    const lesson = buildPreviewLesson(
      draft({
        checkpoints: [
          checkpoint({
            questions: [question({ options: ['Blue', 'Yellow', 'Orange'], correctIndices: [0, 2] })],
          }),
        ],
      })
    );

    const previewQuestion = lesson.checkpoints[0].questions[0];
    expect(previewQuestion.type).toBe('multipleChoice');
    // Options are authored in the same rich-text editor as the prompt (#248) and
    // go through the same write-normalization, so plain text round-trips as HTML.
    expect(previewQuestion.options).toEqual(['<p>Blue</p>', '<p>Yellow</p>', '<p>Orange</p>']);
    expect(previewQuestion.correctIndices).toEqual([0, 2]);
    expect(previewQuestion.correctIndex).toBe(0);
  });

  it('carries each question point value into the preview (#248)', () => {
    const lesson = buildPreviewLesson(
      draft({
        checkpoints: [
          checkpoint({
            questions: [question({ id: 'question-a', points: 3 }), question({ id: 'question-b', points: 2 })],
          }),
        ],
      })
    );

    expect(lesson.checkpoints[0].questions.map((entry) => entry.points)).toEqual([3, 2]);
  });

  it('normalizes short-answer questions into an accepted range', () => {
    const lesson = buildPreviewLesson(
      draft({
        checkpoints: [
          checkpoint({
            questions: [
              question({
                questionType: 'shortAnswer',
                numericAnswer: '42',
                numericRangeMin: '40',
                numericRangeMax: '45',
                unit: 'degrees C',
              }),
            ],
          }),
        ],
      })
    );

    const previewQuestion = lesson.checkpoints[0].questions[0];
    expect(previewQuestion.type).toBe('shortAnswer');
    expect(previewQuestion.expectedAnswer).toBe(42);
    expect(previewQuestion.acceptedRange).toEqual({ min: 40, max: 45 });
  });

  it('handles a draft with no video or checkpoints without throwing', () => {
    const lesson = buildPreviewLesson({ ...DEFAULT_DRAFT });

    expect(lesson.checkpoints).toEqual([]);
    expect(lesson.segments[0].videoUrl).toBeNull();
  });
});
