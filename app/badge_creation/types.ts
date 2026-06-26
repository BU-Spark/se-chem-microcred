import type { BadgeCategory } from '@prisma/client';

export type StepKey = 'badgeInfo' | 'lessonVideo' | 'checkpoints' | 'rubric' | 'review';

export type StepDefinition = {
  key: StepKey;
  label: string;
};

export type CheckpointDraft = {
  id: string;
  title: string;
  time: string;
  points: number;
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
  segmentLabel: string;
};

export type RubricCriterion = {
  id: string;
  prompt: string;
  options: string[];
  // Prewritten feedback paired 1:1 with `options` (same index). Blank => none.
  optionFeedback: string[];
};

export type RubricItem = {
  id: string;
  text: string;
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
  checkpoints: CheckpointDraft[];
  reassessmentLimit: number;
  cooldownDays: number;
  reassessmentRequired: boolean;
  reassessmentResources: string[];
  rubricOverview: string;
  rubricItems: RubricItem[];
  rubricCriteria: RubricCriterion[];
};

export type BadgeCatalogItem = {
  id: string;
  name: string;
  description: string | null;
  category: BadgeCategory | null;
  availableOn?: string | null;
  closesOn?: string | null;
  neverCloses?: boolean | null;
  requirements: Array<{
    displayText: string;
    skills?: string[];
    rubricItems: Array<{ number: number; text: string }>;
    gradingCriteria: Array<{
      number: number;
      criterion: string | null;
      options: string[];
      optionFeedback?: string[];
    }>;
    checkpoints?: Array<Partial<CheckpointDraft> & { number?: number; correctIndex?: number | null }>;
    lesson: {
      title: string;
      description: string | null;
      dueDate: string | null;
      estimatedMinutes: number | null;
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

export const DRAFT_STORAGE_KEY = 'badge_creation_draft_v2';
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
  checkpoints: [
    {
      id: 'checkpoint-1',
      title: 'Checkpoint 1',
      time: '00:00:00',
      points: 5,
      question: '',
      questionType: 'multipleChoice',
      options: ['', '', '', ''],
      correctIndices: [0],
      numericAnswer: '',
      numericRangeMin: '',
      numericRangeMax: '',
      unit: '',
      incorrectFeedback: '',
      incorrectFeedbackEnabled: false,
      segmentLabel: 'Segment 1 Starts 00:00:00',
    },
  ],
  reassessmentLimit: 0,
  cooldownDays: 0,
  reassessmentRequired: false,
  reassessmentResources: [],
  rubricOverview: '',
  rubricItems: [
    {
      id: 'rubric-item-1',
      text: '',
    },
  ],
  rubricCriteria: [
    {
      id: 'criterion-1',
      prompt: '',
      options: ['', '', ''],
      optionFeedback: ['', '', ''],
    },
  ],
};
