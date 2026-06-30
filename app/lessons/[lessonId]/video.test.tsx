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

  it('checks previously finished checkpoints when returning to a lesson', () => {
    render(
      <LessonVideoPage
        lesson={buildLesson()}
        studentEmail="student@example.edu"
        studentId="student-1"
        lessonSurvey={null}
        resumeRequested={false}
      />
    );

    expect(screen.getByText('✓')).toBeInTheDocument();
  });
});
