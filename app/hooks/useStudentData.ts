import { useCallback, useMemo } from 'react';
import useSWR from 'swr';

import { fetcher } from './lib/fetcher';

type LessonStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
type SegmentStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
type BadgeStatus = 'COMPLETED' | 'READY_FOR_ASSESSMENT' | 'READY_FOR_FINALIZATION' | 'LEARNING' | 'NOT_STARTED';

export interface StudentData {
  student: {
    id: string;
    name: string | null;
    email: string;
    buid: string | null;
    gender: string | null;
    raceEthnicity: string | null;
    parentalEducation: string | null;
    pellGrantQualified: boolean | null;
    createdAt: string;
    avatar: {
      base: string;
      face: string;
      accessory: string | null;
    } | null;
  };
  course: {
    id: string;
    code: string;
    section: string | null;
    title: string;
    description: string | null;
    contacts: Array<{
      id: string;
      type: string;
      name: string;
      email: string;
      avatarUrl?: string | null;
    }>;
  } | null;
  analytics: {
    hoursLearning: number;
    badgesCompleted: number;
    badgesReadyForAssessment: number;
    badgesNotAttempted: number;
    questionsAnswered: number;
    averageAssessmentScore: number;
    highestAssessmentScore: number;
  } | null;
  lessons: {
    catalog: LessonRecord[];
    upNext: LessonRecord[];
    inProgress: LessonRecord[];
    completed: LessonRecord[];
  };
  badges: {
    completed: BadgeRecord[];
    readyForAssessment: BadgeRecord[];
    readyForFinalization: BadgeRecord[];
    learning: BadgeRecord[];
    notStarted: BadgeRecord[];
  };
  surveys: {
    lesson: Array<{
      id: string;
      question: string;
      lessonSlug: string | null;
      lessonTitle: string | null;
      completed: boolean;
    }>;
    badge: Array<{
      id: string;
      question: string;
      badgeId: string | null;
      badgeSlug: string | null;
      badgeName: string | null;
      completed: boolean;
    }>;
    pendingBadge: Array<{
      promptId: string;
      badgeId: string;
      badgeSlug: string | null;
      badgeName: string | null;
      question: string;
    }>;
  };
}

export interface LessonRecord {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string | null;
  thumbnailUrl: string | null;
  estimatedMinutes: number | null;
  dueDate: string | null;
  availableOn: string | null;
  sortOrder: number;
  passingPercent: number;
  status: LessonStatus;
  percentComplete: number;
  completedCheckpointIds: string[];
  resumeTimeSeconds: number;
  answeredCheckpointIds: string[];
  segments: Array<{
    id: string;
    title: string;
    summary: string | null;
    duration: number | null;
    videoUrl: string | null;
    muxPlaybackId: string | null;
    thumbnailUrl: string | null;
    status: SegmentStatus;
    checkpointIds: string[];
  }>;
  checkpoints: Array<{
    id: string;
    title: string;
    label: string | null;
    meta: string | null;
    description: string | null;
    questionCount: number;
    segmentId: string | null;
    timeOffsetSeconds: number;
    snapshotUrl: string | null;
    questions: Array<{
      id: string;
      prompt: string;
      options: string[] | Record<string, unknown>;
      correctIndex: number | null;
      correctIndices: number[];
      type: 'multipleChoice' | 'shortAnswer';
      expectedAnswer: number | null;
      tolerancePercent: number;
      acceptedRange: { min: number; max: number } | null;
    }>;
  }>;
  badgeRequirements: Array<{
    badgeId: string;
    badgeName: string;
    badgeSlug: string;
    youtubeUrl?: string | null;
  }>;
  skills: string[];
  lastGradePercent: number | null;
  lastGradePassed: boolean | null;
  lastGradedAt: string | null;
}

export interface BadgeRecord {
  id: string;
  courseId: string | null;
  slug: string;
  name: string;
  description: string | null;
  status: BadgeStatus;
  awardedAt: string | null;
  score: number | null;
  youtubeUrl: string | null;
  requirements: Array<{
    summary: string | null;
    lessonSlug: string | null;
    lessonTitle: string | null;
  }>;
}

interface StudentApiResponse {
  student: StudentData['student'];
  course: StudentData['course'];
  analytics: StudentData['analytics'];
  lessons: StudentData['lessons'];
  badges: StudentData['badges'];
  surveys: StudentData['surveys'];
}

async function fetchStudentData(url: string): Promise<StudentApiResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    return await fetcher<StudentApiResponse>(
      url,
      {
        method: 'GET',
        signal: controller.signal,
      },
      false
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function useStudentData(email?: string | null, courseId?: string | null) {
  const key = useMemo(() => {
    if (!email) return null;
    const params = new URLSearchParams({ email });
    if (courseId) params.set('courseId', courseId);
    return `/api/demo/student?${params.toString()}`;
  }, [courseId, email]);

  const {
    data,
    error: swrError,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<StudentApiResponse>(key, fetchStudentData, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const refresh = useCallback(() => {
    void mutate();
  }, [mutate]);

  const error =
    swrError instanceof Error ? swrError.message : swrError ? 'Unknown error while loading student data.' : null;

  return {
    data: error ? null : (data ?? null),
    isLoading: isLoading || isValidating,
    error,
    refresh,
  };
}
