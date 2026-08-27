import { buildQuestionOptions } from '@/lib/checkpoints/normalizeWrite';
import { normalizeCheckpointQuestion } from '@/lib/checkpointQuestions';
import type { Prisma } from '@prisma/client';

import type { LessonRecord } from '../../hooks/useStudentData';
import type { BadgeDraft, CheckpointDraft } from '../types';
import { parseTimecodeToSeconds } from './badge-helpers';

// Synthetic ids for the preview lesson/segment. They never reach the database —
// the preview player is fully client-side — but the student component keys DOM
// nodes and effects off them, so they need to be stable within a preview run.
export const PREVIEW_LESSON_ID = 'badge-preview-lesson';
export const PREVIEW_SEGMENT_ID = 'badge-preview-segment';

// Draft question ids are only unique within their checkpoint ("question-1"
// repeats across checkpoints), but the player keys its answer map by question id
// across the whole lesson. Namespace them so two checkpoints can't collide.
function previewQuestionId(checkpointId: string, questionId: string, index: number) {
  return `${checkpointId}::${questionId || `question-${index + 1}`}`;
}

function toPreviewCheckpoint(checkpoint: CheckpointDraft, index: number): LessonRecord['checkpoints'][number] {
  const questions = checkpoint.questions.map((question, questionIndex) => {
    // Run the draft through the exact same write-normalization the API applies
    // when the badge is saved, then read it back with the same normalizer the
    // student page uses. Anything the instructor sees here is what a real
    // student would get — no parallel interpretation of the draft shape.
    const { options, correctIndex } = buildQuestionOptions(question);
    return normalizeCheckpointQuestion({
      id: previewQuestionId(checkpoint.id, question.id, questionIndex),
      prompt: question.question ?? '',
      options: options as unknown as Prisma.JsonValue,
      correctIndex,
      points: question.points,
    });
  });

  return {
    id: checkpoint.id,
    title: checkpoint.title || `Checkpoint ${index + 1}`,
    label: null,
    meta: null,
    description: null,
    questionCount: questions.length,
    segmentId: PREVIEW_SEGMENT_ID,
    timeOffsetSeconds: parseTimecodeToSeconds(checkpoint.time),
    snapshotUrl: null,
    questions,
  };
}

// Builds the in-memory LessonRecord the instructor preview feeds to the real
// student player. Progress fields are all empty so the preview always starts as
// a fresh first-time run: locked scrubber, every checkpoint still to answer.
export function buildPreviewLesson(draft: BadgeDraft): LessonRecord {
  const checkpoints = [...draft.checkpoints]
    .map((checkpoint, index) => toPreviewCheckpoint(checkpoint, index))
    .sort((left, right) => left.timeOffsetSeconds - right.timeOffsetSeconds);

  return {
    id: PREVIEW_LESSON_ID,
    slug: PREVIEW_LESSON_ID,
    title: draft.videoTitle || draft.badgeName || 'Lesson preview',
    summary: draft.badgeDescription ?? '',
    description: draft.badgeDescription || null,
    thumbnailUrl: null,
    estimatedMinutes: null,
    dueDate: null,
    availableOn: null,
    sortOrder: 0,
    passingPercent: draft.passingPercent,
    status: 'NOT_STARTED',
    percentComplete: 0,
    completedCheckpointIds: [],
    resumeTimeSeconds: 0,
    answeredCheckpointIds: [],
    segments: [
      {
        id: PREVIEW_SEGMENT_ID,
        title: draft.videoTitle || 'Lesson video',
        summary: null,
        duration: null,
        videoUrl: draft.youtubeUrl || null,
        muxPlaybackId: null,
        thumbnailUrl: null,
        status: 'NOT_STARTED',
        checkpointIds: checkpoints.map((checkpoint) => checkpoint.id),
      },
    ],
    checkpoints,
    // No badge requirement: the preview must never surface an assessment QR code,
    // which only makes sense for a badge that actually exists.
    badgeRequirements: [],
    skills: draft.skills,
    lastGradePercent: null,
    lastGradePassed: null,
    lastGradedAt: null,
  };
}
