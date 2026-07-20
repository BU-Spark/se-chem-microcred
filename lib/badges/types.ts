import { CheckpointPayload } from '@/lib/checkpoints/types';
import { RubricGoalPayload } from '@/lib/rubric/types';

export type CreateBadgePayload = {
  courseId?: string | null;
  badgeName?: string | null;
  badgeDescription?: string | null;
  skills?: string[] | null;
  availableOn?: string | null;
  closesOn?: string | null;
  neverCloses?: boolean | null;
  youtubeUrl?: string | null;
  videoTitle?: string | null;
  videoLength?: string | null;
  passingPercent?: number | string | null;
  checkpoints?: CheckpointPayload[] | null;
  rubricGoal?: RubricGoalPayload | null;
};

export type UpdateBadgePayload = {
  id?: string | null;
  badgeName?: string | null;
  badgeDescription?: string | null;
  skills?: string[] | null;
  availableOn?: string | null;
  closesOn?: string | null;
  neverCloses?: boolean | null;
  rubricGoal?: RubricGoalPayload | null;
  checkpoints?: CheckpointPayload[] | null;
  youtubeUrl?: string | null;
  videoTitle?: string | null;
  videoLength?: string | null;
  passingPercent?: number | string | null;
};

export type ImportBadgePayload = {
  badgeId?: string | null;
  availableOn?: string | null;
  closesOn?: string | null;
  neverCloses?: boolean | null;
};
