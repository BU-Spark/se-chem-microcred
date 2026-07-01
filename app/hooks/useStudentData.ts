import { useCallback, useEffect, useMemo, useState } from 'react';

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
  category: string | null;
  status: BadgeStatus;
  awardedAt: string | null;
  score: number | null;
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

export function useStudentData(email?: string | null, courseId?: string | null) {
  const [data, setData] = useState<StudentData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!email) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const params = new URLSearchParams({ email });
      if (courseId) {
        params.set('courseId', courseId);
      }

      const response = await fetch(`/api/demo/student?${params.toString()}`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const message = await response.json().catch(() => ({ error: `Request failed with status ${response.status}` }));
        throw new Error(message.error ?? 'Unable to load student data.');
      }

      const payload = (await response.json()) as StudentApiResponse;
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error while loading student data.');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [email, courseId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const refresh = useCallback(() => {
    void fetchData();
  }, [fetchData]);

  const memoizedData = useMemo(() => data, [data]);

  return {
    data: memoizedData,
    isLoading,
    error,
    refresh,
  };
}
