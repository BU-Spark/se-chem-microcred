'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import { LessonStatus } from '@prisma/client';
import { buildLessonOutline } from '@/lib/lessonOutline';
import { useStudentData, type BadgeRecord } from '../../hooks/useStudentData';
import styles from './page.module.css';
import BadgeOverviewCard from './components/BadgeOverviewCard';
import BadgeFlowSteps from './components/BadgeFlowSteps';
import LessonOutline from './components/LessonOutline';
import Sidebar, { SIDEBAR_NAV } from '@/app/components/Navigation/Sidebar';
import BackButton from '@/app/components/BackButton/BackButton';

function LessonDetailContent() {
  const router = useRouter();
  const params = useParams<{ lessonId: string }>();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');

  const { isLoaded, isSignedIn, user } = useUser();
  const signOut = useSignOut();
  const { data: studentData, isLoading } = useStudentData(user?.primaryEmailAddress?.emailAddress ?? null, courseId);
  const [isSigningOut, setIsSigningOut] = useState(false);
  // Redirect only after hooks have run
  const signedOut = isLoaded && !isSignedIn;
  useEffect(() => {
    if (signedOut && !isSigningOut) router.replace('/sign-in');
  }, [signedOut, isSigningOut, router]);

  const displayName = studentData?.student.name || '';

  const lessonRecord = studentData?.lessons.catalog.find((e) => e.slug === params.lessonId);

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/splash');
    } catch (error) {
      console.error('Failed to sign out', error);
      setIsSigningOut(false);
    }
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push('/');
  };

  // Parts, checkpoints and every derived runtime for this lesson.
  const outline = useMemo(() => buildLessonOutline(lessonRecord ?? null), [lessonRecord]);

  // The lesson's badge lives on the requirement, but its artwork and description
  // only exist on the student's badge records — which are bucketed by status.
  const badge = useMemo<BadgeRecord | null>(() => {
    const requirement = lessonRecord?.badgeRequirements?.[0];
    if (!requirement || !studentData) return null;

    const all = Object.values(studentData.badges).flat();
    return all.find((entry) => entry.id === requirement.badgeId || entry.slug === requirement.badgeSlug) ?? null;
  }, [lessonRecord, studentData]);

  if (!isLoaded || signedOut) return null;

  const title = lessonRecord?.title ?? (isLoading ? 'Loading lesson…' : 'Lesson unavailable');
  const skills = lessonRecord?.skills.map((skill) => skill.trim()).filter(Boolean) ?? [];
  const badgeName = badge?.name ?? lessonRecord?.badgeRequirements?.[0]?.badgeName ?? null;
  const description = lessonRecord?.description || lessonRecord?.summary || '';

  return (
    <div className="page">
      {/* Sidebar */}
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      {/* Main */}
      <main className="main">
        <div className={styles.root}>
          <header className={styles.header}>
            <BackButton onClick={handleBack} />
          </header>

          {lessonRecord ? (
            <div className={styles.layout}>
              {/* Left rail: what the lesson is, what it earns, and the CTA. */}
              <div className={styles.summaryColumn}>
                <div className={styles.titleBlock}>
                  <h1 className={styles.lessonTitle}>{title}</h1>
                  <p className={styles.totalTime}>
                    {outline.totalSeconds != null
                      ? `About ${outline.totalLabel} of video`
                      : 'Video length not recorded'}
                  </p>
                  {description ? <p className={styles.lessonSummary}>{description}</p> : null}
                </div>

                <BadgeOverviewCard
                  badgeName={badgeName}
                  badgeDescription={badge?.description ?? null}
                  badgeImageUrl={badge?.imageUrl}
                  badgeImagePositionX={badge?.imagePositionX}
                  badgeImagePositionY={badge?.imagePositionY}
                  skills={skills}
                />

                <BadgeFlowSteps />

                <div className={styles.statsSection}>
                  <dl className={styles.stats}>
                    <div className={styles.statRow}>
                      <dt>Parts</dt>
                      <dd>{outline.parts.length}</dd>
                    </div>
                    <div className={styles.statRow}>
                      <dt>Checkpoints</dt>
                      <dd>{outline.checkpointCount}</dd>
                    </div>
                    <div className={styles.statRow}>
                      <dt>Final survey</dt>
                      <dd>1</dd>
                    </div>
                    <div className={styles.statRow}>
                      <dt>Est. time</dt>
                      <dd>{outline.totalLabel}</dd>
                    </div>
                  </dl>
                  {outline.checkpointCount > 0 ? (
                    <p className={styles.statsHint}>
                      Finish every part and its checkpoint to unlock the closing survey.
                    </p>
                  ) : null}
                </div>

                <Link
                  href={
                    courseId
                      ? `/lessons/${lessonRecord.slug}/video?courseId=${encodeURIComponent(courseId)}`
                      : `/lessons/${lessonRecord.slug}/video`
                  }
                  className={styles.primaryButton}
                >
                  {lessonRecord.status === LessonStatus.COMPLETED ? 'Review Lesson' : 'Start Lesson'}
                </Link>
              </div>

              {/* Right rail: the ordered walkthrough. */}
              <div className={styles.outlineColumn}>
                <LessonOutline outline={outline} />
              </div>
            </div>
          ) : (
            <section className={styles.emptyState}>
              <h1 className={styles.lessonTitle}>{title}</h1>
              <p className={styles.lessonSummary}>
                {isLoading ? 'Loading lesson details…' : 'We could not find this lesson. Please head back to the list.'}
              </p>
              {!isLoading && (
                <Link href="/" className={styles.primaryButton}>
                  Browse Lessons
                </Link>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default function LessonDetailPage() {
  return (
    <Suspense fallback={null}>
      <LessonDetailContent />
    </Suspense>
  );
}
