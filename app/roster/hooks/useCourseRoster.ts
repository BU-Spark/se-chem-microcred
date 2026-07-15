'use client';

import { useCallback, useEffect, useState } from 'react';

type EnrollmentSummary = {
  id: string;
  role: 'STUDENT' | 'INSTRUCTOR' | 'CHECKER';
  status: 'PENDING' | 'ACTIVE';
  sections: string[];
  student: {
    id: string;
    name: string | null;
    email: string | null;
    buid: string | null;
  };
};

type CourseRoster = {
  id: string;
  title: string;
  createdBy: {
    name: string | null;
    email: string | null;
  } | null;
  enrollments: EnrollmentSummary[];
};

type CourseRosterResponse = {
  viewerRole?: 'STUDENT' | 'INSTRUCTOR' | 'CHECKER';
  course: CourseRoster;
};

export function useCourseRoster(courseId?: string | null, email?: string | null) {
  const [data, setData] = useState<CourseRosterResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!courseId || !email) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/courses/${encodeURIComponent(courseId)}?email=${encodeURIComponent(email)}`, {
        headers: { Accept: 'application/json' },
      });

      const payload = await response.json().catch(() => ({
        error: `Request failed: ${response.status}`,
      }));

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to load course roster.');
      }

      setData(payload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Unable to load course roster.');
    } finally {
      setIsLoading(false);
    }
  }, [courseId, email]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refresh: fetchData };
}
