'use client';

import { Suspense, useMemo, useState } from 'react';
import { LessonStatus } from '@prisma/client';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import { useStudentData } from '../../../hooks/useStudentData';
import { LessonVideoPage } from '../video';
import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';

function buildAvatarUrlFromAvatar(
  avatar?: { base: string; face: string; accessory: string | null } | null
): string | null {
  if (!avatar) return null;

  return `/assets/edit_avatar/${avatar.base.toLowerCase()}.svg`;
}

function LessonVideoRouteContent() {
  const params = useParams<{ lessonId: string }>();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const signOut = useSignOut();
  const { data: studentData, isLoading, error } = useStudentData(user?.primaryEmailAddress?.emailAddress, courseId);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const lessonRecord = studentData?.lessons.catalog.find((entry) => entry.slug === (params.lessonId ?? '')) ?? null;
  const summaryVideoUrl =
    lessonRecord?.badgeRequirements.find((requirement) => requirement.youtubeUrl)?.youtubeUrl ?? null;
  const lessonForVideo = useMemo(
    () =>
      lessonRecord && summaryVideoUrl && !lessonRecord.segments.some((segment) => segment.videoUrl)
        ? {
            ...lessonRecord,
            segments: lessonRecord.segments.length
              ? lessonRecord.segments.map((segment, index) =>
                  index === 0
                    ? {
                        ...segment,
                        videoUrl: summaryVideoUrl,
                      }
                    : segment
                )
              : [
                  {
                    id: `${lessonRecord.id}-video`,
                    title: lessonRecord.title,
                    summary: lessonRecord.summary,
                    duration: null,
                    videoUrl: summaryVideoUrl,
                    muxPlaybackId: null,
                    thumbnailUrl: lessonRecord.thumbnailUrl,
                    status: 'NOT_STARTED' as const,
                    checkpointIds: lessonRecord.checkpoints.map((checkpoint) => checkpoint.id),
                  },
                ],
          }
        : lessonRecord,
    [lessonRecord, summaryVideoUrl]
  );

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push('/');
  };

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  if (isLoading) {
    return null;
  }

  if (!studentData) {
    return (
      <div style={{ padding: '2rem' }}>
        <p>We could not load your lesson data{error ? `: ${error}` : '.'}</p>
        <button type="button" onClick={handleBack}>
          Back to lessons
        </button>
      </div>
    );
  }

  if (!lessonRecord) {
    return (
      <div style={{ padding: '2rem' }}>
        <p>We could not find a lesson that matches this page.</p>
        <button type="button" onClick={handleBack}>
          Back to lessons
        </button>
      </div>
    );
  }

  if (!lessonForVideo) {
    return (
      <div style={{ padding: '2rem' }}>
        <p>We could not load the lesson video for this page.</p>
        <button type="button" onClick={handleBack}>
          Back to lessons
        </button>
      </div>
    );
  }

  const studentName = studentData.student.name || user?.fullName || 'Student Demo';
  const studentEmail = studentData.student.email || user?.primaryEmailAddress?.emailAddress;
  const studentAvatar = studentData.student.avatar || null;
  const avatarUrl = buildAvatarUrlFromAvatar(studentAvatar);
  const lessonSurvey = studentData.surveys.lesson.find((survey) => survey.lessonSlug === lessonRecord.slug) ?? null;
  // A completed lesson is re-entered in "review" mode: free rewatch from the start,
  // unlocked scrubber, non-blocking checkpoints the student may re-open for practice.
  const reviewMode = lessonRecord.status === LessonStatus.COMPLETED;

  if (!studentEmail) {
    return (
      <div style={{ padding: '2rem' }}>
        <p>We could not determine your student email for this lesson.</p>
        <button type="button" onClick={handleBack}>
          Back to lessons
        </button>
      </div>
    );
  }

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/splash');
    } catch (error) {
      console.error('Sign out failed', error);
      setIsSigningOut(false);
    }
  };

  return (
    <div className="page">
      <Sidebar navItems={SIDEBAR_NAV} displayName={studentName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <LessonVideoPage
          lesson={lessonForVideo}
          studentName={studentName}
          studentEmail={studentEmail}
          lessonSurvey={lessonSurvey}
          resumeRequested={false}
          reviewMode={reviewMode}
          studentAvatarUrl={avatarUrl}
          studentId={studentData.student.id}
          courseId={studentData.course?.id ?? null}
        />
      </div>
    </div>
  );
}

export default function LessonVideoRoute() {
  return (
    <Suspense fallback={null}>
      <LessonVideoRouteContent />
    </Suspense>
  );
}
