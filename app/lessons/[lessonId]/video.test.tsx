import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { LessonRecord } from '../../hooks/useStudentData';
import { LessonVideoPage } from './video';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

function buildLesson(overrides: Partial<LessonRecord> = {}): LessonRecord {
  return {
    id: 'lesson-1',
    slug: 'lesson-1',
    title: 'Safety Lesson',
    summary: 'Summary',
    description: 'Description',
    thumbnailUrl: null,
    estimatedMinutes: 10,
    dueDate: null,
    availableOn: null,
    sortOrder: 0,
    passingPercent: 70,
    status: 'IN_PROGRESS',
    percentComplete: 50,
    completedCheckpointIds: [],
    resumeTimeSeconds: 0,
    answeredCheckpointIds: ['checkpoint-1'],
    segments: [
      {
        id: 'segment-1',
        title: 'Segment 1',
        summary: null,
        duration: 300,
        videoUrl: null,
        muxPlaybackId: null,
        thumbnailUrl: null,
        status: 'NOT_STARTED',
        checkpointIds: ['checkpoint-1', 'checkpoint-2'],
      },
    ],
    checkpoints: [
      {
        id: 'checkpoint-1',
        title: 'Checkpoint 1',
        label: 'Checkpoint 1',
        meta: null,
        description: null,
        questionCount: 1,
        segmentId: 'segment-1',
        timeOffsetSeconds: 30,
        snapshotUrl: null,
        questions: [
          {
            id: 'question-1',
            prompt: 'Question?',
            options: ['A', 'B'],
            correctIndex: 0,
            correctIndices: [0],
            type: 'multipleChoice',
            expectedAnswer: null,
            tolerancePercent: 0,
            acceptedRange: null,
          },
        ],
      },
      {
        id: 'checkpoint-2',
        title: 'Checkpoint 2',
        label: 'Checkpoint 2',
        meta: null,
        description: null,
        questionCount: 1,
        segmentId: 'segment-1',
        timeOffsetSeconds: 60,
        snapshotUrl: null,
        questions: [],
      },
    ],
    badgeRequirements: [],
    skills: [],
    lastGradePercent: null,
    lastGradePassed: null,
    lastGradedAt: null,
    ...overrides,
  };
}

const PREVIEW_DURATION = 300;

// Minimal stand-in for the YouTube IFrame API. Without it the component never
// learns the video duration, and the timeline (checkpoint markers, scrubber
// bounds) stays unrendered.
function installFakeYouTubePlayer(duration = PREVIEW_DURATION) {
  let currentTime = 0;
  const player = {
    playVideo: jest.fn(),
    pauseVideo: jest.fn(),
    seekTo: jest.fn((seconds: number) => {
      currentTime = seconds;
    }),
    getCurrentTime: () => currentTime,
    getDuration: () => duration,
    destroy: jest.fn(),
    mute: jest.fn(),
    unMute: jest.fn(),
    isMuted: () => false,
    loadModule: jest.fn(),
    unloadModule: jest.fn(),
  };

  (window as unknown as { YT: unknown }).YT = {
    // onReady is deferred because the component assigns playerRef *after* the
    // constructor returns, and reads it inside the handler.
    Player: function FakePlayer(_element: HTMLElement, options: { events?: { onReady?: () => void } }) {
      setTimeout(() => options.events?.onReady?.(), 0);
      return player;
    },
    PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
  };

  return player;
}

async function flushPlayerReady() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function withVideo(): Partial<LessonRecord> {
  return {
    segments: [
      {
        id: 'segment-1',
        title: 'Segment 1',
        summary: null,
        duration: PREVIEW_DURATION,
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        muxPlaybackId: null,
        thumbnailUrl: null,
        status: 'NOT_STARTED',
        checkpointIds: ['checkpoint-1', 'checkpoint-2'],
      },
    ],
  };
}

describe('LessonVideoPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
    delete (window as unknown as { YT?: unknown }).YT;
  });

  it('renders the lesson title and current video segment', () => {
    render(
      <LessonVideoPage
        lesson={buildLesson()}
        studentEmail="student@example.edu"
        studentId="student-1"
        resumeRequested={false}
      />
    );

    expect(screen.getByRole('heading', { name: 'Safety Lesson' })).toBeInTheDocument();
    expect(screen.getByText('Segment 1')).toBeInTheDocument();
  });

  it('no longer renders the removed checkpoint timeline rail (issue #193)', () => {
    render(
      <LessonVideoPage
        lesson={buildLesson({
          completedCheckpointIds: ['checkpoint-1'],
          answeredCheckpointIds: ['checkpoint-1'],
        })}
        studentEmail="student@example.edu"
        studentId="student-1"
        resumeRequested={false}
      />
    );

    // The old left rail rendered per-checkpoint ✓ / × status glyphs; it was removed.
    expect(screen.queryByText('✓')).not.toBeInTheDocument();
    expect(screen.queryByText('×')).not.toBeInTheDocument();
  });

  describe('instructor preview mode', () => {
    it('records a lesson start for a real student run', () => {
      render(
        <LessonVideoPage
          lesson={buildLesson()}
          studentEmail="student@example.edu"
          studentId="student-1"
          resumeRequested={false}
        />
      );

      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/start'), expect.anything());
    });

    it('never touches the API, because the previewed lesson does not exist yet', () => {
      render(
        <LessonVideoPage
          lesson={buildLesson()}
          studentEmail="instructor@example.edu"
          studentId="instructor-1"
          resumeRequested={false}
          previewMode
        />
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('hands control back to the editor instead of navigating away', () => {
      const onExitPreview = jest.fn();
      render(
        <LessonVideoPage
          lesson={buildLesson()}
          studentEmail="instructor@example.edu"
          studentId="instructor-1"
          resumeRequested={false}
          previewMode
          onExitPreview={onExitPreview}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Back to editing' }));

      expect(onExitPreview).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('unlocks the whole timeline so the instructor need not watch it through', async () => {
      installFakeYouTubePlayer();
      render(
        <LessonVideoPage
          lesson={buildLesson(withVideo())}
          studentEmail="instructor@example.edu"
          studentId="instructor-1"
          resumeRequested={false}
          previewMode
        />
      );
      await flushPlayerReady();

      const scrubber = screen.getByRole('slider') as HTMLInputElement;
      await waitFor(() => expect(scrubber).toHaveAttribute('max', String(PREVIEW_DURATION)));
      // A student's scrubber is capped at how far they have watched (0 here);
      // the preview's reaches the end of the video.
      fireEvent.change(scrubber, { target: { value: String(PREVIEW_DURATION - 10) } });
      expect(Number(scrubber.value)).toBe(PREVIEW_DURATION - 10);
    });

    it('keeps a student from scrubbing past what they have watched', async () => {
      installFakeYouTubePlayer();
      render(
        <LessonVideoPage
          lesson={buildLesson(withVideo())}
          studentEmail="student@example.edu"
          studentId="student-1"
          resumeRequested={false}
        />
      );
      await flushPlayerReady();

      const scrubber = screen.getByRole('slider') as HTMLInputElement;
      fireEvent.change(scrubber, { target: { value: String(PREVIEW_DURATION - 10) } });
      expect(Number(scrubber.value)).toBe(0);
    });

    it('lets the instructor jump straight to a checkpoint from the timeline', async () => {
      installFakeYouTubePlayer();
      render(
        <LessonVideoPage
          lesson={buildLesson(withVideo())}
          studentEmail="instructor@example.edu"
          studentId="instructor-1"
          resumeRequested={false}
          previewMode
        />
      );
      await flushPlayerReady();

      // checkpoint-2 has no questions, so only checkpoint-1 is jumpable.
      fireEvent.click(screen.getByRole('button', { name: 'Jump to checkpoint: Checkpoint 1' }));

      expect(screen.getByText('Answer each question to continue.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Checkpoint 1' })).toBeInTheDocument();
    });

    it('does not offer checkpoint jumping to a real student', async () => {
      installFakeYouTubePlayer();
      render(
        <LessonVideoPage
          lesson={buildLesson(withVideo())}
          studentEmail="student@example.edu"
          studentId="student-1"
          resumeRequested={false}
        />
      );
      await flushPlayerReady();

      expect(screen.queryByRole('button', { name: /Jump to checkpoint/i })).not.toBeInTheDocument();
    });

    it('lets the instructor finish without watching the whole video', () => {
      render(
        <LessonVideoPage
          lesson={buildLesson()}
          studentEmail="instructor@example.edu"
          studentId="instructor-1"
          resumeRequested={false}
          previewMode
        />
      );

      // A student's Finish stays disabled until the video ends and every
      // checkpoint is answered; the preview's is live from the start.
      expect(screen.getByRole('button', { name: 'Finish lesson' })).toBeEnabled();
    });

    it('keeps a student gated behind the whole video', () => {
      render(
        <LessonVideoPage
          lesson={buildLesson()}
          studentEmail="student@example.edu"
          studentId="student-1"
          resumeRequested={false}
        />
      );

      expect(screen.getByRole('button', { name: 'Finish lesson' })).toBeDisabled();
    });

    it('keeps the timeline gated like a first-time student run, not a rewatch', () => {
      render(
        <LessonVideoPage
          lesson={buildLesson()}
          studentEmail="instructor@example.edu"
          studentId="instructor-1"
          resumeRequested={false}
          previewMode
        />
      );

      // Review mode is a rewatch of an already-graded lesson: it hides Finish and
      // treats re-answers as ungraded practice. The preview must do neither — it
      // is a first-time run, just with the scrubber unlocked.
      expect(screen.queryByRole('button', { name: /Review checkpoint/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Finish lesson' })).toBeInTheDocument();
    });
  });
});
