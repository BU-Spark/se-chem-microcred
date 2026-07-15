import { useCallback, useEffect, useMemo, useState } from 'react';
import { StudentData } from '@/lib/students/types';
/** @deprecated import from '@/lib/students/types' instead */
export type {
  StudentData,
  LessonRecord,
  BadgeRecord,
  LessonStatus,
  SegmentStatus,
  BadgeStatus,
} from '@/lib/students/types';

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
