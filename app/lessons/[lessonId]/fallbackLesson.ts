import { type LessonRecord } from '../../hooks/useStudentData';

export const FALLBACK_LESSON: LessonRecord = {
  id: 'sample-lesson',
  slug: 'sample-lesson',
  title: 'Sample Lesson',
  summary: 'Lesson summary unavailable.',
  description:
    'This is a placeholder lesson overview. Replace with real lesson copy when content is ready. Keep the sections below updated so students know what to expect.',
  thumbnailUrl:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAZAAAAGQCAYAAABit0H5AAAACXBIWXMAAAsTAAALEwEAmpwYAAAF5ElEQVR4nO3cQW6bMBRAUT5t//9nnuJlsqS2HApRtf7CfJbFg4lQz+xX86IRERERERERERERGRP4gGrA7jw2cfZsv3xQNAOV6A3SxPg+wJprbV8MgRwBr4FUwPobnYz1UBBqefgdgPgC66P4U9AFbA+jJ0BjWZ/AVeAEObwfsBx8C3sB9gBnQ9V9gCtwPuwFjYOfgNrHg78Be0PhPwHp0NXfYAt8D6sBc2Dn4DSw4O/AXtD4T8BqdDV32ALfA+rAXNg5+A0sODvwF7Q+E/AanQ1d9gC3wPqwFzYOfgNLDg78Be0PhPwGp0NXfYAt8D6sBc2Dn4DSw4O/AXtD4T8BqdDV32ALfA+rAXNg5+A0sODvwF7Q+E/AanQ1d9gC3wPqwFzYOfgNLDg78Be0PhPwGp0NXfYAt8D6sBc2Dn4DSw4O/AXtD4T8BqdDV32ALfA+rAXNg5+A0sODvwF7Q+E/AanQ1d9gC3wPqwFzYOfgNLDg78Be0PhPwGp0NXfYDtwK3wHzYGfgPLA6N8A6sNzM0aW90U/K6EFe87Qp9e3t54J/3ORERERERERERERkd/5ALAeGdKyv4AAAAASUVORK5CYII=',
  estimatedMinutes: 0,
  dueDate: null,
  sortOrder: 0,
  status: 'NOT_STARTED',
  percentComplete: 0,
  segments: [
    {
      id: 'segment-a',
      title: 'Segment A',
      summary: 'Segment overview goes here.',
      duration: 1,
      videoUrl: 'https://www.youtube.com/watch?v=zxQyTK8quyY',
      muxPlaybackId: null,
      thumbnailUrl: null,
      status: 'NOT_STARTED',
      checkpointIds: [],
    },
  ],
  checkpoints: [
    {
      id: 'checkpoint-a',
      title: 'Checkpoint A',
      label: 'Checkpoint',
      meta: '3 questions',
      description: null,
      questionCount: 3,
      segmentId: null,
      timeOffsetSeconds: 90,
      snapshotUrl: 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=320&q=80',
      questions: [
        {
          id: 'fall-q1',
          prompt: 'Pick the only correct answer.',
          options: ['Wrong answer', 'Correct answer', 'Wrong answer'],
          correctIndex: 1,
        },
        {
          id: 'fall-q2',
          prompt: 'How are you feeling today?',
          options: ["I'm sad", "I'm happy", "I'm sad"],
          correctIndex: 1,
        },
        {
          id: 'fall-q3',
          prompt: 'Choose the accurate statement.',
          options: ['Wrong answer', 'Wrong answer', 'Correct answer'],
          correctIndex: 2,
        },
      ],
    },
  ],
  skills: ['Outline the main objectives', 'Summarize prerequisite knowledge', 'Describe the assessment checkpoints'],
};
