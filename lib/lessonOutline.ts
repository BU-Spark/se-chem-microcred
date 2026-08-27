// Lesson-overview outline model: turns raw segment/checkpoint rows into the
// ordered "Part 1 → Checkpoint → Part 2 → … → End of lesson" steps the lesson
// preview renders, together with per-step and whole-lesson time estimates.
//
// Duration units matter here: `LessonSegment.duration` is stored in SECONDS
// (see lib/badges/badge.service.ts, which writes videoDurationSeconds) while
// `Lesson.estimatedMinutes` is minutes. Older lessons authored before video
// length was captured have neither, so every derived time is nullable and the
// UI is expected to render a "—" style fallback rather than a bogus 0.
import { buildYoutubeThumbnail } from '@/lib/video';

export interface OutlineSegmentInput {
  id: string;
  title?: string | null;
  /** Video length in SECONDS. Null on lessons authored without a length. */
  duration: number | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
}

export interface OutlineCheckpointInput {
  id: string;
  segmentId: string | null;
  timeOffsetSeconds: number;
  snapshotUrl: string | null;
  questionCount: number;
  questions?: unknown[];
}

export interface OutlineLessonInput {
  thumbnailUrl: string | null;
  estimatedMinutes: number | null;
  segments: OutlineSegmentInput[];
  checkpoints: OutlineCheckpointInput[];
  badgeRequirements?: Array<{ youtubeUrl?: string | null }>;
}

export interface OutlinePart {
  id: string;
  title: string;
  /** Null when the source data cannot produce a trustworthy estimate. */
  durationSeconds: number | null;
  durationLabel: string;
  thumbnailUrl: string | null;
  /** The checkpoint that gates the end of this part, when there is one. */
  checkpoint: {
    id: string;
    questionCount: number;
    questionLabel: string;
  } | null;
}

export interface LessonOutline {
  parts: OutlinePart[];
  checkpointCount: number;
  totalSeconds: number | null;
  totalLabel: string;
}

/** Human duration: "<1 min", "8 min", "1 hr 5 min". Null/0 → em dash. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 60) return '<1 min';

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

export function formatQuestionCount(count?: number | null): string {
  const safeCount = Math.max(0, Math.floor(count ?? 0));
  return `${safeCount} question${safeCount === 1 ? '' : 's'}`;
}

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Whole-lesson runtime in seconds, in order of trust:
 *   1. the sum of segment lengths (authored from the real video),
 *   2. Lesson.estimatedMinutes (rounded from that same length at creation time),
 *   3. the last checkpoint offset — a lower bound, but better than nothing.
 * Returns null when the lesson carries no timing data at all.
 */
export function deriveTotalSeconds(lesson: OutlineLessonInput): number | null {
  const fromSegments = lesson.segments.reduce((sum, segment) => sum + (positiveOrNull(segment.duration) ?? 0), 0);
  if (fromSegments > 0) return fromSegments;

  const fromEstimate = positiveOrNull(lesson.estimatedMinutes);
  if (fromEstimate) return fromEstimate * 60;

  const lastOffset = lesson.checkpoints.reduce(
    (max, checkpoint) => Math.max(max, positiveOrNull(checkpoint.timeOffsetSeconds) ?? 0),
    0
  );
  return lastOffset > 0 ? lastOffset : null;
}

/**
 * Best available still frame for a part. Explicit checkpoint snapshots win, then
 * the segment's own thumbnail, then a YouTube frame grab, then the lesson art.
 */
function resolveThumbnail(
  lesson: OutlineLessonInput,
  segment: OutlineSegmentInput | null,
  snapshotUrl: string | null
): string | null {
  if (snapshotUrl) return snapshotUrl;
  if (segment?.thumbnailUrl) return segment.thumbnailUrl;

  // Badge-only lessons keep the video on the requirement summary, not a segment.
  const badgeVideoUrl = lesson.badgeRequirements?.find((requirement) => requirement.youtubeUrl)?.youtubeUrl ?? null;
  // mqdefault is the only always-present frame with no letterbox bars baked in:
  // hqdefault/sddefault pad a 16:9 video onto a 4:3 canvas with black bands.
  const youtubeThumbnail = buildYoutubeThumbnail(
    segment?.videoUrl ?? lesson.segments[0]?.videoUrl ?? badgeVideoUrl,
    'mqdefault'
  );
  if (youtubeThumbnail) return youtubeThumbnail;

  return lesson.thumbnailUrl || null;
}

/**
 * Build the ordered outline. Parts are the video stretches BETWEEN checkpoints,
 * so N checkpoints produce N+1 parts whenever the lesson runs past the final
 * checkpoint. With no checkpoints at all, each segment becomes its own part.
 */
export function buildLessonOutline(lesson: OutlineLessonInput | null | undefined): LessonOutline {
  if (!lesson) {
    return { parts: [], checkpointCount: 0, totalSeconds: null, totalLabel: formatDuration(null) };
  }

  const segments = lesson.segments ?? [];
  const checkpoints = [...(lesson.checkpoints ?? [])].sort(
    (a, b) => (a.timeOffsetSeconds ?? 0) - (b.timeOffsetSeconds ?? 0)
  );
  const segmentById = new Map(segments.filter((segment) => segment.id).map((segment) => [segment.id, segment]));
  const totalSeconds = deriveTotalSeconds(lesson);

  const parts: OutlinePart[] = [];

  if (checkpoints.length === 0) {
    // No checkpoints: one part per segment, or a single part for the whole video.
    const sources = segments.length > 0 ? segments : [];
    sources.forEach((segment, index) => {
      parts.push({
        id: segment.id || `part-${index}`,
        title: `Part ${index + 1}`,
        durationSeconds: positiveOrNull(segment.duration) ?? (sources.length === 1 ? totalSeconds : null),
        durationLabel: '',
        thumbnailUrl: resolveThumbnail(lesson, segment, null),
        checkpoint: null,
      });
    });
  } else {
    checkpoints.forEach((checkpoint, index) => {
      const previousOffset = index === 0 ? 0 : (positiveOrNull(checkpoints[index - 1]?.timeOffsetSeconds) ?? 0);
      const currentOffset = positiveOrNull(checkpoint.timeOffsetSeconds) ?? 0;
      const spanSeconds = currentOffset - previousOffset;
      const segment = (checkpoint.segmentId ? segmentById.get(checkpoint.segmentId) : null) ?? segments[index] ?? null;

      parts.push({
        id: checkpoint.id || `part-${index}`,
        title: `Part ${index + 1}`,
        // A non-positive span means the offsets are missing or out of order —
        // fall back to the segment's own length before giving up on a number.
        durationSeconds: spanSeconds > 0 ? spanSeconds : positiveOrNull(segment?.duration),
        durationLabel: '',
        thumbnailUrl: resolveThumbnail(lesson, segment, checkpoint.snapshotUrl),
        checkpoint: {
          id: checkpoint.id,
          questionCount: checkpoint.questions?.length || checkpoint.questionCount || 0,
          questionLabel: formatQuestionCount(checkpoint.questions?.length || checkpoint.questionCount),
        },
      });
    });

    // Tail part: whatever plays after the last checkpoint.
    const lastOffset = positiveOrNull(checkpoints[checkpoints.length - 1]?.timeOffsetSeconds) ?? 0;
    const tailSeconds = totalSeconds != null ? totalSeconds - lastOffset : 0;
    if (tailSeconds > 0) {
      const segment = segments[checkpoints.length] ?? segments.at(-1) ?? null;
      parts.push({
        id: `part-tail`,
        title: `Part ${checkpoints.length + 1}`,
        durationSeconds: tailSeconds,
        durationLabel: '',
        thumbnailUrl: resolveThumbnail(lesson, segment, null),
        checkpoint: null,
      });
    }
  }

  return {
    parts: parts.map((part) => ({ ...part, durationLabel: formatDuration(part.durationSeconds) })),
    checkpointCount: checkpoints.length,
    totalSeconds,
    totalLabel: formatDuration(totalSeconds),
  };
}
