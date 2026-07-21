'use client';

import { useCallback, useEffect, useState } from 'react';

type Contact = {
  id: string;
  type: 'INSTRUCTOR' | 'CHECKER';
  name: string;
  email: string;
  avatarUrl: string | null;
};

type StudentProfileResponse = {
  memberRole: 'STUDENT' | 'CHECKER' | 'INSTRUCTOR';
  member: {
    id: string;
    name: string | null;
    email: string | null;
    externalId: string | null;
    createdAt: string;
    avatar: {
      base: string;
      face: string;
      accessory: string | null;
    } | null;
  };
  course: {
    id: string;
    title: string;
    sections: string[];
    createdBy: {
      id: string;
      name: string | null;
      email: string | null;
      externalId: string | null;
    } | null;
  };
  contacts: Contact[];
};

type BadgeDetailResponse = {
  badge: {
    id: string;
    name: string;
    description: string | null;
    status: string;
  };
  progress: {
    percentComplete: number;
    precheckComplete: boolean;
    assessmentComplete: boolean;
    currentCheckpoint: string | null;
    totalCheckpoints: number;
    completedCheckpoints: number;
  };
  assessment?: {
    rubric: {
      goalId: string;
      goalName: string;
      instructions: string | null;
      subgoals: Array<{
        id: string;
        text: string;
        passThreshold: number;
        sortOrder: number;
        tasks: Array<{
          id: string;
          text: string;
          points: number;
          sortOrder: number;
        }>;
      }>;
    } | null;
  };
};

export function useAssessmentReadiness(
  courseId?: string | null,
  studentId?: string | null,
  badgeId?: string | null,
  email?: string | null
) {
  const [profile, setProfile] = useState<StudentProfileResponse | null>(null);
  const [badgeDetail, setBadgeDetail] = useState<BadgeDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!courseId || !studentId || !badgeId || !email) {
      setProfile(null);
      setBadgeDetail(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ email });
      const [profileResponse, badgeResponse] = await Promise.all([
        fetch(`/api/courses/${encodeURIComponent(courseId)}/students/${encodeURIComponent(studentId)}?${params}`, {
          headers: { Accept: 'application/json' },
        }),
        fetch(
          `/api/courses/${encodeURIComponent(courseId)}/students/${encodeURIComponent(studentId)}/badges/${encodeURIComponent(
            badgeId
          )}?${params}`,
          {
            headers: { Accept: 'application/json' },
          }
        ),
      ]);

      const profilePayload = await profileResponse.json().catch(() => ({
        error: `Request failed: ${profileResponse.status}`,
      }));
      const badgePayload = await badgeResponse.json().catch(() => ({
        error: `Request failed: ${badgeResponse.status}`,
      }));

      if (!profileResponse.ok) {
        throw new Error(profilePayload.error ?? 'Unable to load student profile.');
      }

      if (!badgeResponse.ok) {
        throw new Error(badgePayload.error ?? 'Unable to load badge readiness.');
      }

      setProfile(profilePayload);
      setBadgeDetail(badgePayload);
    } catch (err) {
      setProfile(null);
      setBadgeDetail(null);
      setError(err instanceof Error ? err.message : 'Unable to load assessment readiness.');
    } finally {
      setIsLoading(false);
    }
  }, [badgeId, courseId, email, studentId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { profile, badgeDetail, isLoading, error, refresh: fetchData };
}
