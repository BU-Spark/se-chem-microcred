'use client';

import { useParams } from 'next/navigation';
import { useAuth } from '../../../hooks/useAuth';
import { useStudentData } from '../../../hooks/useStudentData';
import { LessonVideoPage } from '../video';
import { FALLBACK_LESSON } from '../page';

export default function LessonVideoRoute() {
  const params = useParams<{ lessonId: string }>();
  const { user } = useAuth();
  const { data: studentData } = useStudentData(user?.email);
  const lessonRecord =
    studentData?.lessons.catalog.find((entry) => entry.slug === (params.lessonId ?? '')) ?? FALLBACK_LESSON;

  const studentName = studentData?.student.name || user?.name || 'Student Demo';

  return <LessonVideoPage lesson={lessonRecord} studentName={studentName} />;
}
