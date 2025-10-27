'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '../../../hooks/useAuth';
import { useStudentData } from '../../../hooks/useStudentData';
import { LessonVideoPage } from '../video';

export default function LessonVideoRoute() {
  const params = useParams<{ lessonId: string }>();
  const { isLoaded, isSignedIn, user } = useAuth();
  const { data: studentData, isLoading, error } = useStudentData(user?.email);

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

  const studentName = studentData.student.name || user?.name || 'Student Demo';
  const studentEmail = studentData.student.email || user?.email || 'student@example.edu';

  return <LessonVideoPage lesson={lessonRecord} studentName={studentName} studentEmail={studentEmail} />;
}
