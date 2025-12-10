'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useStudentData } from '../../../hooks/useStudentData';
import { LessonVideoPage } from '../video';

// Build a static avatar URL from AvatarSetting.
// Only "base" matters for the header icon.
function buildAvatarUrlFromAvatar(
  avatar?: { base: string; face: string; accessory: string | null } | null
): string | null {
  if (!avatar) return null;

  // base is something like "SAPPHIRE", "RUBY", etc.
  const baseLower = avatar.base.toLowerCase(); // -> "sapphire"

  // Files are under /public/assets/edit_avatar/<base>.svg
  return `../../../public/assets/edit_avatar/${baseLower}.svg`;
}

export default function LessonVideoRoute() {
  const params = useParams<{ lessonId: string }>();
  const { isLoaded, isSignedIn, user } = useUser();
  const { data: studentData, isLoading, error } = useStudentData(user?.primaryEmailAddress?.emailAddress);

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
        <Link href="/">Back to lessons</Link>
      </div>
    );
  }

  const lessonRecord = studentData.lessons.catalog.find((entry) => entry.slug === (params.lessonId ?? ''));

  if (!lessonRecord) {
    return (
      <div style={{ padding: '2rem' }}>
        <p>We could not find a lesson that matches this page.</p>
        <Link href="/">Back to lessons</Link>
      </div>
    );
  }

  const studentName = studentData.student.name || user?.fullName || 'Student Demo';
  const studentEmail = studentData.student.email || user?.primaryEmailAddress?.emailAddress || 'student@example.edu';
  const studentAvatar = studentData.student.avatar || null;
  const avatarUrl = buildAvatarUrlFromAvatar(studentAvatar);
  const lessonSurvey = studentData.surveys.lesson.find((survey) => survey.lessonSlug === lessonRecord.slug) ?? null;

  return (
    <LessonVideoPage
      lesson={lessonRecord}
      studentName={studentName}
      studentEmail={studentEmail}
      lessonSurvey={lessonSurvey}
      resumeRequested={false}
      studentAvatarUrl={avatarUrl}
    />
  );
}
