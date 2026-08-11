'use client';

import { useState } from 'react';
import Image from 'next/image';

import { FACE_ALTS, FACE_IMAGES, RATING_VALUES } from '@/app/components/SurveyModal/faces';

import styles from './BadgeRatings.module.css';

export type RatingSummary = {
  count: number;
  average: number | null;
  distribution: Record<string, number>;
};

export type LessonRating = RatingSummary & {
  lessonId: string;
  title: string;
};

export type BadgeRatingsData = {
  badge: RatingSummary;
  qev: {
    overall: RatingSummary;
    lessons: LessonRating[];
  };
};

function responseLabel(count: number) {
  return `${count} response${count === 1 ? '' : 's'}`;
}

function faceFor(summary: RatingSummary) {
  if (summary.average == null) return null;

  return Math.min(5, Math.max(1, Math.round(summary.average)));
}

/** Average as an emoji face plus a 1–5 histogram, so a polarized split can't hide behind the mean. */
function RatingCard({
  title,
  hint,
  summary,
  children,
}: {
  title: string;
  hint: string;
  summary: RatingSummary;
  children?: React.ReactNode;
}) {
  const face = faceFor(summary);
  const peak = Math.max(1, ...RATING_VALUES.map((value) => summary.distribution[String(value)] ?? 0));

  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{title}</h3>
        <p className={styles.cardHint}>{hint}</p>
      </div>

      {summary.average == null ? (
        <p className={styles.empty}>No ratings yet.</p>
      ) : (
        <>
          <div className={styles.score}>
            {face ? <Image src={FACE_IMAGES[face]} alt={FACE_ALTS[face]} className={styles.scoreFace} /> : null}
            <p className={styles.scoreValue}>
              {summary.average.toFixed(1)}
              <span className={styles.scoreOutOf}>/ 5</span>
            </p>
            <p className={styles.scoreCount}>{responseLabel(summary.count)}</p>
          </div>

          <ol className={styles.histogram}>
            {[...RATING_VALUES].reverse().map((value) => {
              const responses = summary.distribution[String(value)] ?? 0;

              return (
                <li key={value} className={styles.histogramRow}>
                  <span className={styles.histogramLabel}>{value}</span>
                  <span className={styles.histogramTrack}>
                    <span className={styles.histogramFill} style={{ width: `${(responses / peak) * 100}%` }} />
                  </span>
                  <span className={styles.histogramCount}>{responses}</span>
                </li>
              );
            })}
          </ol>
        </>
      )}

      {children}
    </article>
  );
}

export default function BadgeRatings({ ratings }: { ratings: BadgeRatingsData }) {
  const [showLessons, setShowLessons] = useState(false);
  const { lessons } = ratings.qev;

  return (
    <section className={styles.section} aria-labelledby="badge-ratings-heading">
      <div className={styles.sectionHead}>
        <h2 id="badge-ratings-heading" className={styles.sectionTitle}>
          Ratings
        </h2>
        <p className={styles.sectionNote}>Students rate 1–5 after passing a lesson and after earning the badge.</p>
      </div>

      <div className={styles.grid}>
        <RatingCard
          title="QEV rating"
          hint={
            lessons.length === 1
              ? 'How students rated the lesson after passing it'
              : `Across all ${lessons.length} lessons this badge requires`
          }
          summary={ratings.qev.overall}
        >
          {lessons.length > 1 ? (
            <>
              <button
                type="button"
                className={styles.lessonToggle}
                onClick={() => setShowLessons((open) => !open)}
                aria-expanded={showLessons}
                aria-controls="qev-rating-lessons"
              >
                {showLessons ? 'Hide per-lesson ratings' : 'Show per-lesson ratings'}
              </button>

              <dl id="qev-rating-lessons" hidden={!showLessons} className={styles.lessonList}>
                {lessons.map((lesson) => (
                  <div key={lesson.lessonId} className={styles.lessonRow}>
                    <dt className={styles.lessonTitle}>{lesson.title}</dt>
                    <dd className={styles.lessonValue}>
                      {lesson.average == null ? '—' : lesson.average.toFixed(1)}
                      <span className={styles.lessonCount}>{responseLabel(lesson.count)}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
        </RatingCard>

        <RatingCard
          title="Badge rating"
          hint="How students rated the assessment after earning the badge"
          summary={ratings.badge}
        />
      </div>
    </section>
  );
}
