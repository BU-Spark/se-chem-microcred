import { render, screen } from '@testing-library/react';

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

describe('LessonVideoPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
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
});
