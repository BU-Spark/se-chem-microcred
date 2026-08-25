import { fireEvent, render, screen } from '@testing-library/react';

import CheckpointsStep from './CheckpointsStep';
import { DEFAULT_DRAFT, type BadgeDraft, type CheckpointDraft } from '../types';

// The preview renders the real student player, which drives the YouTube IFrame
// API. These tests are about the Create/Preview tab wiring, so stand it in with
// a marker that also proves the draft-derived lesson reaches it.
jest.mock('@/app/lessons/[lessonId]/video', () => ({
  LessonVideoPage: ({ lesson, previewMode }: { lesson: { title: string }; previewMode?: boolean }) => (
    <div data-testid="preview-player" data-preview={String(previewMode)}>
      {lesson.title}
    </div>
  ),
}));

function buildCheckpoint(overrides: Partial<CheckpointDraft> = {}): CheckpointDraft {
  return {
    id: 'checkpoint-1',
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
    title: 'Checkpoint 1',
    time: '00:00:30',
    points: 5,
    segmentLabel: 'Segment 1 Starts 00:00:30',
    questions: [
      {
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
        points: 5,
      },
    ],
    ...overrides,
  };
}

function renderStep({
  draftOverrides = {},
  videoId = 'dQw4w9WgXcQ',
}: { draftOverrides?: Partial<BadgeDraft>; videoId?: string | null } = {}) {
  const draft: BadgeDraft = {
    ...DEFAULT_DRAFT,
    videoTitle: 'Bunsen Burner Safety',
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    checkpoints: [buildCheckpoint()],
    ...draftOverrides,
  };

  render(
    <CheckpointsStep
      draft={draft}
      videoId={videoId}
      videoThumbnail={null}
      updatePassingPercent={jest.fn()}
      addCheckpoint={jest.fn(() => 'checkpoint-2')}
      removeCheckpoint={jest.fn()}
      updateCheckpoint={jest.fn()}
      updateCheckpointQuestion={jest.fn()}
      updateCheckpointQuestionOption={jest.fn()}
      toggleCheckpointQuestionCorrectOption={jest.fn()}
      addCheckpointQuestion={jest.fn()}
      removeCheckpointQuestion={jest.fn()}
      addCheckpointQuestionOption={jest.fn()}
      removeCheckpointQuestionOption={jest.fn()}
    />
  );
}

describe('CheckpointsStep Create/Preview tabs', () => {
  it('opens on the Create tab with the authoring UI', () => {
    renderStep();

    expect(screen.getByRole('tab', { name: 'Create' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Lesson passing threshold percent')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-player')).not.toBeInTheDocument();
  });

  it('swaps the authoring UI for the student player when Preview is selected', () => {
    renderStep();

    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));

    const player = screen.getByTestId('preview-player');
    expect(player).toHaveAttribute('data-preview', 'true');
    expect(player).toHaveTextContent('Bunsen Burner Safety');
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByLabelText('Lesson passing threshold percent')).not.toBeInTheDocument();
  });

  it('tells the instructor the preview does not save anything', () => {
    renderStep();

    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));

    expect(screen.getByText(/nothing is saved/i)).toBeInTheDocument();
  });

  it('returns to the authoring UI from the Create tab', () => {
    renderStep();

    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Create' }));

    expect(screen.getByLabelText('Lesson passing threshold percent')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-player')).not.toBeInTheDocument();
  });

  it('disables Preview until a video has been added', () => {
    renderStep({ videoId: null });

    const previewTab = screen.getByRole('tab', { name: 'Preview' });
    expect(previewTab).toBeDisabled();
    expect(previewTab).toHaveAttribute('title', expect.stringContaining('lesson video'));
  });

  it('disables Preview until at least one checkpoint exists', () => {
    renderStep({ draftOverrides: { checkpoints: [] } });

    const previewTab = screen.getByRole('tab', { name: 'Preview' });
    expect(previewTab).toBeDisabled();
    expect(previewTab).toHaveAttribute('title', expect.stringContaining('checkpoint'));
  });

  it('remounts the player so each visit to Preview starts a fresh run', () => {
    renderStep();

    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    const first = screen.getByTestId('preview-player');

    fireEvent.click(screen.getByRole('tab', { name: 'Create' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));

    expect(screen.getByTestId('preview-player')).not.toBe(first);
  });
});
