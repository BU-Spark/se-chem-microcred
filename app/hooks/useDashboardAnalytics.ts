'use client';

import useSWR from 'swr';

import { fetcher } from './lib/fetcher';

export type DashboardAnalytics = {
  instructor: {
    readyForAssessment: number;
    awaitingStudentReview: number;
    pendingCheckerRequests: number;
    upcomingDeadlines: number;
  };
  student: {
    lessonsNotStarted: number;
    lessonsInProgress: number;
    readyForAssessment: number;
    upcomingDeadlines: number;
    overdueLessons: number;
  };
  checker: {
    readyForAssessment: number;
    awaitingStudentReview: number;
    upcomingDeadlines: number;
  };
  byCourse: {
    instructor: Record<string, Record<string, number>>;
    student: Record<string, Record<string, number>>;
    checker: Record<string, Record<string, number>>;
  };
  windowDays: number;
};

export function useDashboardAnalytics(enabled: boolean) {
  const { data, error, isLoading, mutate } = useSWR<DashboardAnalytics>(
    enabled ? '/api/dashboard/analytics' : null,
    fetcher<DashboardAnalytics>,
    { revalidateOnFocus: false, dedupingInterval: 30000, keepPreviousData: true }
  );

  return { data, error, isLoading, mutate };
}
