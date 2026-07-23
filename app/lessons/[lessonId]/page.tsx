'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import { LessonStatus } from '@prisma/client';
import { useStudentData, type LessonRecord } from '../../hooks/useStudentData';
import styles from './page.module.css';
import finishLogo from '../../../public/assets/lesson/lesson_preview/finish_logo.svg';
import Sidebar, { SIDEBAR_NAV } from '@/app/components/Navigation/Sidebar';
import BackButton from '@/app/components/BackButton/BackButton';

function extractYouTubeId(url?: string | null) {
  if (!url) return null;
  const match =
    url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/) ?? url.match(/[?&]v=([\w-]{11})/);
  const candidate = match?.[1] ?? null;
  return candidate && candidate.length === 11 ? candidate : null;
}

function formatQuestionCount(count?: number | null) {
  const safeCount = Math.max(0, Math.floor(count ?? 0));
  return `${safeCount} question${safeCount === 1 ? '' : 's'}`;
}

/** "3 minutes long" / "<1 minute long" for a segment's length (in seconds). */
function formatSegmentDuration(totalSeconds: number) {
  if (!totalSeconds || totalSeconds <= 0) return 'Video segment';
  if (totalSeconds < 60) return '<1 minute long';
  const minutes = Math.round(totalSeconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'} long`;
}

/** "~12 min" / "<1 min" / "—" for the lesson's total estimated time (in seconds). */
function formatEstTime(totalSeconds: number) {
  if (!totalSeconds || totalSeconds <= 0) return '—';
  if (totalSeconds < 60) return '<1 min';
  return `~${Math.round(totalSeconds / 60)} min`;
}

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

  const {
    items: timelineItems,
    extraPart,
    totalSeconds,
  } = useMemo<{
    items: TimelineItem[];
    extraPart: { title: string; duration: string; img: string } | null;
    totalSeconds: number;
  }>(() => {
    if (!lessonRecord) {
      return { items: [], extraPart: null, totalSeconds: 0 };
    }

    const checkpoints = lessonRecord.checkpoints ?? [];
    const segments = lessonRecord.segments ?? [];
    // Badge videos live on the requirement summary, not a segment (see bug #14). Fall back to
    // it so the timestamp-frame thumbnails below resolve instead of showing "Preview".
    const badgeVideoUrl = lessonRecord.badgeRequirements?.find((req) => req.youtubeUrl)?.youtubeUrl ?? null;
    const segmentById = new Map<string, LessonRecord['segments'][number]>();
    segments.forEach((seg) => {
      if (seg.id) {
        segmentById.set(seg.id, seg);
      }
    });

    // Sum of every LessonSegment.duration. These are stored in SECONDS (see badge.service /
    // badge-import.service, which write parseTimeToSeconds output), so no unit conversion here.
    const totalSecondsFromSegments = segments.reduce(
      (sum: number, seg: LessonRecord['segments'][number]) =>
        sum + (typeof seg.duration === 'number' ? seg.duration : 0),
      0
    );

    const resolveSnapshot = (cpIndex: number) => {
      const cp = checkpoints[cpIndex];
      if (!cp) return '';
      // Prefer explicit checkpoint snapshot if present.
      if (cp.snapshotUrl) return cp.snapshotUrl;
      // Try the segment associated with this checkpoint.
      const seg = (cp.segmentId ? segmentById.get(cp.segmentId) : null) ?? segments[cpIndex] ?? segments[0] ?? null;
      const youtubeId = extractYouTubeId(seg?.videoUrl ?? lessonRecord.segments?.[0]?.videoUrl ?? badgeVideoUrl);
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

      // Fall back to the segment's own stored length (also in seconds) when the checkpoint
      // offsets don't yield a positive span.
      if (durationSeconds <= 0 && typeof seg?.duration === 'number') {
        durationSeconds = seg.duration;
      }

      const durationText = formatSegmentDuration(durationSeconds);

      const title = `Part ${idx + 1}`;

      const img: string = resolveSnapshot(idx);

      return {
        id: cp.id ?? String(idx),
        title,
        duration: durationText,
        cpLabel: 'Checkpoint',
        cpMeta: formatQuestionCount(cp.questions?.length || cp.questionCount),
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
        const title = `Part ${checkpoints.length + 1}`;
        const duration = formatSegmentDuration(tailSeconds);

        const extraSeg = segments[checkpoints.length] ?? segments.at(-1);
        const youtubeId =
          extractYouTubeId(extraSeg?.videoUrl ?? lessonRecord.segments?.[0]?.videoUrl ?? null) ??
          extractYouTubeId(lessonRecord.segments?.at(-1)?.videoUrl ?? badgeVideoUrl);
        const img: string = checkpoints[checkpoints.length - 1]?.snapshotUrl
          ? checkpoints[checkpoints.length - 1].snapshotUrl!
          : youtubeId
            ? `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`
            : extraSeg?.thumbnailUrl || lessonRecord.thumbnailUrl || '';

        extraPart = { title, duration, img };
      }
    }

    return { items, extraPart, totalSeconds: totalSecondsFromSegments };
  }, [lessonRecord]);

  if (!isLoaded || signedOut) return null;

  const title = lessonRecord?.title ?? (isLoading ? 'Loading lesson…' : 'Lesson unavailable');
  const skills = lessonRecord?.skills.map((skill) => skill.trim()).filter(Boolean) ?? [];

  // Parts = one card per checkpoint, plus the optional trailing segment (extraPart).
  const partsCount = timelineItems.length + (extraPart ? 1 : 0);
  // Steps shown in the outline = every part card plus the closing survey step.
  const stepCount = partsCount + 1;
  // Prefer the summed segment length (seconds) so sub-minute lessons read "<1 min"; fall back
  // to the coarser stored estimatedMinutes when segments carry no duration.
  const estSeconds = totalSeconds > 0 ? totalSeconds : (lessonRecord?.estimatedMinutes ?? 0) * 60;
  const estTime = formatEstTime(estSeconds);

  const videoHref = lessonRecord
    ? courseId
      ? `/lessons/${lessonRecord.slug}/video?courseId=${encodeURIComponent(courseId)}`
      : `/lessons/${lessonRecord.slug}/video`
    : '#';

  const renderPartCard = (part: { id?: string; title: string; duration: string; img: string }) => (
    <div key={part.id ?? part.title} className={styles.stepCard}>
      <div className={styles.stepThumb}>
        {part.img ? (
          <Image src={part.img} alt={part.title} width={112} height={72} className={styles.thumbImg} />
        ) : (
          <span className={styles.thumbPlaceholder}>Thumbnail</span>
        )}
      </div>
      <div className={styles.stepText}>
        <div className={styles.stepTitle}>{part.title}</div>
        <div className={styles.stepDuration}>{part.duration}</div>
      </div>
    </div>
  );

  return (
    <div className="page">
      {/* Sidebar */}
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      {/* Main */}
      <main className="main">
        {lessonRecord ? (
          <div className={styles.previewCard}>
            <aside className={styles.aside}>
              <BackButton onClick={handleBack} />

              <h1 className={styles.title}>{title}</h1>
              <p className={styles.desc}>{lessonRecord.description || 'Get ready to explore this lesson.'}</p>

              {skills.length > 0 ? (
                <>
                  <hr className={styles.divider} />
                  <div className={styles.skills}>
                    <span className={styles.railLabel}>Skills you’ll learn</span>
                    <ul className={styles.pills}>
                      {skills.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}

              <hr className={styles.divider} />
              <dl className={styles.stats}>
                <div className={styles.statRow}>
                  <dt>Parts</dt>
                  <dd>{partsCount}</dd>
                </div>
                <div className={styles.statRow}>
                  <dt>Checkpoints</dt>
                  <dd>{lessonRecord.checkpoints?.length ?? timelineItems.length}</dd>
                </div>
                <div className={styles.statRow}>
                  <dt>Final survey</dt>
                  <dd>1</dd>
                </div>
                <div className={styles.statRow}>
                  <dt>Est. time</dt>
                  <dd>{estTime}</dd>
                </div>
              </dl>

              <p className={styles.note}>
                Finish {partsCount === 1 ? 'the part' : 'both parts'} and their checkpoints to unlock the closing
                survey.
              </p>

              <Link href={videoHref} className={styles.primaryButton}>
                {lessonRecord.status === LessonStatus.COMPLETED ? 'Review Lesson' : 'Start Lesson'}
              </Link>
            </aside>

            <section className={styles.outline}>
              <h2 className={styles.outlineHeading}>Lesson outline</h2>
              <p className={styles.outlineSub}>
                {stepCount} step{stepCount === 1 ? '' : 's'}, in order
              </p>

              <div className={styles.steps}>
                {timelineItems.map((item) => (
                  <div key={item.id} className={styles.stepGroup}>
                    {renderPartCard(item)}
                    <div className={styles.checkpoint}>
                      <span className={styles.checkpointDot} />
                      <span className={styles.checkpointText}>
                        {item.cpLabel} · {item.cpMeta}
                      </span>
                    </div>
                  </div>
                ))}

                {extraPart ? renderPartCard(extraPart) : null}

                <div className={styles.endCard}>
                  <div className={styles.endLogo}>
                    <Image src={finishLogo} alt="End of lesson" width={40} height={40} />
                  </div>
                  <div className={styles.endText}>
                    <div className={styles.endTitle}>End of lesson</div>
                    <div className={styles.endMeta}>One survey</div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className={styles.fallback}>
            <BackButton onClick={handleBack} />
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.desc}>
              {isLoading ? 'Loading lesson details…' : 'We could not find this lesson. Please head back to the list.'}
            </p>
            {!isLoading && (
              <Link href="/" className={styles.primaryButton}>
                Browse Lessons
              </Link>
            )}
          </div>
        )}
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
