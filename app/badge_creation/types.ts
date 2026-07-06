import type { BadgeCategory } from '@prisma/client';

export type StepKey = 'badgeInfo' | 'lessonVideo' | 'checkpoints' | 'rubric' | 'review';

export type StepDefinition = {
  key: StepKey;
  label: string;
};

export type CheckpointQuestionDraft = {
  id: string;
  question: string;
  questionType: 'multipleChoice' | 'shortAnswer';
  options: string[];
  correctIndices: number[];
  numericAnswer: string;
  numericRangeMin: string;
  numericRangeMax: string;
  // Optional unit for short-answer numeric questions. Blank => no unit assigned.
  unit: string;
  // Optional feedback shown when a learner answers incorrectly.
  incorrectFeedback: string;
  incorrectFeedbackEnabled: boolean;
};

export type CheckpointDraft = CheckpointQuestionDraft & {
  title: string;
  time: string;
  points: number;
  segmentLabel: string;
  questions: CheckpointQuestionDraft[];
};

export type RubricSubgoalDraft = {
  id: string;
  text: string;
  points: number;
};

export type RubricGoalDraft = {
  name: string;
  // Points needed to pass; total points is derived from the subgoals.
  passThreshold: number;
  subgoals: RubricSubgoalDraft[];
};

export type BadgeDraft = {
  badgeName: string;
  badgeDescription: string;
  category: BadgeCategory;
  // LinkedIn-style skill tags (max 5). Persisted in BadgeRequirement.summary JSON.
  skills: string[];
  availableOn: string;
  closesOn: string;
  neverCloses: boolean;
  youtubeUrl: string;
  videoTitle: string;
  videoLength: string;
  // Percent of checkpoint questions a student must answer correctly to pass the lesson.
  passingPercent: number;
  checkpoints: CheckpointDraft[];
  reassessmentLimit: number;
  cooldownDays: number;
  reassessmentRequired: boolean;
  reassessmentResources: string[];
  rubricGoal: RubricGoalDraft;
};

export type BadgeCatalogItem = {
  id: string;
  name: string;
  description: string | null;
  category: BadgeCategory | null;
  availableOn?: string | null;
  closesOn?: string | null;
  neverCloses?: boolean | null;
  rubricGoal?: {
    id: string;
    name: string;
    totalPoints: number;
    passThreshold: number;
    subgoals: Array<{ id: string; text: string; points: number; sortOrder: number }>;
  } | null;
  requirements: Array<{
    displayText: string;
    skills?: string[];
    checkpoints?: Array<
      Partial<CheckpointDraft> & {
        number?: number;
        correctIndex?: number | null;
        questions?: Array<Partial<CheckpointQuestionDraft> & { prompt?: string | null; correctIndex?: number | null }>;
      }
    >;
    // Video + passing threshold stored in the requirement summary JSON (source
    // badges have no lesson row, so these are the durable copy).
    youtubeUrl?: string | null;
    videoTitle?: string | null;
    videoLength?: string | null;
    passingPercent?: number | null;
    lesson: {
      title: string;
      description: string | null;
      dueDate: string | null;
      estimatedMinutes: number | null;
      passingPercent?: number | null;
      segment: {
        title: string;
        duration: number | null;
        videoUrl: string | null;
      } | null;
    } | null;
  }>;
};

export type BadgesResponse = {
  badges: BadgeCatalogItem[];
};

export const DRAFT_STORAGE_KEY = 'badge_creation_draft_v3';
export const DEFAULT_VIDEO_FALLBACK = 'Lesson video';

export const STEP_DEFINITIONS: StepDefinition[] = [
  { key: 'badgeInfo', label: 'Badge Info' },
  { key: 'lessonVideo', label: 'Upload Lesson Video' },
  { key: 'checkpoints', label: 'Create Checkpoints' },
  { key: 'rubric', label: 'Create Rubric' },
  { key: 'review', label: 'Review' },
];

export const DEFAULT_DRAFT: BadgeDraft = {
  badgeName: '',
  badgeDescription: '',
  category: 'OTHER',
  skills: [],
  availableOn: '',
  closesOn: '',
  neverCloses: true,
  youtubeUrl: '',
  videoTitle: '',
  videoLength: '',
  passingPercent: 70,
  checkpoints: [],
  reassessmentLimit: 0,
  cooldownDays: 0,
  reassessmentRequired: false,
  reassessmentResources: [],
  rubricGoal: {
    name: '',
    passThreshold: 1,
    subgoals: [
      {
        id: 'subgoal-1',
        text: '',
        points: 1,
      },
    ],
  },
};
