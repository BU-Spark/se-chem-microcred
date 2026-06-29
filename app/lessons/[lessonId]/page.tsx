'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import { useStudentData, type LessonRecord } from '../../hooks/useStudentData';
import styles from './page.module.css';
import finishLogo from '../../../public/assets/lesson/lesson_preview/finish_logo.svg';
import backArrow from '../../../public/assets/lesson/lesson_preview/back_arrow.svg';
import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';

function extractYouTubeId(url?: string | null) {
  if (!url) return null;
  const match =
    url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/) ?? url.match(/[?&]v=([\w-]{11})/);
  const candidate = match?.[1] ?? null;
  return candidate && candidate.length === 11 ? candidate : null;
}

function LessonDetailContent() {
  const router = useRouter();
  const params = useParams<{ lessonId: string }>();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');

  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();
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

  /**
   * Build one timeline item per checkpoint.
   * This matches the Figma: number of images = number of checkpoints.
   */
  type TimelineItem = {
    id: string;
    title: string;
    duration: string;
    cpLabel: string;
    cpMeta: string;
    img: string;
  };

  const { items: timelineItems, extraPart } = useMemo<{
    items: TimelineItem[];
    extraPart: { title: string; duration: string; img: string } | null;
  }>(() => {
    if (!lessonRecord) {
      return { items: [], extraPart: null };
    }

    const checkpoints = lessonRecord.checkpoints ?? [];
    const segments = lessonRecord.segments ?? [];
    const segmentById = new Map<string, LessonRecord['segments'][number]>();
    segments.forEach((seg) => {
      if (seg.id) {
        segmentById.set(seg.id, seg);
      }
    });

    // 所有 LessonSegment.duration 之和（假定单位是分钟）
    const totalSecondsFromSegments = segments.reduce(
      (sum: number, seg: LessonRecord['segments'][number]) =>
        sum + (typeof seg.duration === 'number' ? seg.duration * 60 : 0),
      0
    );

    const resolveSnapshot = (cpIndex: number) => {
      const cp = checkpoints[cpIndex];
      if (!cp) return '';
      // Prefer explicit checkpoint snapshot if present.
      if (cp.snapshotUrl) return cp.snapshotUrl;
      // Try the segment associated with this checkpoint.
      const seg = (cp.segmentId ? segmentById.get(cp.segmentId) : null) ?? segments[cpIndex] ?? segments[0] ?? null;
      const youtubeId = extractYouTubeId(seg?.videoUrl ?? lessonRecord.segments?.[0]?.videoUrl ?? null);
      if (youtubeId) {
        // YouTube exposes a few frame thumbnails: 0 (default), 1-3 midpoints. Map cp index to 1..3, clamp.
        const frame = Math.max(1, Math.min(3, cpIndex + 1));
        return `https://img.youtube.com/vi/${youtubeId}/${frame}.jpg`;
      }
      if (seg?.thumbnailUrl) return seg.thumbnailUrl;
      return lessonRecord.thumbnailUrl || '';
    };

    const items = checkpoints.map((cp, idx: number) => {
      const seg = segments[idx];

      const prevOffset = idx === 0 ? 0 : (checkpoints[idx - 1]?.timeOffsetSeconds ?? 0);

      const curOffset = cp.timeOffsetSeconds ?? prevOffset;

      let durationSeconds = curOffset - prevOffset;
      if (durationSeconds < 0) durationSeconds = 0;

      let durationMinutes: number | null = null;

      if (durationSeconds > 0) {
        durationMinutes = Math.round(durationSeconds / 60);
      } else if (typeof seg?.duration === 'number') {
        // fallback：用 segment.duration
        durationMinutes = seg.duration;
      }

      const durationText =
        durationMinutes != null ? `${durationMinutes} minute${durationMinutes === 1 ? '' : 's'} long` : 'Video segment';

      const title = `Part ${idx + 1}`;

      const img: string = resolveSnapshot(idx);

      return {
        id: cp.id ?? String(idx),
        title,
        duration: durationText,
        cpLabel: cp.label || 'Check point',
        cpMeta: cp.meta || `${cp.questionCount ?? 0} question${(cp.questionCount ?? 0) === 1 ? '' : 's'}`,
        img,
      };
    });

    // 计算最后一段（Part N+1），如果总时长 > 最后一个 checkpoint 时间
    let extraPart: null | { title: string; duration: string; img: string } = null;

    if (checkpoints.length > 0 && totalSecondsFromSegments > 0) {
      const lastOffset = checkpoints[checkpoints.length - 1]?.timeOffsetSeconds ?? 0;

      let tailSeconds = totalSecondsFromSegments - lastOffset;
      if (tailSeconds < 0) tailSeconds = 0;

      if (tailSeconds > 0) {
        const minutes = Math.round(tailSeconds / 60);
        const title = `Part ${checkpoints.length + 1}`;
        const duration = `${minutes} minute${minutes === 1 ? '' : 's'} long`;

        const extraSeg = segments[checkpoints.length] ?? segments.at(-1);
        const youtubeId =
          extractYouTubeId(extraSeg?.videoUrl ?? lessonRecord.segments?.[0]?.videoUrl ?? null) ??
          extractYouTubeId(lessonRecord.segments?.at(-1)?.videoUrl ?? null);
        const img: string = checkpoints[checkpoints.length - 1]?.snapshotUrl
          ? checkpoints[checkpoints.length - 1].snapshotUrl!
          : youtubeId
            ? `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`
            : extraSeg?.thumbnailUrl || lessonRecord.thumbnailUrl || '';

        extraPart = { title, duration, img };
      }
    }

    return { items, extraPart };
  }, [lessonRecord]);

  if (!isLoaded || signedOut) return null;

  const title = lessonRecord?.title ?? (isLoading ? 'Loading lesson…' : 'Lesson unavailable');

  return (
    <div className="page">
      {/* Sidebar */}
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      {/* Main */}
      <main className="main">
        <div className={styles.root}>
          <header className={styles.header}>
            <Link href="/" className={styles.backLink}>
              <span className={styles.backLinkContent}>
                <span className={styles.backText}>Back</span>
                <Image src={backArrow} alt="Back" className={styles.backArrow} width={52} height={12} />
              </span>
            </Link>
          </header>

          <h1 className={styles.lessonTitle}>{title}</h1>

          {lessonRecord ? (
            <>
              <section className={styles.section}>
                <h2 className={styles.sectionHeading}>About this unit:</h2>
                <p className={styles.body}>{lessonRecord.description}</p>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionHeading}>Skills you’ll learn</h2>
                <ul className={styles.bullets}>
                  {lessonRecord.skills.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </section>

              {/* Lesson outline: checkpoint thumbnails + connectors */}
              <section className={`${styles.section} ${styles.timelineSection}`}>
                {timelineItems.length > 0 && (
                  <div className={styles.timeline}>
                    {timelineItems.map((item) => (
                      <div key={item.id} className={styles.timelineGroup}>
                        <div className={styles.timelineItem}>
                          <div className={styles.thumb}>
                            {item.img ? (
                              <Image
                                src={item.img}
                                alt={item.title}
                                width={190}
                                height={120}
                                className={styles.thumbImg}
                              />
                            ) : (
                              <span className={styles.thumbPlaceholder}>Preview</span>
                            )}
                          </div>
                          <div className={styles.partTitle}>{item.title}</div>
                          <div className={styles.partDuration}>{item.duration}</div>
                        </div>

                        <div className={styles.timelineConnectorBlock}>
                          <div className={styles.timelineCheckpointLabel}>
                            <div>Checkpoint</div>
                            <div className={styles.timelineCheckpointMeta}>{item.cpMeta}</div>
                          </div>
                          <div className={styles.timelineConnector}>
                            <span className={styles.timelineLine} />
                            <span className={styles.timelineCircle} />
                            <span className={styles.timelineLine} />
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Final section — keep only ONE version */}
                    {extraPart ? (
                      <div className={styles.timelineGroup}>
                        <div className={styles.timelineItem}>
                          <div className={styles.thumb}>
                            {extraPart.img ? (
                              <Image
                                src={extraPart.img}
                                alt={extraPart.title}
                                width={190}
                                height={120}
                                className={styles.thumbImg}
                              />
                            ) : (
                              <span className={styles.thumbPlaceholder}>Preview</span>
                            )}
                          </div>
                          <div className={styles.partTitle}>{extraPart.title}</div>
                          <div className={styles.partDuration}>{extraPart.duration}</div>
                        </div>

                        <div className={styles.timelineEndBlock}>
                          <div className={styles.timelineCheckpointLabel}>
                            <div>End of lesson</div>
                            <div className={styles.timelineCheckpointMeta}>one survey</div>
                          </div>
                          <div className={styles.timelineConnector}>
                            <span className={styles.timelineLine} />
                            <div className={styles.timelineFinalCircle}>
                              <Image
                                src="/assets/lesson/lesson_preview/finish_logo.svg"
                                alt="End of lesson"
                                width={61}
                                height={62}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.timelineEndBlock}>
                        <div className={styles.timelineCheckpointLabel}>
                          <div>End of lesson</div>
                          <div className={styles.timelineCheckpointMeta}>one survey</div>
                        </div>
                        <div className={styles.timelineConnector}>
                          <span className={styles.timelineLine} />
                          <div className={styles.timelineFinalCircle}>
                            <Image src={finishLogo} alt="End of lesson" width={72} height={72} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <div className={styles.actionsRow}>
                <Link
                  href={
                    courseId
                      ? `/lessons/${lessonRecord.slug}/video?courseId=${encodeURIComponent(courseId)}`
                      : `/lessons/${lessonRecord.slug}/video`
                  }
                  className={styles.primaryButton}
                >
                  Start Lesson
                </Link>
              </div>
            </>
          ) : (
            <section className={styles.section}>
              <p className={styles.body}>
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
