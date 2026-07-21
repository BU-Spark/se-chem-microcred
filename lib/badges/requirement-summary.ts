import { CheckpointPayload } from '@/lib/checkpoints/types';
import { normalizeString } from '@/lib/checkpoints/normalizeWrite';

// The JSON payload stored in BadgeRequirement.summary. Independent (no-course)
// badges have no Lesson row, so their video and checkpoints round-trip through
// this blob instead of real tables. See docs/badge-data-model-issue.md.
export type RequirementSummary = {
  displayText: string;
  skills: string[];
  checkpoints: CheckpointPayload[];
  lessonTitle: string | null;
  youtubeUrl: string | null;
  videoTitle: string | null;
  videoLength: string | null;
  passingPercent: number | null;
};

export function parseRequirementSummary(summary?: string | null): RequirementSummary {
  if (!summary) {
    return {
      displayText: 'Independent badge requirement',
      skills: [],
      checkpoints: [],
      lessonTitle: null,
      youtubeUrl: null,
      videoTitle: null,
      videoLength: null,
      passingPercent: null,
    };
  }

  try {
    const parsed = JSON.parse(summary) as {
      lessonTitle?: string | null;
      skills?: string[];
      checkpoints?: CheckpointPayload[];
      youtubeUrl?: string | null;
      videoTitle?: string | null;
      videoLength?: string | null;
      passingPercent?: number | null;
    };

    return {
      displayText: 'Independent badge requirement',
      skills: Array.isArray(parsed.skills) ? parsed.skills.filter((skill): skill is string => Boolean(skill)) : [],
      checkpoints: Array.isArray(parsed.checkpoints) ? parsed.checkpoints : [],
      lessonTitle: normalizeString(parsed.lessonTitle),
      youtubeUrl: normalizeString(parsed.youtubeUrl),
      videoTitle: normalizeString(parsed.videoTitle),
      videoLength: normalizeString(parsed.videoLength),
      passingPercent: typeof parsed.passingPercent === 'number' ? parsed.passingPercent : null,
    };
  } catch {
    return {
      displayText: summary,
      skills: [],
      checkpoints: [],
      lessonTitle: null,
      youtubeUrl: null,
      videoTitle: null,
      videoLength: null,
      passingPercent: null,
    };
  }
}
