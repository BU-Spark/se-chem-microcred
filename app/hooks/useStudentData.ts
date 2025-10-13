import { useCallback, useEffect, useMemo, useState } from 'react';

type LessonStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
type SegmentStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
type BadgeStatus = 'COMPLETED' | 'READY_FOR_ASSESSMENT' | 'LEARNING';

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
      avatarUrl: string | null;
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
    learning: BadgeRecord[];
  };
  surveys: {
    lesson: Array<{
      id: string;
      question: string;
      lessonSlug: string | null;
      lessonTitle: string | null;
    }>;
    badge: Array<{
      id: string;
      question: string;
      badgeSlug: string | null;
      badgeName: string | null;
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
  status: LessonStatus;
  percentComplete: number;
  segments: Array<{
    id: string;
    title: string;
    summary: string | null;
    duration: number | null;
    videoUrl: string | null;
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
    questions: Array<{
      id: string;
      prompt: string;
      options: unknown;
      correctIndex: number | null;
    }>;
  }>;
  skills: string[];
}

export interface BadgeRecord {
  id: string;
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

export function useStudentData(email?: string | null) {
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

      const response = await fetch(`/api/demo/student?email=${encodeURIComponent(email)}`, {
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
  }, [email]);

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
