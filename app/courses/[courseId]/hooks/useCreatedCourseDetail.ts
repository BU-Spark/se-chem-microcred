'use client';

import { useCallback, useEffect, useState } from 'react';

type CourseContact = {
  id: string;
  type: 'INSTRUCTOR' | 'CHECKER';
  name: string;
  email: string;
  avatarUrl: string | null;
  avatarBase: string | null;
};

type EnrollmentSummary = {
  id: string;
  role: 'STUDENT' | 'INSTRUCTOR' | 'CHECKER';
  status: 'PENDING' | 'ACTIVE';
  sections: string[];
  student: {
    id: string;
    name: string | null;
    email: string | null;
    externalId: string | null;
  };
};

export type CourseBadge = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

type CourseLesson = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  thumbnailUrl: string | null;
  sortOrder: number;
  segments?: Array<{ videoUrl: string | null }>;
  badgeRequirements: Array<{
    id: string;
    summary: string | null;
    badge: CourseBadge;
  }>;
};

type CourseDetail = {
  id: string;
  code: string | null;
  assessorCode: string | null;
  title: string;
  description: string | null;
  sectionCount: number;
  createdAt: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string | null;
    externalId: string | null;
    avatarBase: string | null;
  } | null;
  settings: {
    allowCooldownOverride: boolean;
    allowAssessorMessages: boolean;
    allowCrossSectionView: boolean;
  } | null;
  contacts: CourseContact[];
  enrollments: EnrollmentSummary[];
  lessons: CourseLesson[];
};

type CourseDetailResponse = {
  viewerRole: 'STUDENT' | 'INSTRUCTOR' | 'CHECKER';
  course: CourseDetail;
};

export function useCreatedCourseDetail(courseId?: string | null, email?: string | null) {
  const [data, setData] = useState<CourseDetailResponse | null>(null);
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
        throw new Error(payload.error ?? 'Unable to load course details.');
      }

      setData(payload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Unable to load course details.');
    } finally {
      setIsLoading(false);
    }
  }, [courseId, email]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refresh: fetchData };
}
